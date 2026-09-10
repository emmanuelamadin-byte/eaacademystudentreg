import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AcademyUser,
  CourseModule,
  Lesson,
  ShopItem,
  ShopPurchase,
  ShopCourseProgress,
  ShopCertificate,
} from "@/lib/types";
import { calculateStreak } from "@/lib/streaks";
import {
  actor,
  claimStudentRoster,
  db,
  document,
  limit,
  reserveCritique,
  reserveReview,
  setStudentBirthday,
  type AuthToken,
} from "./supabase";
import {
  ApiError,
  canReadLesson,
  hasPremium,
  initialRole,
  managesTrack,
  MONTHLY_CRITIQUE_LIMIT,
  MONTHLY_REVIEW_LIMIT,
  OWNER_EMAIL,
  requireAdmin,
  requireTrackStaff,
  utcMonthKey,
} from "./policy";
import * as s from "./schemas";
import { askAI } from "./ai";
import { checkout, verifyPayment, manageSubscription } from "./payments";
import {
  createBroadcast,
  listBroadcasts,
  processMessageQueue,
  saveCommunicationPreferences,
} from "./communications";
import {
  getCountries,
  isValidPhoneNumber,
  parsePhoneNumber,
  type CountryCode,
} from "libphonenumber-js";

type Payload = Record<string, unknown>;
const now = () => new Date().toISOString();
const parsedId = (p: Payload) => s.id.parse(p.id);
const clean = (value: object) => JSON.parse(JSON.stringify(value));
async function save(
  collection: string,
  value: { id?: string },
  user: AcademyUser,
  classId: string,
) {
  requireTrackStaff(user, classId);
  const ref = value.id
    ? db().collection(collection).doc(value.id)
    : db().collection(collection).doc();
  if (value.id) {
    const before = await document(collection, value.id);
    requireTrackStaff(user, String(before.classId));
    if (before.classId !== classId)
      throw new ApiError(
        400,
        "Existing content cannot be moved between tracks.",
      );
  }
  await ref.set(clean({ ...value, id: ref.id, updatedAt: now() }), {
    merge: true,
  });
  return { id: ref.id };
}
export async function getLesson(
  user: AcademyUser,
  id: string,
): Promise<Lesson> {
  const lesson = (await document("lessons", id)) as unknown as Lesson;
  const courseModule = await document("modules", lesson.moduleId);
  if (
    !canReadLesson(user, lesson, {
      published: courseModule.published === true,
      free: courseModule.free === true,
    })
  )
    throw new ApiError(
      403,
      "This lesson requires an active Premium membership or is not yet published.",
    );
  if (!managesTrack(user, lesson.classId)) {
    delete lesson.solutionCode;
    lesson.free = lesson.free && courseModule.free === true;
  }
  return lesson;
}

export async function listClassroomLessons(
  user: AcademyUser,
): Promise<Lesson[]> {
  const [lessonSnapshot, moduleSnapshot] = await Promise.all([
    db().collection("lessons").where("published", "==", true).get(),
    db().collection("modules").get(),
  ]);
  const modules = new Map(
    moduleSnapshot.docs.map((item) => [item.id, item.data() as CourseModule]),
  );

  return lessonSnapshot.docs.flatMap((item) => {
    const lesson = { ...item.data(), id: item.id } as Lesson;
    const courseModule = modules.get(lesson.moduleId);
    if (
      !courseModule ||
      !canReadLesson(user, lesson, {
        published: courseModule.published === true,
        free: courseModule.free === true,
      })
    )
      return [];
    if (!managesTrack(user, lesson.classId)) delete lesson.solutionCode;
    lesson.free = lesson.free && courseModule.free === true;
    return [lesson];
  });
}
async function ensureProfile(token: AuthToken, p: Payload) {
  const input = z
    .object({
      name: s.short.optional(),
      enrolledClassId: s.track.optional(),
      countryCode: z
        .string()
        .length(2)
        .transform((value) => value.toUpperCase())
        .refine(
          (value) => getCountries().includes(value as CountryCode),
          "Choose a valid country.",
        )
        .optional(),
      phoneNumber: z.string().trim().min(4).max(30).optional(),
      birthday: s.birthday.optional(),
    })
    .parse(p);
  const ref = db().collection("users").doc(token.uid);
  const normalizedEmail = token.email?.trim().toLowerCase();
  const canClaimRoster =
    token.provider === "google" &&
    token.email_verified === true &&
    Boolean(normalizedEmail);
  const rosterData =
    canClaimRoster && normalizedEmail
      ? await claimStudentRoster(normalizedEmail, token.uid)
      : undefined;
  const rosterCanBeClaimed = Boolean(rosterData);
  await db().runTransaction(async (tx) => {
    const previous = await tx.get(ref);
    const role = initialRole(token.email, token.email_verified);
    const complete =
      previous.exists &&
      (previous.data()?.role === "Admin" || previous.data()?.enrolledClassId);
    if (complete) {
      const updates: Record<string, unknown> = { lastActiveAt: now() };
      // Enrollment is deliberately immutable, including when ensure is retried.
      if (role === "Admin" && previous.data()?.role !== "Admin")
        Object.assign(updates, { role: "Admin", email: token.email });
      if (
        role === "Admin" &&
        !s.track.safeParse(previous.data()?.enrolledClassId).success
      )
        updates.enrolledClassId = "system-dev";
      tx.update(ref, updates);
      return;
    }
    if (token.provider !== "google")
      throw new ApiError(403, "Use Google to create an EA Academy account.");
    const settings = await tx.get(db().collection("settings").doc("public"));
    if (
      settings.data()?.enrollmentOpen === false &&
      role !== "Admin" &&
      !rosterCanBeClaimed
    )
      throw new ApiError(403, "New enrollment is currently closed.");
    if (!input.enrolledClassId && role !== "Admin" && !rosterCanBeClaimed)
      throw new ApiError(
        409,
        "Choose your permanent primary track to finish enrollment.",
      );
    if (
      role !== "Admin" &&
      !rosterCanBeClaimed &&
      (!input.countryCode || !input.phoneNumber || !input.birthday)
    )
      throw new ApiError(
        409,
        "Add your country, phone number, and birthday to finish enrollment.",
      );
    let phoneNumber: string | undefined;
    if (input.countryCode && input.phoneNumber) {
      const country = input.countryCode as CountryCode;
      if (!isValidPhoneNumber(input.phoneNumber, country))
        throw new ApiError(
          400,
          "Enter a valid phone number for the country you selected.",
        );
      phoneNumber = parsePhoneNumber(input.phoneNumber, country).number;
    }
    const rosterPhone =
      rosterCanBeClaimed && typeof rosterData?.phoneNumber === "string"
        ? rosterData.phoneNumber
        : undefined;
    const rosterWhatsappConsent =
      rosterCanBeClaimed &&
      rosterData?.phoneReviewRequired !== true &&
      rosterData?.whatsappConsent === true &&
      Boolean(rosterPhone);
    const enrolledAt =
      rosterCanBeClaimed && typeof rosterData?.enrolledAt === "string"
        ? rosterData.enrolledAt
        : now();
    tx.set(
      ref,
      {
        id: token.uid,
        name:
          (rosterCanBeClaimed && String(rosterData?.name || "").trim()) ||
          input.name ||
          token.name ||
          "Academy learner",
        email: normalizedEmail || "",
        role,
        enrolledClassId:
          (rosterCanBeClaimed && rosterData?.enrolledClassId) ||
          input.enrolledClassId ||
          "system-dev",
        membershipPlan: "Free",
        enrolledAt,
        lastActiveAt: now(),
        ...((rosterCanBeClaimed && rosterData?.countryCode) || input.countryCode
          ? {
              countryCode:
                (rosterCanBeClaimed && rosterData?.countryCode) ||
                input.countryCode,
            }
          : {}),
        ...(rosterPhone || phoneNumber
          ? { phoneNumber: rosterPhone || phoneNumber }
          : {}),
        ...(input.birthday ? { birthday: input.birthday } : {}),
        ...(rosterCanBeClaimed
          ? {
              emailNotificationsEnabled: true,
              birthdayEmailEnabled: true,
              whatsappNotificationsEnabled: rosterWhatsappConsent,
              birthdayWhatsappEnabled: false,
              ...(rosterWhatsappConsent
                ? {
                    whatsappOptedInAt: enrolledAt,
                    communicationConsentVersion:
                      rosterData?.communicationConsentVersion,
                  }
                : {}),
            }
          : {}),
      },
      { merge: true },
    );
  });
  return actor(token);
}
export async function dispatch(
  token: AuthToken,
  action: string,
  p: Payload,
): Promise<unknown> {
  if (action === "profile.ensure") return ensureProfile(token, p);
  const user = await actor(token);
  await limit(user.id, "writes", 120);
  switch (action) {
    case "track.save": {
      const input = z
        .object({
          classId: s.track,
          instructorName: z.string().trim().max(100),
          instructorBio: z.string().trim().max(1500),
          instructorAvatarUrl: s.optionalUrl,
        })
        .parse(p);
      requireTrackStaff(user, input.classId);
      await db()
        .collection("trackProfiles")
        .doc(input.classId)
        .set(clean({ ...input, id: input.classId }));
      return { id: input.classId };
    }
    case "profile.update": {
      const name = s.short.parse(p.name);
      await db().collection("users").doc(user.id).update({ name });
      return { name };
    }
    case "profile.timezone": {
      const timeZone = s.timeZone.parse(p.timeZone);
      await db().collection("users").doc(user.id).update({ timeZone });
      return { timeZone };
    }
    case "profile.birthday": {
      const birthday = s.birthday.parse(p.birthday);
      return setStudentBirthday(user.id, birthday.month, birthday.day);
    }
    case "communications.update": {
      const preferences = z
        .object({
          emailNotificationsEnabled: z.boolean(),
          birthdayEmailEnabled: z.boolean(),
          whatsappNotificationsEnabled: z.boolean(),
          birthdayWhatsappEnabled: z.boolean(),
          whatsappConsent: z.boolean(),
        })
        .parse(p.preferences);
      return saveCommunicationPreferences(user.id, preferences);
    }
    case "broadcast.list": {
      requireAdmin(user);
      return listBroadcasts();
    }
    case "broadcast.send": {
      requireAdmin(user);
      const input = z
        .object({
          title: s.short,
          message: z.string().trim().min(1).max(5000),
          audience: z.enum(["all", "track", "free", "premium"]),
          trackId: s.track.optional(),
          channels: z
            .array(z.enum(["in-app", "email", "whatsapp"]))
            .min(1)
            .max(3)
            .transform((channels) => [...new Set(channels)]),
          actionPath: z
            .string()
            .regex(/^\/app(?:\/[a-zA-Z0-9_/-]*)?$/)
            .optional(),
          whatsappTemplate: z
            .string()
            .trim()
            .regex(/^[a-z0-9_]{1,512}$/)
            .optional(),
          scheduledFor: s.date.optional(),
        })
        .refine(
          (value) => value.audience !== "track" || Boolean(value.trackId),
          {
            message: "Choose a career path for this audience.",
            path: ["trackId"],
          },
        )
        .refine(
          (value) =>
            !value.channels.includes("in-app") ||
            ["all", "track"].includes(value.audience),
          {
            message:
              "In-app delivery supports all students or one career path. Use email or WhatsApp for membership audiences.",
            path: ["channels"],
          },
        )
        .parse(p);
      const result = await createBroadcast(user, input);
      if (!input.scheduledFor || Date.parse(input.scheduledFor) <= Date.now())
        return { ...result, delivery: await processMessageQueue(20) };
      return result;
    }
    case "broadcast.process": {
      requireAdmin(user);
      return processMessageQueue(50);
    }
    case "streak.get": {
      const progress = await db()
        .collection("progress")
        .where("studentId", "==", user.id)
        .get();
      const completedAt = progress.docs
        .map((item) => item.data().completedAt)
        .filter((value): value is string => typeof value === "string");
      return calculateStreak(completedAt, {
        timeZone: user.timeZone || "UTC",
      });
    }
    case "users.update": {
      requireAdmin(user);
      const input = z
        .object({
          id: s.id,
          role: z.enum(["Student", "Instructor"]).optional(),
          enrolledClassId: s.track.optional(),
          premiumGranted: z.boolean().optional(),
          instructorTrackIds: z.array(s.track).max(3).optional(),
        })
        .parse(p);
      const target = await document("users", input.id);
      if (
        target.role === "Admin" ||
        String(target.email).toLowerCase() === OWNER_EMAIL
      )
        throw new ApiError(
          403,
          "The sole administrator account cannot be changed here.",
        );
      // Only this owner-authorized action may correct enrollment. Students cannot change it.
      const { id, ...updates } = input;
      await db().collection("users").doc(id).update(clean(updates));
      return { id };
    }
    case "lesson.get":
      return getLesson(user, parsedId(p));
    case "classroom.list":
      return listClassroomLessons(user);
    case "module.save": {
      const value = s.moduleSchema.parse(p.module);
      return save("modules", value, user, value.classId);
    }
    case "module.delete": {
      const id = parsedId(p),
        value = await document("modules", id);
      requireTrackStaff(user, String(value.classId));
      const lessons = await db()
        .collection("lessons")
        .where("moduleId", "==", id)
        .limit(1)
        .get();
      if (!lessons.empty)
        throw new ApiError(409, "Delete the lessons in this module first.");
      await db().collection("modules").doc(id).delete();
      return { id };
    }
    case "class.post": {
      const value = s.classPostSchema.parse(p.post);
      requireTrackStaff(user, value.classId);
      let moduleId = value.moduleId;
      if (moduleId) {
        const courseModule = await document("modules", moduleId);
        if (courseModule.classId !== value.classId)
          throw new ApiError(400, "Choose a module in the same track.");
      } else {
        const existingModules = await db()
          .collection("modules")
          .where("classId", "==", value.classId)
          .limit(1)
          .get();
        moduleId = existingModules.docs[0]?.id;
        if (!moduleId) {
          const moduleRef = db().collection("modules").doc();
          moduleId = moduleRef.id;
          await moduleRef.set({
            id: moduleId,
            classId: value.classId,
            title: "Classroom posts",
            description:
              "Recorded classes, instructor videos, and learning updates.",
            order: 0,
            published: true,
            free: true,
          });
        }
      }
      if (value.assignmentId) {
        const assignment = await document("assignments", value.assignmentId);
        if (
          assignment.classId !== value.classId ||
          assignment.published !== true
        )
          throw new ApiError(
            400,
            "Choose a published assignment from the same track.",
          );
      }
      const existingLessons = await db()
        .collection("lessons")
        .where("moduleId", "==", moduleId)
        .get();
      const order =
        Math.max(
          0,
          ...existingLessons.docs.map((item) => Number(item.data().order || 0)),
        ) + 1;
      const ref = db().collection("lessons").doc();
      const timestamp = now();
      await ref.set(
        clean({
          id: ref.id,
          moduleId,
          classId: value.classId,
          assignmentId: value.assignmentId,
          title: value.title,
          content: value.content,
          videoUrl: value.videoUrl,
          duration: value.duration || "Self-paced",
          resources: value.resources,
          initialCode: "",
          solutionCode: "",
          order,
          published: true,
          free: value.free,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      );
      const notification = db().collection("notifications").doc();
      await notification.set({
        id: notification.id,
        title: `New class: ${value.title}`,
        message: "A new recorded class is ready in your track.",
        type: "system",
        targetTrack: value.classId,
        priority: "normal",
        actionScreen: `/app/lesson/${ref.id}`,
        createdAt: timestamp,
        pwaPushSent: false,
        pushDelivered: 0,
      });
      return { id: ref.id, moduleId };
    }
    case "class.update": {
      const { id, post } = s.classUpdateSchema.parse(p);
      const lesson = await document("lessons", id);
      requireTrackStaff(user, String(lesson.classId));
      requireTrackStaff(user, post.classId);

      const targetModuleId = post.moduleId || String(lesson.moduleId);
      const courseModule = await document("modules", targetModuleId);
      if (courseModule.classId !== post.classId)
        throw new ApiError(400, "Choose a module in the same track.");

      if (post.assignmentId) {
        const assignment = await document("assignments", post.assignmentId);
        if (
          assignment.classId !== post.classId ||
          assignment.published !== true
        )
          throw new ApiError(
            400,
            "Choose a published assignment from the same track.",
          );
      }

      const timestamp = now();
      const updates = clean({
        classId: post.classId,
        moduleId: targetModuleId,
        assignmentId: post.assignmentId || undefined,
        title: post.title,
        content: post.content,
        videoUrl: post.videoUrl,
        duration: post.duration || "Self-paced",
        resources: post.resources,
        free: post.free,
        updatedAt: timestamp,
      });

      await db().collection("lessons").doc(id).update(updates);

      const moduleRef = db().collection("modules").doc(targetModuleId);
      const modSnap = await moduleRef.get();
      if (modSnap.exists) {
        const modData = modSnap.data();
        if (Array.isArray(modData?.lessons)) {
          const existingSummary = modData.lessons.find(
            (l: { id: string }) => l.id === id,
          );
          const order = existingSummary?.order ?? (lesson.order || 0);
          const updatedSummaries = modData.lessons
            .filter((l: { id: string }) => l.id !== id)
            .concat([
              {
                id,
                title: post.title,
                duration: post.duration || "Self-paced",
                order,
                free: post.free,
              },
            ])
            .sort(
              (a: { order: number }, b: { order: number }) => a.order - b.order,
            );
          await moduleRef.update({
            lessons: updatedSummaries,
            lessonCount: updatedSummaries.length,
          });
        }
      }

      return { id, moduleId: targetModuleId };
    }
    case "lesson.save": {
      const value = s.lessonSchema.parse(p.lesson);
      requireTrackStaff(user, value.classId);
      const ref = value.id
        ? db().collection("lessons").doc(value.id)
        : db().collection("lessons").doc();
      await db().runTransaction(async (tx) => {
        const moduleRef = db().collection("modules").doc(value.moduleId);
        const [module, before] = await Promise.all([
          tx.get(moduleRef),
          tx.get(ref),
        ]);
        if (!module.exists || module.data()?.classId !== value.classId)
          throw new ApiError(400, "Choose a module in the same track.");
        if (
          before.exists &&
          (before.data()?.moduleId !== value.moduleId ||
            before.data()?.classId !== value.classId)
        )
          throw new ApiError(
            400,
            "Move lessons by creating them in the destination module.",
          );
        const summaries = (module.data()?.lessons || []).filter(
          (l: { id: string }) => l.id !== ref.id,
        );
        if (value.published)
          summaries.push({
            id: ref.id,
            title: value.title,
            duration: value.duration,
            order: value.order,
            free: value.free,
          });
        summaries.sort(
          (a: { order: number }, b: { order: number }) => a.order - b.order,
        );
        tx.set(ref, clean({ ...value, id: ref.id }));
        tx.update(moduleRef, {
          lessons: summaries,
          lessonCount: summaries.length,
        });
      });
      return { id: ref.id };
    }
    case "lesson.delete": {
      const id = parsedId(p),
        lesson = await document("lessons", id);
      requireTrackStaff(user, String(lesson.classId));
      const moduleRef = db().collection("modules").doc(String(lesson.moduleId));
      await db().runTransaction(async (tx) => {
        const courseModule = await tx.get(moduleRef);
        const summaries = (courseModule.data()?.lessons || []).filter(
          (l: { id: string }) => l.id !== id,
        );
        tx.delete(db().collection("lessons").doc(id));
        if (courseModule.exists)
          tx.update(moduleRef, {
            lessons: summaries,
            lessonCount: summaries.length,
          });
      });
      return { id };
    }
    case "assignment.save": {
      const value = s.assignmentSchema.parse(p.assignment);
      return save("assignments", value, user, value.classId);
    }
    case "assignment.delete": {
      const id = parsedId(p),
        value = await document("assignments", id);
      requireTrackStaff(user, String(value.classId));
      await db().collection("assignments").doc(id).delete();
      return { id };
    }
    case "progress.complete": {
      const lesson = await getLesson(user, s.id.parse(p.lessonId));
      const id = `${user.id}_${lesson.id}`;
      await db().collection("progress").doc(id).set({
        id,
        studentId: user.id,
        lessonId: lesson.id,
        moduleId: lesson.moduleId,
        classId: lesson.classId,
        completedAt: now(),
      });
      return { id };
    }
    case "submission.save": {
      const value = s.submissionSchema.parse(p.submission),
        assignment = await document("assignments", value.assignmentId);
      if (assignment.published !== true)
        throw new ApiError(403, "This assignment is not open for submission.");
      const premium = hasPremium(user);
      if (
        !premium &&
        (assignment.classId !== user.enrolledClassId ||
          assignment.starter !== true)
      )
        throw new ApiError(
          403,
          "Free includes starter assignments in your primary track. Premium unlocks every assignment.",
        );
      if (
        value.status === "submitted" &&
        !value.writeUp.trim() &&
        !value.repoUrl &&
        !value.attachments.length
      )
        throw new ApiError(400, "Add your work before submitting.");
      const attachments = value.attachments.map((path) =>
        path.startsWith("/api/upload?path=")
          ? decodeURIComponent(path.slice("/api/upload?path=".length))
          : path,
      );
      if (
        attachments.some(
          (path) =>
            !path.startsWith(`uploads/${user.id}/`) || path.includes(".."),
        )
      )
        throw new ApiError(400, "Attachments must belong to your account.");
      const previousSubmissions = await db()
          .collection("submissions")
          .where("studentId", "==", user.id)
          .where("assignmentId", "==", value.assignmentId)
          .limit(1)
          .get(),
        id = previousSubmissions.docs[0]?.id || randomUUID(),
        ref = db().collection("submissions").doc(id),
        reviewPeriod = utcMonthKey();
      let reviewEligible = false;
      let reviewsRemaining = premium ? MONTHLY_REVIEW_LIMIT : 0;
      const before = await ref.get();
      if (
        before.exists &&
        ["under-review", "graded"].includes(before.data()?.status)
      )
        throw new ApiError(
          409,
          "Reviewed submissions can no longer be edited.",
        );
      const alreadyEligible = before.data()?.reviewEligible === true;
      if (alreadyEligible && value.status === "draft")
        throw new ApiError(
          409,
          "A requested instructor review cannot be returned to draft status.",
        );
      reviewEligible =
        alreadyEligible || (premium && value.status === "submitted");
      if (reviewEligible && !alreadyEligible) {
        reviewsRemaining = await reserveReview(
          user.id,
          reviewPeriod,
          id,
          MONTHLY_REVIEW_LIMIT,
        );
        if (reviewsRemaining < 0)
          throw new ApiError(
            429,
            `Premium includes ${MONTHLY_REVIEW_LIMIT} instructor reviews each month. Your allowance resets next month.`,
          );
      }
      await ref.set(
        clean({
          ...value,
          id,
          attachments,
          studentId: user.id,
          studentName: user.name,
          classId: assignment.classId,
          reviewEligible,
          ...(reviewEligible ? { reviewPeriod } : {}),
          submittedAt: before.data()?.submittedAt || now(),
          updatedAt: now(),
        }),
      );
      return { id, reviewEligible, reviewsRemaining };
    }
    case "submission.review":
    case "submission.grade": {
      const id = parsedId(p),
        submission = await document("submissions", id);
      requireTrackStaff(user, String(submission.classId));
      if (submission.reviewEligible !== true)
        throw new ApiError(
          403,
          "This practice submission does not include an instructor review.",
        );
      if (submission.status === "draft")
        throw new ApiError(
          409,
          "The student has not submitted this draft yet.",
        );
      const updates =
        action === "submission.review"
          ? { status: "under-review" }
          : {
              ...z
                .object({
                  grade: z.number().min(0).max(100),
                  feedback: s.body,
                  lineFeedback: z
                    .array(
                      z.object({
                        line: z.number().int().positive(),
                        comment: s.short,
                      }),
                    )
                    .max(200)
                    .optional(),
                  rubric: z
                    .array(
                      z.object({
                        criterion: s.short,
                        score: z.number().min(0).max(100),
                      }),
                    )
                    .max(30)
                    .optional(),
                })
                .parse(p),
              status: "graded",
              gradedBy: user.id,
            };
      await db()
        .collection("submissions")
        .doc(id)
        .update(clean({ ...updates, updatedAt: now() }));
      return { id };
    }
    case "discussion.create": {
      const value = z
        .object({
          title: s.short,
          body: s.body,
          classId: s.track,
          lessonId: s.id.optional(),
        })
        .parse(p);
      if (value.lessonId) {
        const lesson = await getLesson(user, value.lessonId);
        if (lesson.classId !== value.classId)
          throw new ApiError(400, "Discussion track must match its lesson.");
      }
      const ref = db().collection("discussions").doc();
      await ref.set({
        ...value,
        id: ref.id,
        authorId: user.id,
        authorName: user.name,
        createdAt: now(),
      });
      return { id: ref.id };
    }
    case "comment.create": {
      const value = z.object({ parentId: s.id, body: s.body }).parse(p);
      const [discussion, project] = await Promise.all([
        db().collection("discussions").doc(value.parentId).get(),
        db().collection("projects").doc(value.parentId).get(),
      ]);
      if (!discussion.exists && !project.exists)
        throw new ApiError(404, "This discussion or project no longer exists.");
      const ref = db().collection("comments").doc();
      await ref.set({
        body: value.body,
        ...(discussion.exists
          ? { discussionId: value.parentId }
          : { projectId: value.parentId }),
        id: ref.id,
        authorId: user.id,
        authorName: user.name,
        createdAt: now(),
      });
      return { id: ref.id };
    }
    case "project.create": {
      const value = z
          .object({
            title: s.short,
            description: s.body,
            url: s.url,
            classId: s.track,
          })
          .parse(p),
        ref = db().collection("projects").doc();
      await ref.set({
        ...value,
        id: ref.id,
        authorId: user.id,
        authorName: user.name,
        votes: 0,
        createdAt: now(),
      });
      return { id: ref.id };
    }
    case "project.critique.request": {
      if (!hasPremium(user))
        throw new ApiError(403, "Premium unlocks portfolio critiques.");
      const id = parsedId(p),
        period = utcMonthKey(),
        projectRef = db().collection("projects").doc(id),
        critiqueRef = db().collection("projectCritiques").doc(id);
      const [project, critique] = await Promise.all([
        projectRef.get(),
        critiqueRef.get(),
      ]);
      if (!project.exists) throw new ApiError(404, "Project not found.");
      if (project.data()?.authorId !== user.id)
        throw new ApiError(
          403,
          "You can request critique only for your own project.",
        );
      if (critique.exists)
        throw new ApiError(409, "This project already has a critique request.");
      const remaining = await reserveCritique(
        user.id,
        period,
        id,
        MONTHLY_CRITIQUE_LIMIT,
      );
      if (remaining < 0)
        throw new ApiError(
          429,
          "Premium includes one new portfolio critique each month.",
        );
      await critiqueRef.create({
        id,
        projectId: id,
        studentId: user.id,
        studentName: user.name,
        classId: project.data()?.classId,
        status: "requested",
        requestedAt: now(),
      });
      return { id };
    }
    case "project.critique.respond": {
      const id = parsedId(p),
        feedback = s.body.parse(p.feedback),
        critique = await document("projectCritiques", id);
      requireTrackStaff(user, String(critique.classId));
      await db().collection("projectCritiques").doc(id).update({
        feedback,
        status: "completed",
        completedAt: now(),
        reviewedBy: user.id,
      });
      return { id };
    }
    case "project.vote": {
      const id = parsedId(p),
        ref = db().collection("projects").doc(id),
        vote = db().collection("votes").doc(`${user.id}_${id}`);
      await db().runTransaction(async (tx) => {
        const [project, existing] = await Promise.all([
          tx.get(ref),
          tx.get(vote),
        ]);
        if (!project.exists) throw new ApiError(404, "Project not found.");
        if (existing.exists) {
          tx.delete(vote);
        } else {
          tx.create(vote, { projectId: id, studentId: user.id });
        }
      });
      return { id };
    }
    case "community.delete": {
      const value = z
          .object({
            collection: z.enum(["discussions", "comments", "projects"]),
            id: s.id,
          })
          .parse(p),
        item = await document(value.collection, value.id);
      if (item.authorId !== user.id) requireAdmin(user);
      await db().collection(value.collection).doc(value.id).delete();
      if (value.collection === "projects")
        await db().collection("projectCritiques").doc(value.id).delete();
      return { id: value.id };
    }
    case "session.save": {
      const value = s.sessionSchema.parse(p.session);
      if (value.classId === "all") requireAdmin(user);
      const { url, recordingUrl, ...metadata } = value;
      const result = await save("sessions", metadata, user, value.classId);
      await db()
        .collection("sessionLinks")
        .doc(result.id)
        .set({ url, recordingUrl });
      return result;
    }
    case "session.get":
    case "session.join":
    case "session.recording": {
      const id = parsedId(p),
        value = await document("sessions", id);
      if (action === "session.get")
        requireTrackStaff(user, String(value.classId));
      else if (!hasPremium(user))
        throw new ApiError(403, "Premium unlocks live mentor sessions.");
      const link = await document("sessionLinks", id);
      if (action === "session.recording" && !link.recordingUrl)
        throw new ApiError(
          404,
          "A recording has not been added for this session.",
        );
      return action === "session.get"
        ? { ...value, url: link.url, recordingUrl: link.recordingUrl || "" }
        : { url: action === "session.join" ? link.url : link.recordingUrl };
    }
    case "session.delete": {
      const id = parsedId(p),
        value = await document("sessions", id);
      requireTrackStaff(user, String(value.classId));
      const batch = db().batch();
      batch.delete(db().collection("sessions").doc(id));
      batch.delete(db().collection("sessionLinks").doc(id));
      await batch.commit();
      return { id };
    }
    case "notification.send": {
      requireAdmin(user);
      const value = z
        .object({
          title: s.short,
          message: s.body,
          targetTrack: s.audience,
          priority: z.enum(["normal", "high"]).default("normal"),
          actionScreen: z
            .string()
            .regex(/^\/app(?:\/[a-zA-Z0-9_/-]*)?$/)
            .optional(),
        })
        .parse(p);
      const ref = db().collection("notifications").doc();
      await ref.set(
        clean({
          ...value,
          id: ref.id,
          type: "announcement",
          createdAt: now(),
          pwaPushSent: false,
          pushDelivered: 0,
        }),
      );
      return { id: ref.id, pushDelivered: 0 };
    }
    case "settings.save": {
      requireAdmin(user);
      const value = s.settingsSchema.parse(p.settings);
      const { whatsappGroupUrl, ...publicSettings } = value;
      await db()
        .collection("settings")
        .doc("public")
        .set(publicSettings, { merge: true });
      await db()
        .collection("settings")
        .doc("community")
        .set({ whatsappGroupUrl: whatsappGroupUrl || "" }, { merge: true });
      return value;
    }
    case "settings.get": {
      requireAdmin(user);
      const [publicSettings, communitySettings] = await Promise.all([
        db().collection("settings").doc("public").get(),
        db().collection("settings").doc("community").get(),
      ]);
      return {
        ...(publicSettings.data() || {}),
        whatsappGroupUrl: communitySettings.data()?.whatsappGroupUrl || "",
      };
    }
    case "onboarding.welcome": {
      const community = await db()
        .collection("settings")
        .doc("community")
        .get();
      return {
        whatsappGroupUrl: community.data()?.whatsappGroupUrl || "",
      };
    }
    case "ai.ask":
      return askAI(user, p);
    case "billing.checkout":
      return checkout(user, p);
    case "billing.verify":
      return verifyPayment(
        user,
        z
          .string()
          .regex(/^[a-zA-Z0-9_.-]{1,160}$/)
          .parse(p.reference),
      );
    case "billing.manage":
      return manageSubscription(user);
    case "transcript.issue": {
      if (!hasPremium(user))
        throw new ApiError(
          403,
          "An active Premium membership is required to issue a verified learning record.",
        );
      const [progress, grades] = await Promise.all([
        db().collection("progress").where("studentId", "==", user.id).get(),
        db()
          .collection("submissions")
          .where("studentId", "==", user.id)
          .where("status", "==", "graded")
          .get(),
      ]);
      if (progress.empty && grades.empty)
        throw new ApiError(
          409,
          "Complete a lesson or receive an assignment rating before issuing your record.",
        );
      const moduleIds = [
        ...new Set(progress.docs.map((d) => String(d.data().moduleId))),
      ];
      const modules = await Promise.all(
        moduleIds.map((id) => db().collection("modules").doc(id).get()),
      );
      const id = randomUUID();
      const data = {
        id,
        studentId: user.id,
        studentName: user.name,
        primaryTrack: user.enrolledClassId,
        issuedAt: now(),
        completedLessons: progress.size,
        modules: modules
          .filter((m) => m.exists)
          .map((m) => ({
            title: m.data()!.title,
            classId: m.data()!.classId,
            completedLessons: progress.docs.filter(
              (p) => p.data().moduleId === m.id,
            ).length,
          })),
        ratings: grades.docs.map((d) => ({
          assignmentId: d.data().assignmentId,
          rating: d.data().grade,
        })),
        averageRating: grades.size
          ? Math.round(
              grades.docs.reduce((sum, d) => sum + Number(d.data().grade), 0) /
                grades.size,
            )
          : null,
      };
      await db().collection("transcripts").doc(id).set(data);
      return { ...data, url: `/verify/${id}` };
    }
    case "shop.admin.list":
      return listAdminShopItems(user);
    case "shop.admin.get":
      return getAdminShopItem(user, parsedId(p));
    case "shop.admin.save":
      return saveShopItem(user, p.item);
    case "shop.admin.delete":
      return deleteShopItem(user, parsedId(p));
    case "shop.library":
      return getStudentLibrary(user);
    case "shop.course.get":
      return getShopCourse(user, z.string().parse(p.courseId || p.id));
    case "shop.course.progress":
      return updateShopProgress(user, p);
    case "shop.certificate.get":
      return getShopCertificate(user, parsedId(p));
    default:
      throw new ApiError(400, "Unknown academy action.");
  }
}

export async function listPublicShopItems() {
  const snapshot = await db()
    .collection("shopItems")
    .where("published", "==", true)
    .get();
  return snapshot.docs
    .map((d) => {
      const data = d.data() as ShopItem;
      if (data.type === "course" && Array.isArray(data.curriculum)) {
        data.curriculum = data.curriculum.map((m) => ({
          ...m,
          lessons: (m.lessons || []).map((l) => ({
            ...l,
            videoUrl: l.isFreePreview ? l.videoUrl : "",
            content: l.isFreePreview ? l.content : "",
            resources: l.isFreePreview ? l.resources : [],
          })),
        }));
      }
      return { ...data, id: d.id };
    })
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function getPublicShopItem(slug: string) {
  const snapshot = await db()
    .collection("shopItems")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (snapshot.empty) throw new ApiError(404, "Product or course not found.");
  const doc = snapshot.docs[0];
  const data = doc.data() as ShopItem;
  if (!data.published) throw new ApiError(404, "Product or course not found.");
  if (data.type === "course" && Array.isArray(data.curriculum)) {
    data.curriculum = data.curriculum.map((m) => ({
      ...m,
      lessons: (m.lessons || []).map((l) => ({
        ...l,
        videoUrl: l.isFreePreview ? l.videoUrl : "",
        content: l.isFreePreview ? l.content : "",
        resources: l.isFreePreview ? l.resources : [],
      })),
    }));
  }
  return { ...data, id: doc.id };
}

async function listAdminShopItems(user: AcademyUser) {
  requireAdmin(user);
  const snapshot = await db().collection("shopItems").get();
  return snapshot.docs
    .map((d) => ({ ...d.data(), id: d.id }) as ShopItem)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

async function getAdminShopItem(user: AcademyUser, id: string) {
  requireAdmin(user);
  const doc = await db().collection("shopItems").doc(id).get();
  if (!doc.exists) throw new ApiError(404, "Shop item not found.");
  return { ...doc.data(), id: doc.id } as ShopItem;
}

async function saveShopItem(user: AcademyUser, item: unknown) {
  requireAdmin(user);
  const value = s.shopItemSchema.parse(item);
  const slugSnapshot = await db()
    .collection("shopItems")
    .where("slug", "==", value.slug)
    .get();
  for (const doc of slugSnapshot.docs) {
    if (value.id && doc.id !== value.id) {
      throw new ApiError(409, "A course or product with this slug already exists.");
    }
    if (!value.id) {
      throw new ApiError(409, "A course or product with this slug already exists.");
    }
  }
  const ref = value.id
    ? db().collection("shopItems").doc(value.id)
    : db().collection("shopItems").doc();
  const existing = value.id ? (await ref.get()).data() : null;
  const record = clean({
    ...value,
    id: ref.id,
    salesCount: typeof existing?.salesCount === "number" ? existing.salesCount : 0,
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  });
  await ref.set(record, { merge: true });
  return { id: ref.id, slug: value.slug };
}

async function deleteShopItem(user: AcademyUser, id: string) {
  requireAdmin(user);
  await db().collection("shopItems").doc(id).delete();
  return { id };
}

async function getStudentLibrary(user: AcademyUser) {
  const purchasesSnap = await db()
    .collection("shopPurchases")
    .where("studentId", "==", user.id)
    .get();
  const purchases = purchasesSnap.docs.map((d) => ({
    ...d.data(),
    id: d.id,
  })) as ShopPurchase[];

  const items = await Promise.all(
    purchases.map(async (p) => {
      const doc = await db().collection("shopItems").doc(p.itemId).get();
      return doc.exists ? ({ ...doc.data(), id: doc.id } as ShopItem) : null;
    }),
  );

  const courseIds = purchases
    .filter((p) => p.itemType === "course")
    .map((p) => p.itemId);
  const progressSnap = await Promise.all(
    courseIds.map((cid) =>
      db().collection("shopCourseProgress").doc(`${user.id}_${cid}`).get(),
    ),
  );
  const progressMap = Object.fromEntries(
    progressSnap
      .filter((p) => p.exists)
      .map((p) => [p.data()!.courseId, p.data()! as ShopCourseProgress]),
  );

  const courses = purchases
    .filter((p) => p.itemType === "course")
    .map((p) => {
      const item = items.find((it) => it && it.id === p.itemId);
      const prog = progressMap[p.itemId] || null;
      let totalLessons = 0;
      if (item && Array.isArray(item.curriculum)) {
        totalLessons = item.curriculum.reduce(
          (sum, mod) => sum + (mod.lessons?.length || 0),
          0,
        );
      }
      const completedCount = prog?.completedLessonIds?.length || 0;
      const percent =
        totalLessons > 0
          ? Math.min(100, Math.round((completedCount / totalLessons) * 100))
          : 0;
      return {
        purchase: p,
        item,
        progress: prog,
        totalLessons,
        completedCount,
        percent,
      };
    });

  const digitalProducts = purchases
    .filter((p) => p.itemType === "digital_product")
    .map((p) => {
      const item = items.find((it) => it && it.id === p.itemId);
      return {
        purchase: p,
        item,
      };
    });

  return { courses, digitalProducts };
}

async function getShopCourse(user: AcademyUser, courseId: string) {
  const courseDoc = await db().collection("shopItems").doc(courseId).get();
  if (!courseDoc.exists) throw new ApiError(404, "Course not found.");
  const courseData = courseDoc.data() as ShopItem;
  if (courseData.type !== "course")
    throw new ApiError(400, "This item is not a course.");

  const isStaff = user.role === "Admin" || user.role === "Instructor";
  if (!isStaff) {
    const purchase = await db()
      .collection("shopPurchases")
      .doc(`${user.id}_${courseId}`)
      .get();
    if (!purchase.exists) {
      throw new ApiError(
        403,
        "You must purchase this course to access its classroom lessons.",
      );
    }
  }

  const progressDoc = await db()
    .collection("shopCourseProgress")
    .doc(`${user.id}_${courseId}`)
    .get();

  return {
    course: { ...courseData, id: courseDoc.id },
    progress: progressDoc.exists
      ? (progressDoc.data() as ShopCourseProgress)
      : null,
  };
}

async function updateShopProgress(user: AcademyUser, p: Payload) {
  const input = s.shopProgressUpdateSchema.parse(p);
  const isStaff = user.role === "Admin" || user.role === "Instructor";
  if (!isStaff) {
    const purchase = await db()
      .collection("shopPurchases")
      .doc(`${user.id}_${input.courseId}`)
      .get();
    if (!purchase.exists) {
      throw new ApiError(403, "You have not purchased this course.");
    }
  }

  const courseDoc = await db().collection("shopItems").doc(input.courseId).get();
  if (!courseDoc.exists) throw new ApiError(404, "Course not found.");
  const course = courseDoc.data() as ShopItem;

  const allLessons: string[] = [];
  (course.curriculum || []).forEach((mod) => {
    (mod.lessons || []).forEach((lesson) => {
      if (lesson.id) allLessons.push(lesson.id);
    });
  });

  const progRef = db()
    .collection("shopCourseProgress")
    .doc(`${user.id}_${input.courseId}`);
  const currentSnap = await progRef.get();
  const currentProg = currentSnap.data() as ShopCourseProgress | undefined;

  let completedIds: string[] = currentProg?.completedLessonIds || [];
  if (input.completed) {
    if (!completedIds.includes(input.lessonId)) {
      completedIds = [...completedIds, input.lessonId];
    }
  } else {
    completedIds = completedIds.filter((id) => id !== input.lessonId);
  }

  const isAllCompleted =
    allLessons.length > 0 && allLessons.every((id) => completedIds.includes(id));
  let certificateId = currentProg?.certificateId || null;

  if (isAllCompleted && !certificateId && course.certificateEnabled !== false) {
    certificateId = randomUUID();
    const certRef = db().collection("shopCertificates").doc(certificateId);
    await certRef.set({
      id: certificateId,
      studentId: user.id,
      studentName: user.name,
      courseId: input.courseId,
      courseTitle: course.title,
      issuedAt: now(),
      verificationCode: `EACERT-${certificateId.slice(0, 8).toUpperCase()}`,
    });
  }

  const updated: ShopCourseProgress = {
    id: `${user.id}_${input.courseId}`,
    studentId: user.id,
    courseId: input.courseId,
    completedLessonIds: completedIds,
    lastLessonId: input.lessonId,
    completed: isAllCompleted,
    completedAt: isAllCompleted ? currentProg?.completedAt || now() : undefined,
    certificateId: certificateId || undefined,
  };

  await progRef.set(clean(updated), { merge: true });
  return { progress: updated, certificateId };
}

async function getShopCertificate(user: AcademyUser, id: string) {
  const certDoc = await db().collection("shopCertificates").doc(id).get();
  if (!certDoc.exists) throw new ApiError(404, "Certificate not found.");
  const cert = certDoc.data() as ShopCertificate;
  if (cert.studentId !== user.id && user.role !== "Admin") {
    throw new ApiError(403, "Access denied to this certificate.");
  }
  return cert;
}
