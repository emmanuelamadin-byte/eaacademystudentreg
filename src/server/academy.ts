import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AcademyUser,
  CourseModule,
  Lesson,
  ShopItem,
  ShopCourseModule,
  ShopChapterQuizQuestion,
  ShopChapterQuizResult,
  ShopQuizAttempt,
  ShopQuizQuestionFeedback,
  ShopCourseQuizAnalytics,
  ShopCourseQuizStudentStat,
  ShopPurchase,
  ShopCourseProgress,
  ShopCertificate,
  VideoAd,
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
import { askAI, generateChapterQuiz } from "./ai";
import { checkout, verifyPayment, manageSubscription } from "./payments";
import {
  createBroadcast,
  listBroadcasts,
  notifyOwnerOfNewStudent,
  processMessageQueue,
  saveCommunicationPreferences,
} from "./communications";
import { savePushToken, removePushToken } from "./push";
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
  let isNewUser = false;
  await db().runTransaction(async (tx) => {
    const previous = await tx.get(ref);
    const prevData = previous.data();
    const role = initialRole(token.email, token.email_verified);
    const complete =
      previous.exists &&
      (prevData?.role === "Admin" || prevData?.enrolledClassId);
    if (complete) {
      const updates: Record<string, unknown> = { lastActiveAt: now() };
      // Enrollment is deliberately immutable, including when ensure is retried.
      if (role === "Admin" && prevData?.role !== "Admin")
        Object.assign(updates, { role: "Admin", email: token.email });
      if (
        role === "Admin" &&
        !s.track.safeParse(prevData?.enrolledClassId).success
      )
        updates.enrolledClassId = "system-dev";
      tx.update(ref, updates);
      return;
    }
    isNewUser = !previous.exists;
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

    const hasActivePremium =
      (prevData?.premiumUntil && Date.parse(prevData.premiumUntil) > Date.now()) ||
      prevData?.membershipPlan === "Premium" ||
      prevData?.premiumGranted === true;

    const membershipPlan = hasActivePremium
      ? "Premium"
      : prevData?.membershipPlan || "Free";

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
        membershipPlan,
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
  const profile = await actor(token);
  // Fire-and-forget owner notification — only for genuinely new students
  if (isNewUser && (input.enrolledClassId || rosterCanBeClaimed)) {
    const { TRACKS } = await import("@/lib/types");
    const enrolledId =
      (rosterCanBeClaimed && rosterData?.enrolledClassId) ||
      input.enrolledClassId ||
      "system-dev";
    const trackName =
      (TRACKS as { id: string; name: string }[]).find(
        (t) => t.id === enrolledId,
      )?.name || enrolledId;
    notifyOwnerOfNewStudent({
      ownerEmail: OWNER_EMAIL,
      studentName: profile.name || token.name || "New student",
      studentEmail: normalizedEmail || "",
      trackName,
    }).catch(() => {});
  }
  return profile;
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
    case "push.subscribe": {
      const subscription = z
        .object({
          endpoint: z.string().url(),
          expirationTime: z.number().nullable().optional(),
          keys: z.object({
            p256dh: z.string().min(1),
            auth: z.string().min(1),
          }),
        })
        .parse(p.subscription);
      return savePushToken(user, subscription);
    }
    case "push.unsubscribe": {
      const endpoint = z.string().url().parse(p.endpoint);
      return removePushToken(user, endpoint);
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
      if (!premium)
        throw new ApiError(
          403,
          "Assignment submission and instructor reviews are exclusively for Premium students. Please upgrade to Premium.",
        );
      if (
        value.status === "submitted" &&
        !value.writeUp.trim() &&
        !value.repoUrl &&
        !value.attachments.length
      )
        throw new ApiError(400, "Add your work before submitting.");
      if (value.attachments.length > 5)
        throw new ApiError(
          400,
          "A maximum of 5 attachments is allowed per submission.",
        );
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
      const sanitizedWriteUp = value.writeUp
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .trim();
      await ref.set(
        clean({
          ...value,
          id,
          writeUp: sanitizedWriteUp,
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
      if (
        user.role === "Student" &&
        !hasPremium(user) &&
        value.classId !== user.enrolledClassId
      ) {
        throw new ApiError(
          403,
          "Free students can only post discussions in their enrolled career path.",
        );
      }
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
      if (discussion.exists) {
        const discData = discussion.data() as { classId?: string } | undefined;
        if (
          user.role === "Student" &&
          !hasPremium(user) &&
          discData?.classId &&
          discData.classId !== user.enrolledClassId
        ) {
          throw new ApiError(
            403,
            "Free students can only comment on discussions in their enrolled career path.",
          );
        }
      }
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
    case "shop.admin.quiz.generate":
      return generateChapterQuiz(user, p);
    case "shop.admin.quiz.analytics":
      return getShopCourseQuizAnalytics(
        user,
        z.string().parse(p.courseId || p.id),
      );
    case "shop.library":
      return getStudentLibrary(user);
    case "shop.course.get":
      return getShopCourse(user, z.string().parse(p.courseId || p.id));
    case "shop.course.progress":
      return updateShopProgress(user, p);
    case "shop.course.quiz.submit":
      return submitShopCourseQuiz(user, p);
    case "shop.certificate.get":
      return getShopCertificate(user, parsedId(p));
    case "ad.admin.list":
      return listAdminAds(user);
    case "ad.admin.save":
      return saveAdminAd(user, p.ad);
    case "ad.admin.delete":
      return deleteAdminAd(user, parsedId(p));
    case "ad.serve":
      return serveLessonAd(user, p);
    case "ad.click":
      return recordAdClick(user, parsedId(p));
    default:
      throw new ApiError(400, "Unknown academy action.");
  }
}

function getActiveModuleQuestions(mod: ShopCourseModule): ShopChapterQuizQuestion[] {
  if (!mod.quiz || !mod.quiz.enabled || !Array.isArray(mod.quiz.questions)) {
    return [];
  }
  const all = mod.quiz.questions;
  const reqCount = mod.quiz.requiredQuestionsCount;
  if (typeof reqCount === "number" && reqCount > 0 && reqCount < all.length) {
    return all.slice(0, reqCount);
  }
  return all;
}

function sanitizeCurriculumForStudent(
  curriculum: ShopCourseModule[] | undefined,
  stripLessonContent = false,
): ShopCourseModule[] {
  if (!Array.isArray(curriculum)) return [];
  return curriculum.map((m) => {
    const activeQuestions = getActiveModuleQuestions(m);
    return {
      ...m,
      lessons: (m.lessons || []).map((l) =>
        stripLessonContent
          ? {
              ...l,
              videoUrl: l.isFreePreview ? l.videoUrl : "",
              content: l.isFreePreview ? l.content : "",
              resources: l.isFreePreview ? l.resources : [],
            }
          : l,
      ),
      quiz: m.quiz
        ? {
            ...m.quiz,
            questions: activeQuestions.map((q) => ({
              id: q.id,
              type: q.type,
              question: q.question,
              options: q.options,
              points: q.points || 1,
            })),
          }
        : undefined,
    };
  });
}

function evaluateCourseCompletionAndEligibility(
  course: ShopItem,
  completedLessonIds: string[],
  quizResults: Record<string, ShopChapterQuizResult> = {},
) {
  const allLessons: string[] = [];
  const requiredQuizModules: ShopCourseModule[] = [];

  (course.curriculum || []).forEach((mod) => {
    (mod.lessons || []).forEach((lesson) => {
      if (lesson.id) allLessons.push(lesson.id);
    });
    const activeQuestions = getActiveModuleQuestions(mod);
    if (
      mod.quiz &&
      mod.quiz.enabled &&
      mod.quiz.required !== false &&
      activeQuestions.length > 0
    ) {
      requiredQuizModules.push(mod);
    }
  });

  const allLessonsCompleted =
    allLessons.length > 0 &&
    allLessons.every((id) => completedLessonIds.includes(id));

  let overallQuizScore = 0;
  let overallQuizTotal = 0;
  let completedRequiredQuizzesCount = 0;

  if (requiredQuizModules.length > 0) {
    for (const mod of requiredQuizModules) {
      const activeQuestions = getActiveModuleQuestions(mod);
      const modTotal = activeQuestions.length;
      overallQuizTotal += modTotal;
      const res = quizResults[mod.id];
      if (res && res.attemptsCount > 0) {
        completedRequiredQuizzesCount += 1;
        overallQuizScore += Number(res.effectiveScore || 0);
      }
    }
  } else {
    // If no required quizzes, aggregate any optional quizzes attempted
    for (const mod of course.curriculum || []) {
      const res = quizResults[mod.id];
      if (res && res.attemptsCount > 0) {
        overallQuizScore += Number(res.effectiveScore || 0);
        overallQuizTotal += Number(res.totalQuestions || 0);
      }
    }
  }

  const allRequiredQuizzesCompleted =
    requiredQuizModules.length === 0 ||
    completedRequiredQuizzesCount >= requiredQuizModules.length;

  const overallQuizPercentage =
    overallQuizTotal > 0
      ? Math.round((overallQuizScore / overallQuizTotal) * 100)
      : 100;

  const quizScoreRequirementMet =
    requiredQuizModules.length === 0 || overallQuizPercentage >= 50;

  const eligibleForCertificate =
    allLessonsCompleted &&
    allRequiredQuizzesCompleted &&
    quizScoreRequirementMet;

  return {
    allLessonsCompleted,
    allRequiredQuizzesCompleted,
    requiredQuizzesCount: requiredQuizModules.length,
    completedRequiredQuizzesCount,
    overallQuizScore: Math.round(overallQuizScore * 100) / 100,
    overallQuizTotal,
    overallQuizPercentage,
    quizScoreRequirementMet,
    eligibleForCertificate,
  };
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
        data.curriculum = sanitizeCurriculumForStudent(data.curriculum, true);
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
    data.curriculum = sanitizeCurriculumForStudent(data.curriculum, true);
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
      throw new ApiError(
        409,
        "A course or product with this slug already exists.",
      );
    }
    if (!value.id) {
      throw new ApiError(
        409,
        "A course or product with this slug already exists.",
      );
    }
  }
  const ref = value.id
    ? db().collection("shopItems").doc(value.id)
    : db().collection("shopItems").doc();
  const existing = value.id ? (await ref.get()).data() : null;
  const record = clean({
    ...value,
    id: ref.id,
    includedInPremium:
      value.type === "course" ? Boolean(value.includedInPremium) : false,
    salesCount:
      typeof existing?.salesCount === "number" ? existing.salesCount : 0,
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
        item: item
          ? {
              ...item,
              curriculum: sanitizeCurriculumForStudent(item.curriculum, false),
            }
          : null,
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

  let includedEntries: typeof courses = [];
  if (hasPremium(user)) {
    const includedSnap = await db()
      .collection("shopItems")
      .where("type", "==", "course")
      .where("includedInPremium", "==", true)
      .where("published", "==", true)
      .get();
    const includedItems = includedSnap.docs
      .map((d) => ({ ...d.data(), id: d.id }) as ShopItem)
      .filter((it) => !courseIds.includes(it.id));

    includedEntries = await Promise.all(
      includedItems.map(async (item) => {
        const progSnap = await db()
          .collection("shopCourseProgress")
          .doc(`${user.id}_${item.id}`)
          .get();
        const prog = progSnap.exists
          ? (progSnap.data() as ShopCourseProgress)
          : null;
        let totalLessons = 0;
        if (Array.isArray(item.curriculum)) {
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

        const syntheticPurchase: ShopPurchase = {
          id: `premium_${item.id}`,
          studentId: user.id,
          studentEmail: user.email,
          studentName: user.name,
          itemId: item.id,
          itemSlug: item.slug,
          itemTitle: item.title,
          itemType: "course",
          amount: 0,
          paymentReference: "PREMIUM_BENEFIT",
          purchasedAt: user.premiumUntil || new Date().toISOString(),
        };

        return {
          purchase: syntheticPurchase,
          item: {
            ...item,
            curriculum: sanitizeCurriculumForStudent(item.curriculum, false),
          },
          progress: prog,
          totalLessons,
          completedCount,
          percent,
        };
      }),
    );
  }

  return { courses: [...courses, ...includedEntries], digitalProducts };
}

async function getShopCourse(user: AcademyUser, courseId: string) {
  const courseDoc = await db().collection("shopItems").doc(courseId).get();
  if (!courseDoc.exists) throw new ApiError(404, "Course not found.");
  const courseData = courseDoc.data() as ShopItem;
  if (courseData.type !== "course")
    throw new ApiError(400, "This item is not a course.");

  const isStaff = user.role === "Admin" || user.role === "Instructor";
  const isIncludedWithPremium =
    courseData.includedInPremium === true && hasPremium(user);

  if (!isStaff && !isIncludedWithPremium) {
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

  const sanitizedCourse: ShopItem = {
    ...courseData,
    id: courseDoc.id || courseId,
    curriculum: isStaff
      ? courseData.curriculum
      : sanitizeCurriculumForStudent(courseData.curriculum, false),
  };

  return {
    course: sanitizedCourse,
    progress: progressDoc.exists
      ? (progressDoc.data() as ShopCourseProgress)
      : null,
  };
}

async function updateShopProgress(user: AcademyUser, p: Payload) {
  const input = s.shopProgressUpdateSchema.parse(p);
  const courseDoc = await db()
    .collection("shopItems")
    .doc(input.courseId)
    .get();
  if (!courseDoc.exists) throw new ApiError(404, "Course not found.");
  const course = courseDoc.data() as ShopItem;

  const isStaff = user.role === "Admin" || user.role === "Instructor";
  const isIncludedWithPremium =
    course.includedInPremium === true && hasPremium(user);

  if (!isStaff && !isIncludedWithPremium) {
    const purchase = await db()
      .collection("shopPurchases")
      .doc(`${user.id}_${input.courseId}`)
      .get();
    if (!purchase.exists) {
      throw new ApiError(403, "You have not purchased this course.");
    }
  }

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

  const quizResults = currentProg?.quizResults || {};
  const evaluation = evaluateCourseCompletionAndEligibility(
    course,
    completedIds,
    quizResults,
  );

  let certificateId = currentProg?.certificateId || null;

  if (
    evaluation.eligibleForCertificate &&
    !certificateId &&
    course.certificateEnabled !== false
  ) {
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
    completed: evaluation.eligibleForCertificate,
    completedAt: evaluation.eligibleForCertificate
      ? currentProg?.completedAt || now()
      : undefined,
    certificateId: certificateId || undefined,
    quizResults: Object.keys(quizResults).length > 0 ? quizResults : undefined,
    overallQuizScore:
      evaluation.overallQuizTotal > 0 ? evaluation.overallQuizScore : undefined,
    overallQuizTotal:
      evaluation.overallQuizTotal > 0 ? evaluation.overallQuizTotal : undefined,
    overallQuizPercentage:
      evaluation.overallQuizTotal > 0
        ? evaluation.overallQuizPercentage
        : undefined,
  };

  await progRef.set(clean(updated), { merge: true });
  return {
    progress: updated,
    certificateId,
    evaluation,
  };
}

function gradeSingleQuestion(
  question: ShopChapterQuizQuestion,
  rawStudentAnswer: string | string[] | undefined,
): ShopQuizQuestionFeedback {
  const pointsPossible = 1;
  const type = question.type || "multiple_choice";

  if (type === "multiple_answer") {
    const studentSelected = (
      Array.isArray(rawStudentAnswer)
        ? rawStudentAnswer
        : typeof rawStudentAnswer === "string" && rawStudentAnswer.trim()
          ? [rawStudentAnswer]
          : []
    )
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const expectedList = (
      Array.isArray(question.correctAnswers) &&
      question.correctAnswers.length > 0
        ? question.correctAnswers
        : question.correctAnswer
          ? [question.correctAnswer]
          : []
    )
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const uniqueStudent = Array.from(new Set(studentSelected));
    const uniqueExpected = Array.from(new Set(expectedList));

    const isCorrect =
      uniqueExpected.length > 0 &&
      uniqueStudent.length === uniqueExpected.length &&
      uniqueExpected.every((exp) => uniqueStudent.includes(exp));

    return {
      questionId: question.id,
      correct: isCorrect,
      studentAnswer: Array.isArray(rawStudentAnswer)
        ? rawStudentAnswer
        : rawStudentAnswer
          ? [rawStudentAnswer]
          : [],
      correctAnswer:
        question.correctAnswers && question.correctAnswers.length > 0
          ? question.correctAnswers
          : question.correctAnswer
            ? [question.correctAnswer]
            : [],
      explanation: question.explanation,
      pointsEarned: isCorrect ? pointsPossible : 0,
      pointsPossible,
    };
  }

  const studentText = (
    Array.isArray(rawStudentAnswer)
      ? rawStudentAnswer[0] || ""
      : rawStudentAnswer || ""
  ).trim();

  const acceptableAnswers = Array.from(
    new Set(
      [
        question.correctAnswer || "",
        ...(question.correctAnswers || []),
      ]
        .map((a) => a.trim())
        .filter(Boolean),
    ),
  );

  let isCorrect = false;
  if (type === "short_answer") {
    const normStudent = studentText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
    isCorrect =
      normStudent.length > 0 &&
      acceptableAnswers.some((ans) => {
        const normAns = ans
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .trim();
        if (!normAns) return false;
        return (
          normStudent === normAns ||
          (normAns.length >= 4 && normStudent.includes(normAns)) ||
          (normStudent.length >= 4 && normAns.includes(normStudent))
        );
      });
  } else {
    // multiple_choice or true_false
    const normStudent = studentText.toLowerCase();
    isCorrect =
      normStudent.length > 0 &&
      acceptableAnswers.some((ans) => ans.toLowerCase() === normStudent);
  }

  return {
    questionId: question.id,
    correct: isCorrect,
    studentAnswer: studentText,
    correctAnswer: question.correctAnswer || acceptableAnswers[0] || "",
    explanation: question.explanation,
    pointsEarned: isCorrect ? pointsPossible : 0,
    pointsPossible,
  };
}

async function submitShopCourseQuiz(user: AcademyUser, p: Payload) {
  const input = s.shopQuizSubmitSchema.parse(p);
  const courseDoc = await db()
    .collection("shopItems")
    .doc(input.courseId)
    .get();
  if (!courseDoc.exists) throw new ApiError(404, "Course not found.");
  const course = courseDoc.data() as ShopItem;

  const isStaff = user.role === "Admin" || user.role === "Instructor";
  const isIncludedWithPremium =
    course.includedInPremium === true && hasPremium(user);

  if (!isStaff && !isIncludedWithPremium) {
    const purchase = await db()
      .collection("shopPurchases")
      .doc(`${user.id}_${input.courseId}`)
      .get();
    if (!purchase.exists) {
      throw new ApiError(403, "You have not purchased this course.");
    }
  }

  const targetModule = (course.curriculum || []).find(
    (m) => m.id === input.moduleId,
  );
  if (!targetModule || !targetModule.quiz || !targetModule.quiz.enabled) {
    throw new ApiError(404, "No active quiz found for this chapter.");
  }

  const activeQuestions = getActiveModuleQuestions(targetModule);
  if (activeQuestions.length === 0) {
    throw new ApiError(400, "This chapter quiz has no questions configured.");
  }

  const progRef = db()
    .collection("shopCourseProgress")
    .doc(`${user.id}_${input.courseId}`);
  const currentSnap = await progRef.get();
  const currentProg = currentSnap.data() as ShopCourseProgress | undefined;

  const existingQuizResults: Record<string, ShopChapterQuizResult> = {
    ...(currentProg?.quizResults || {}),
  };
  const prevChapterResult = existingQuizResults[input.moduleId];
  const prevAttemptsCount = prevChapterResult?.attemptsCount || 0;

  // Enforce retake rules (Staff can always test/retake)
  const retakePolicy = targetModule.quiz.retakePolicy || "unlimited";
  const maxAttempts =
    retakePolicy === "single"
      ? 1
      : retakePolicy === "limited"
        ? Math.max(1, Number(targetModule.quiz.maxAttempts) || 3)
        : Infinity;

  if (!isStaff && prevAttemptsCount >= maxAttempts) {
    throw new ApiError(
      400,
      retakePolicy === "single"
        ? "This quiz allows only a single attempt, which you have already completed."
        : `You have reached the maximum number of attempts (${maxAttempts}) allowed for this chapter quiz.`,
    );
  }

  // Grade all active questions
  const feedback: ShopQuizQuestionFeedback[] = activeQuestions.map((q) =>
    gradeSingleQuestion(q, input.answers[q.id]),
  );

  const correctCount = feedback.filter((f) => f.correct).length;
  const totalQuestions = activeQuestions.length;
  const incorrectCount = totalQuestions - correctCount;
  const score = correctCount;
  const percentage =
    totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
  const passed = percentage >= 50;

  const attempt: ShopQuizAttempt = {
    attemptNumber: prevAttemptsCount + 1,
    score,
    totalQuestions,
    correctCount,
    incorrectCount,
    percentage,
    passed,
    submittedAt: now(),
    feedback,
  };

  const allAttempts = [...(prevChapterResult?.attempts || []), attempt];
  const scoringMethod = targetModule.quiz.scoringMethod || "highest";

  let effectiveScore = score;
  if (scoringMethod === "highest") {
    effectiveScore = Math.max(...allAttempts.map((a) => a.score));
  } else if (scoringMethod === "latest") {
    effectiveScore = attempt.score;
  } else if (scoringMethod === "average") {
    const sum = allAttempts.reduce((acc, a) => acc + a.score, 0);
    effectiveScore = Math.round((sum / allAttempts.length) * 100) / 100;
  }

  const effectivePercentage =
    totalQuestions > 0
      ? Math.round((effectiveScore / totalQuestions) * 100)
      : 0;

  const chapterResult: ShopChapterQuizResult = {
    moduleId: input.moduleId,
    attemptsCount: allAttempts.length,
    effectiveScore,
    totalQuestions,
    effectivePercentage,
    passed: effectivePercentage >= 50,
    lastAttemptAt: attempt.submittedAt,
    attempts: allAttempts.slice(-10), // Keep up to 10 recent attempts for history
  };

  existingQuizResults[input.moduleId] = chapterResult;

  const completedIds = currentProg?.completedLessonIds || [];
  const evaluation = evaluateCourseCompletionAndEligibility(
    course,
    completedIds,
    existingQuizResults,
  );

  let certificateId = currentProg?.certificateId || null;
  if (
    evaluation.eligibleForCertificate &&
    !certificateId &&
    course.certificateEnabled !== false
  ) {
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
    lastLessonId:
      currentProg?.lastLessonId ||
      targetModule.lessons?.[0]?.id ||
      input.moduleId,
    completed: evaluation.eligibleForCertificate,
    completedAt: evaluation.eligibleForCertificate
      ? currentProg?.completedAt || now()
      : undefined,
    certificateId: certificateId || undefined,
    quizResults: existingQuizResults,
    overallQuizScore: evaluation.overallQuizScore,
    overallQuizTotal: evaluation.overallQuizTotal,
    overallQuizPercentage: evaluation.overallQuizPercentage,
  };

  await progRef.set(clean(updated), { merge: true });

  return {
    attempt,
    chapterResult,
    progress: updated,
    certificateId,
    certificateUnlocked: Boolean(
      evaluation.eligibleForCertificate && certificateId,
    ),
    evaluation,
  };
}

async function getShopCourseQuizAnalytics(
  user: AcademyUser,
  courseId: string,
): Promise<ShopCourseQuizAnalytics> {
  if (user.role !== "Admin" && user.role !== "Instructor") {
    throw new ApiError(403, "Only instructors and administrators can view quiz analytics.");
  }

  const courseDoc = await db().collection("shopItems").doc(courseId).get();
  if (!courseDoc.exists) throw new ApiError(404, "Course not found.");
  const course = courseDoc.data() as ShopItem;

  const [progressSnap, purchasesSnap] = await Promise.all([
    db()
      .collection("shopCourseProgress")
      .where("courseId", "==", courseId)
      .get(),
    db().collection("shopPurchases").where("itemId", "==", courseId).get(),
  ]);

  const progressDocs = progressSnap.docs.map(
    (d) => ({ ...d.data(), id: d.id }) as ShopCourseProgress,
  );
  const purchaseMap = new Map<string, ShopPurchase>();
  purchasesSnap.docs.forEach((d) => {
    const p = d.data() as ShopPurchase;
    if (p.studentId) purchaseMap.set(p.studentId, p);
  });

  // Resolve student profiles for any progress rows not in purchaseMap
  const missingUserIds = progressDocs
    .map((p) => p.studentId)
    .filter((uid) => uid && !purchaseMap.has(uid));
  const userDocs = await Promise.all(
    Array.from(new Set(missingUserIds)).map((uid) =>
      db().collection("users").doc(uid).get(),
    ),
  );
  const userMap = new Map<string, AcademyUser>();
  userDocs.forEach((u) => {
    if (u.exists) userMap.set(u.id, u.data() as AcademyUser);
  });

  const totalLessonsCount = (course.curriculum || []).reduce(
    (acc, m) => acc + (m.lessons?.length || 0),
    0,
  );

  const chapters = (course.curriculum || []).map((mod) => {
    const activeQuestions = getActiveModuleQuestions(mod);
    const enabled = Boolean(mod.quiz?.enabled && activeQuestions.length > 0);
    const required = mod.quiz?.required !== false;

    const chapterAttempts = progressDocs
      .map((p) => p.quizResults?.[mod.id])
      .filter((r): r is ShopChapterQuizResult => Boolean(r && r.attemptsCount > 0));

    const studentsAttempted = chapterAttempts.length;
    const averagePercentage =
      studentsAttempted > 0
        ? Math.round(
            chapterAttempts.reduce(
              (acc, r) => acc + Number(r.effectivePercentage || 0),
              0,
            ) / studentsAttempted,
          )
        : 0;
    const passedCount = chapterAttempts.filter((r) => r.passed).length;
    const passRate =
      studentsAttempted > 0
        ? Math.round((passedCount / studentsAttempted) * 100)
        : 0;

    return {
      moduleId: mod.id,
      moduleTitle: mod.title,
      enabled,
      required,
      questionsCount: activeQuestions.length,
      retakePolicy: mod.quiz?.retakePolicy || "unlimited",
      scoringMethod: mod.quiz?.scoringMethod || "highest",
      studentsAttempted,
      averagePercentage,
      passRate,
    };
  });

  const students: ShopCourseQuizStudentStat[] = progressDocs.map((prog) => {
    const purchase = purchaseMap.get(prog.studentId);
    const profile = userMap.get(prog.studentId);
    const evaluation = evaluateCourseCompletionAndEligibility(
      course,
      prog.completedLessonIds || [],
      prog.quizResults || {},
    );

    const chapterScores: ShopCourseQuizStudentStat["chapterScores"] = {};
    for (const [modId, res] of Object.entries(prog.quizResults || {})) {
      if (res && res.attemptsCount > 0) {
        chapterScores[modId] = {
          score: res.effectiveScore,
          total: res.totalQuestions,
          percentage: res.effectivePercentage,
          attempts: res.attemptsCount,
          passed: res.passed,
        };
      }
    }

    return {
      studentId: prog.studentId,
      studentName:
        purchase?.studentName || profile?.name || "Enrolled Student",
      studentEmail: purchase?.studentEmail || profile?.email || "",
      completedLessonsCount: (prog.completedLessonIds || []).length,
      totalLessonsCount,
      completedQuizzesCount: evaluation.completedRequiredQuizzesCount,
      requiredQuizzesCount: evaluation.requiredQuizzesCount,
      overallScore: evaluation.overallQuizScore,
      overallTotal: evaluation.overallQuizTotal,
      overallPercentage: evaluation.overallQuizPercentage,
      certificateUnlocked: Boolean(
        evaluation.eligibleForCertificate && prog.certificateId,
      ),
      certificateId: prog.certificateId,
      chapterScores,
    };
  });

  const studentsWithQuizAttempts = students.filter(
    (s) => Object.keys(s.chapterScores).length > 0,
  );
  const overallAveragePercentage =
    studentsWithQuizAttempts.length > 0
      ? Math.round(
          studentsWithQuizAttempts.reduce(
            (acc, s) => acc + s.overallPercentage,
            0,
          ) / studentsWithQuizAttempts.length,
        )
      : 0;

  return {
    courseId,
    chapters,
    overallAveragePercentage,
    students,
  };
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

export const HOUSE_AD: VideoAd = {
  id: "house-premium",
  title: "Unlock 1-on-1 Mentorship & Ad-Free Learning",
  subtitle:
    "Join EA Academy Premium for ₦3,000/mo. Get unlimited instructor reviews, certificates, and zero interruptions.",
  mediaType: "banner",
  mediaUrl:
    "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=1200&q=80",
  ctaText: "Upgrade to Premium",
  destinationUrl: "/app/billing",
  active: true,
  priority: "normal",
  skipDurationSeconds: 5,
  impressionsCount: 0,
  clicksCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

async function listAdminAds(user: AcademyUser) {
  requireAdmin(user);
  try {
    const snapshot = await db().collection("videoAds").get();
    const ads = snapshot.docs.map((doc) => ({
      ...(doc.data() as VideoAd),
      id: doc.id,
    }));
    return { ads, tableMissing: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("video_ads") ||
      msg.includes("schema cache") ||
      msg.includes("does not exist") ||
      msg.includes("PGRST205")
    ) {
      return { ads: [], tableMissing: true };
    }
    throw err;
  }
}

async function saveAdminAd(user: AcademyUser, rawAd: unknown) {
  requireAdmin(user);
  const input = s.videoAdSchema.parse(rawAd);
  const id = input.id || `ad_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const ref = db().collection("videoAds").doc(id);

  try {
    const existing = await ref.get();

    const record: VideoAd = {
      id,
      title: input.title,
      subtitle: input.subtitle || "",
      mediaType: input.mediaType,
      mediaUrl: input.mediaUrl,
      ctaText: input.ctaText,
      destinationUrl: input.destinationUrl,
      active: input.active,
      priority: input.priority,
      targetTracks: input.targetTracks || [],
      skipDurationSeconds: input.skipDurationSeconds,
      impressionsCount: existing.exists
        ? (existing.data()?.impressionsCount as number) || 0
        : 0,
      clicksCount: existing.exists
        ? (existing.data()?.clicksCount as number) || 0
        : 0,
      createdAt: existing.exists
        ? (existing.data()?.createdAt as string) || now()
        : now(),
      updatedAt: now(),
    };

    await ref.set(clean(record), { merge: true });
    return { success: true, ad: record };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("video_ads") ||
      msg.includes("schema cache") ||
      msg.includes("does not exist") ||
      msg.includes("PGRST205")
    ) {
      throw new ApiError(
        400,
        "The 'video_ads' table has not been created in Supabase yet. Please run the SQL migration in your Supabase SQL Editor.",
      );
    }
    throw err;
  }
}

async function deleteAdminAd(user: AcademyUser, id: string) {
  requireAdmin(user);
  try {
    await db().collection("videoAds").doc(id).delete();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("video_ads") ||
      msg.includes("schema cache") ||
      msg.includes("does not exist") ||
      msg.includes("PGRST205")
    ) {
      return { success: true };
    }
    throw err;
  }
  return { success: true };
}

async function serveLessonAd(user: AcademyUser, p: Payload) {
  // 1. Staff and active Premium members never see ads
  if (user.role === "Admin" || user.role === "Instructor" || hasPremium(user)) {
    return { hasAd: false };
  }

  // 2. Check if student owns the course individually
  if (p.courseId && typeof p.courseId === "string") {
    const purchase = await db()
      .collection("shopPurchases")
      .doc(`${user.id}_${p.courseId}`)
      .get();
    if (purchase.exists) {
      return { hasAd: false };
    }
  }

  // 3. User is Free: find eligible active ads
  const input = s.adServeSchema.parse(p);

  try {
    const snapshot = await db()
      .collection("videoAds")
      .where("active", "==", true)
      .get();

    let eligibleAds = snapshot.docs.map((doc) => ({
      ...(doc.data() as VideoAd),
      id: doc.id,
    }));

    // Filter by track if requested
    if (input.trackId) {
      eligibleAds = eligibleAds.filter(
        (ad) =>
          !ad.targetTracks ||
          ad.targetTracks.length === 0 ||
          ad.targetTracks.includes(input.trackId!),
      );
    }

    if (eligibleAds.length === 0) {
      return { hasAd: true, ad: HOUSE_AD };
    }

    // Weighted selection based on priority
    // high = 3, normal = 2, low = 1
    const weights: Record<string, number> = { high: 3, normal: 2, low: 1 };
    const weightedPool: VideoAd[] = [];
    for (const ad of eligibleAds) {
      const weight = weights[ad.priority] || 2;
      for (let i = 0; i < weight; i++) {
        weightedPool.push(ad);
      }
    }

    const selectedAd =
      weightedPool[Math.floor(Math.random() * weightedPool.length)] || eligibleAds[0];

    // Increment impressions count
    try {
      const currentImpressions = (selectedAd.impressionsCount as number) || 0;
      await db()
        .collection("videoAds")
        .doc(selectedAd.id)
        .update({ impressionsCount: currentImpressions + 1 });
    } catch {
      // Ignore impression increment error in edge cases
    }

    return { hasAd: true, ad: selectedAd };
  } catch {
    // If table doesn't exist yet, gracefully return House Ad
    return { hasAd: true, ad: HOUSE_AD };
  }
}

async function recordAdClick(user: AcademyUser, id: string) {
  if (id === "house-premium") {
    return { success: true };
  }
  try {
    const docRef = db().collection("videoAds").doc(id);
    const snap = await docRef.get();
    if (snap.exists) {
      const currentClicks = (snap.data()?.clicksCount as number) || 0;
      await docRef.update({ clicksCount: currentClicks + 1 });
    }
  } catch {
    // Ignore click increment error
  }
  return { success: true };
}

