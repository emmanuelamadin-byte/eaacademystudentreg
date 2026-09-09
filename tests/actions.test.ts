import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthToken } from "../src/server/supabase";
import type { AcademyUser } from "../src/lib/types";

const state = vi.hoisted(() => ({
  actor: {} as AcademyUser,
  documents: new Map<string, Record<string, unknown>>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/server/ai", () => ({ askAI: vi.fn() }));
vi.mock("../src/server/payments", () => ({
  checkout: vi.fn(),
  verifyPayment: vi.fn(),
  manageSubscription: vi.fn(),
}));
vi.mock("../src/server/supabase", async () => {
  const { ApiError } = await import("../src/server/policy");
  const ref = (path: string) => ({
    path,
    id: path.split("/").pop(),
    get: async () => ({
      exists: state.documents.has(path),
      data: () => state.documents.get(path),
    }),
    create: async (data: Record<string, unknown>) => {
      if (state.documents.has(path)) throw new Error("exists");
      state.documents.set(path, data);
    },
    set: async (data: Record<string, unknown>) =>
      state.documents.set(path, data),
    update: async (data: Record<string, unknown>) =>
      state.documents.set(path, { ...state.documents.get(path), ...data }),
    delete: async () => state.documents.delete(path),
  });
  const collection = (
    name: string,
    filters: [string, unknown][] = [],
  ): Record<string, unknown> => ({
    doc: (id = "generated") => ref(`${name}/${id}`),
    where: (field: string, _operator: string, value: unknown) =>
      collection(name, [...filters, [field, value]]),
    limit: () => collection(name, filters),
    get: async () => ({
      docs: [...state.documents.entries()]
        .filter(
          ([path, value]) =>
            path.startsWith(`${name}/`) &&
            filters.every(([field, expected]) => value[field] === expected),
        )
        .map(([path, value]) => ({
          id: path.split("/").pop(),
          exists: true,
          data: () => value,
        })),
    }),
  });
  const store = {
    collection,
    runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
      const pending: (() => void)[] = [];
      const tx = {
        get: async (r: { path: string }) => ({
          exists: state.documents.has(r.path),
          data: () => state.documents.get(r.path),
        }),
        create: (r: { path: string }, data: Record<string, unknown>) =>
          pending.push(() => {
            if (state.documents.has(r.path)) throw new Error("exists");
            state.documents.set(r.path, data);
          }),
        set: (r: { path: string }, data: Record<string, unknown>) =>
          pending.push(() => state.documents.set(r.path, data)),
        update: (r: { path: string }, data: Record<string, unknown>) =>
          pending.push(() =>
            state.documents.set(r.path, {
              ...state.documents.get(r.path),
              ...data,
            }),
          ),
      };
      await fn(tx);
      pending.forEach((apply) => apply());
    },
  };
  return {
    actor: async () => state.actor,
    limit: async () => {},
    reserveReview: async (
      studentId: string,
      period: string,
      submissionId: string,
      maximum: number,
    ) => {
      const path = `reviewUsage/${studentId}_${period}`;
      const before = state.documents.get(path);
      const used = Number(before?.count || 0);
      if (used >= maximum) return -1;
      state.documents.set(path, {
        count: used + 1,
        submissionIds: [
          ...((before?.submissionIds as string[] | undefined) || []),
          submissionId,
        ],
      });
      return maximum - used - 1;
    },
    reserveCritique: async (
      studentId: string,
      period: string,
      projectId: string,
      maximum: number,
    ) => {
      const path = `critiqueUsage/${studentId}_${period}`;
      const before = state.documents.get(path);
      const used = Number(before?.count || 0);
      if (used >= maximum) return -1;
      state.documents.set(path, {
        count: used + 1,
        projectIds: [
          ...((before?.projectIds as string[] | undefined) || []),
          projectId,
        ],
      });
      return maximum - used - 1;
    },
    setStudentBirthday: async (
      studentId: string,
      month: number,
      day: number,
    ) => {
      const path = `users/${studentId}`;
      const profile = state.documents.get(path) || {};
      const previous = profile.birthday as
        { month: number; day: number } | undefined;
      let birthdayChanges = Number(profile.birthdayChanges || 0);
      if (previous && (previous.month !== month || previous.day !== day)) {
        if (birthdayChanges >= 1)
          throw new ApiError(403, "Birthday correction already used");
        birthdayChanges += 1;
      }
      state.documents.set(path, {
        ...profile,
        birthday: { month, day },
        birthdayChanges,
      });
      return { month, day, birthdayChanges };
    },
    claimStudentRoster: async (email: string, userId: string) => {
      const path = `studentRoster/${email}`;
      const roster = state.documents.get(path);
      if (!roster || roster.status === "inactive") return undefined;
      if (roster.status === "claimed" && roster.claimedUserId !== userId)
        return undefined;
      const claimed = {
        ...roster,
        status: "claimed",
        claimedUserId: userId,
        claimedAt: new Date().toISOString(),
      };
      state.documents.set(path, claimed);
      return claimed;
    },
    db: () => store,
    document: async (name: string, id: string) => {
      const doc = state.documents.get(`${name}/${id}`);
      if (!doc) throw new ApiError(404, "Not found");
      return { ...doc, id };
    },
  };
});
import {
  dispatch,
  getLesson,
  listClassroomLessons,
} from "../src/server/academy";
const token = {
  uid: "student",
  email: "student@example.com",
  email_verified: true,
} as AuthToken;
const newGoogleToken = {
  ...token,
  uid: "new-student",
  provider: "google",
} as AuthToken;
const student: AcademyUser = {
  id: "student",
  name: "Student",
  email: "student@example.com",
  role: "Student",
  enrolledClassId: "system-dev",
  membershipPlan: "Free",
  enrolledAt: "2026-01-01",
};
beforeEach(() => {
  state.documents.clear();
  state.actor = { ...student };
  state.documents.set("users/student", { ...student });
  state.documents.set("assignments/task", {
    published: true,
    classId: "system-dev",
    starter: true,
  });
});
describe("server action boundaries", () => {
  it("requires complete Google onboarding and stores a normalized phone number", async () => {
    await dispatch(newGoogleToken, "profile.ensure", {
      name: "New Student",
      enrolledClassId: "creative-media",
      countryCode: "NG",
      phoneNumber: "0801 234 5678",
      birthday: { month: 2, day: 29 },
    });
    expect(state.documents.get("users/new-student")).toMatchObject({
      countryCode: "NG",
      phoneNumber: "+2348012345678",
      birthday: { month: 2, day: 29 },
      enrolledClassId: "creative-media",
    });
  });
  it("claims a verified legacy roster entry without asking for onboarding again", async () => {
    state.documents.set("studentRoster/legacy@example.com", {
      email: "legacy@example.com",
      name: "Legacy Student",
      phoneNumber: "+2348012345678",
      countryCode: "NG",
      enrolledClassId: "creative-media",
      membershipPlan: "Free",
      enrolledAt: "2026-07-30T18:21:22.000Z",
      status: "pending",
      whatsappConsent: true,
      communicationConsentVersion: "legacy-ea-academy-import-v1",
      phoneReviewRequired: false,
    });

    await dispatch(
      {
        ...newGoogleToken,
        email: "Legacy@Example.com",
        email_verified: true,
      } as AuthToken,
      "profile.ensure",
      {},
    );

    expect(state.documents.get("users/new-student")).toMatchObject({
      name: "Legacy Student",
      email: "legacy@example.com",
      phoneNumber: "+2348012345678",
      countryCode: "NG",
      enrolledClassId: "creative-media",
      membershipPlan: "Free",
      enrolledAt: "2026-07-30T18:21:22.000Z",
      whatsappNotificationsEnabled: true,
      birthdayWhatsappEnabled: false,
    });
    expect(
      state.documents.get("studentRoster/legacy@example.com"),
    ).toMatchObject({
      status: "claimed",
      claimedUserId: "new-student",
    });
  });
  it("withholds a shared roster phone until an administrator reviews it", async () => {
    state.documents.set("studentRoster/review@example.com", {
      email: "review@example.com",
      name: "Review Student",
      phoneNumber: "+2348012345678",
      countryCode: "NG",
      enrolledClassId: "system-dev",
      membershipPlan: "Free",
      enrolledAt: "2026-07-30T18:21:22.000Z",
      status: "pending",
      whatsappConsent: true,
      communicationConsentVersion: "legacy-ea-academy-import-v1",
      phoneReviewRequired: true,
    });

    await dispatch(
      {
        ...newGoogleToken,
        email: "review@example.com",
        email_verified: true,
      } as AuthToken,
      "profile.ensure",
      {},
    );

    expect(state.documents.get("users/new-student")).toMatchObject({
      whatsappNotificationsEnabled: false,
    });
    expect(state.documents.get("users/new-student")).not.toHaveProperty(
      "phoneNumber",
    );
  });
  it("repairs a pre-existing administrator profile without a primary track", async () => {
    const owner = {
      ...student,
      id: "owner",
      email: "emmanuelamadin@gmail.com",
      role: "Admin" as const,
      enrolledClassId: undefined,
    };
    state.actor = owner as unknown as AcademyUser;
    state.documents.set("users/owner", owner);
    await dispatch(
      {
        ...newGoogleToken,
        uid: "owner",
        email: "emmanuelamadin@gmail.com",
        email_verified: true,
      } as AuthToken,
      "profile.ensure",
      {},
    );
    expect(state.documents.get("users/owner")?.enrolledClassId).toBe(
      "system-dev",
    );
  });
  it("stores the student timezone and returns a server-calculated streak", async () => {
    await dispatch(token, "profile.timezone", {
      timeZone: "Pacific/Auckland",
    });
    expect(state.documents.get("users/student")?.timeZone).toBe(
      "Pacific/Auckland",
    );
    state.actor = { ...student, timeZone: "Pacific/Auckland" };
    state.documents.set("progress/today", {
      studentId: "student",
      lessonId: "lesson-one",
      completedAt: new Date().toISOString(),
    });
    const result = (await dispatch(token, "streak.get", {})) as {
      currentStreak: number;
      longestStreak: number;
      week: unknown[];
    };
    expect(result).toMatchObject({ currentStreak: 1, longestStreak: 1 });
    expect(result.week).toHaveLength(7);
  });
  it("lets a student add a birthday and use exactly one correction", async () => {
    await dispatch(token, "profile.birthday", {
      birthday: { month: 4, day: 12 },
    });
    expect(state.documents.get("users/student")).toMatchObject({
      birthday: { month: 4, day: 12 },
      birthdayChanges: 0,
    });

    await dispatch(token, "profile.birthday", {
      birthday: { month: 4, day: 13 },
    });
    expect(state.documents.get("users/student")).toMatchObject({
      birthday: { month: 4, day: 13 },
      birthdayChanges: 1,
    });

    await expect(
      dispatch(token, "profile.birthday", {
        birthday: { month: 4, day: 14 },
      }),
    ).rejects.toThrow("Birthday correction already used");
  });
  it("posts a recorded class and creates its classroom module automatically", async () => {
    state.actor = {
      ...student,
      id: "owner",
      email: "emmanuelamadin@gmail.com",
      role: "Admin",
    };
    const result = (await dispatch(token, "class.post", {
      post: {
        classId: "system-dev",
        title: "Recorded web class",
        content: "Class notes and next steps.",
        videoUrl: "https://www.youtube.com/watch?v=abc123",
        duration: "45 minutes",
        free: true,
        resources: [
          { title: "Worksheet", url: "https://example.com/worksheet.pdf" },
        ],
      },
    })) as { id: string; moduleId: string };
    expect(state.documents.get(`modules/${result.moduleId}`)).toMatchObject({
      title: "Classroom posts",
      published: true,
    });
    expect(state.documents.get(`lessons/${result.id}`)).toMatchObject({
      title: "Recorded web class",
      moduleId: result.moduleId,
      published: true,
      free: true,
    });
    expect(state.documents.get("notifications/generated")).toMatchObject({
      targetTrack: "system-dev",
      actionScreen: `/app/lesson/${result.id}`,
    });
  });
  it("returns only classroom lessons the signed-in student may access", async () => {
    state.documents.set("modules/free-module", {
      published: true,
      free: true,
    });
    state.documents.set("modules/premium-module", {
      published: true,
      free: false,
    });
    state.documents.set("lessons/free-class", {
      moduleId: "free-module",
      classId: "system-dev",
      title: "Free class",
      published: true,
      free: true,
      solutionCode: "staff only",
    });
    state.documents.set("lessons/premium-class", {
      moduleId: "premium-module",
      classId: "system-dev",
      title: "Premium class",
      published: true,
      free: false,
    });
    state.documents.set("lessons/other-track-class", {
      moduleId: "free-module",
      classId: "creative-media",
      title: "Other track class",
      published: true,
      free: true,
    });

    const lessons = await listClassroomLessons(student);

    expect(lessons.map((lesson) => lesson.id)).toEqual(["free-class"]);
    expect(lessons[0]?.solutionCode).toBeUndefined();
  });
  it("rejects incomplete first-time profiles and non-Google signup", async () => {
    await expect(
      dispatch(newGoogleToken, "profile.ensure", {
        enrolledClassId: "system-dev",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      dispatch(
        {
          ...newGoogleToken,
          uid: "password-user",
          provider: "email",
        } as AuthToken,
        "profile.ensure",
        {
          enrolledClassId: "system-dev",
          countryCode: "NG",
          phoneNumber: "08012345678",
          birthday: { month: 4, day: 12 },
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("never lets a learner appoint staff or change primary enrollment", async () => {
    await expect(
      dispatch(token, "users.update", {
        id: "student",
        role: "Instructor",
        enrolledClassId: "creative-media",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await dispatch(token, "profile.ensure", {
      enrolledClassId: "creative-media",
      name: "Changed",
    });
    expect(state.documents.get("users/student")?.enrolledClassId).toBe(
      "system-dev",
    );
  });
  it("allows only the owner to correct enrollment and appoint track instructors", async () => {
    state.actor = {
      ...student,
      id: "owner",
      email: "emmanuelamadin@gmail.com",
      role: "Admin",
    };
    await dispatch(token, "users.update", {
      id: "student",
      role: "Instructor",
      enrolledClassId: "creative-media",
      instructorTrackIds: ["creative-media"],
    });
    expect(state.documents.get("users/student")).toMatchObject({
      role: "Instructor",
      enrolledClassId: "creative-media",
    });
    await expect(
      dispatch(token, "users.update", { id: "student", role: "Admin" }),
    ).rejects.toThrow();
  });
  it("derives submission ownership and track from authenticated records", async () => {
    const result = await dispatch(token, "submission.save", {
      submission: {
        assignmentId: "task",
        studentId: "victim",
        classId: "business-growth",
        grade: 100,
        writeUp: "My work",
        status: "submitted",
      },
    });
    const saved = state.documents.get(
      `submissions/${(result as { id: string }).id}`,
    );
    expect(saved).toMatchObject({
      studentId: "student",
      classId: "system-dev",
      status: "submitted",
    });
    expect(saved).not.toHaveProperty("grade");
    expect(result).toMatchObject({
      reviewEligible: false,
      reviewsRemaining: 0,
    });
  });
  it("allows only starter practice for Free and reserves two Premium reviews per month", async () => {
    state.documents.set("assignments/premium-task", {
      published: true,
      classId: "system-dev",
      starter: false,
    });
    await expect(
      dispatch(token, "submission.save", {
        submission: {
          assignmentId: "premium-task",
          writeUp: "Free attempt",
          status: "submitted",
        },
      }),
    ).rejects.toMatchObject({ status: 403 });

    state.actor = { ...student, premiumGranted: true };
    for (const id of ["premium-task", "second-task"]) {
      state.documents.set(`assignments/${id}`, {
        published: true,
        classId: "system-dev",
        starter: false,
      });
      const result = await dispatch(token, "submission.save", {
        submission: {
          assignmentId: id,
          writeUp: "Premium work",
          status: "submitted",
        },
      });
      expect(result).toMatchObject({ reviewEligible: true });
    }
    state.documents.set("assignments/third-task", {
      published: true,
      classId: "system-dev",
      starter: false,
    });
    await expect(
      dispatch(token, "submission.save", {
        submission: {
          assignmentId: "third-task",
          writeUp: "One too many",
          status: "submitted",
        },
      }),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("keeps practice submissions out of the instructor grading workflow", async () => {
    state.actor = {
      ...student,
      role: "Instructor",
      instructorTrackIds: ["system-dev"],
    };
    state.documents.set("submissions/student_task", {
      classId: "system-dev",
      status: "submitted",
      reviewEligible: false,
    });
    await expect(
      dispatch(token, "submission.grade", {
        id: "student_task",
        grade: 80,
        feedback: "Good work",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("limits Premium portfolio critiques to one new project per month", async () => {
    state.actor = { ...student, premiumGranted: true };
    for (const id of ["project-one", "project-two"]) {
      state.documents.set(`projects/${id}`, {
        id,
        authorId: student.id,
        classId: "system-dev",
      });
    }
    await dispatch(token, "project.critique.request", { id: "project-one" });
    expect(state.documents.get("projectCritiques/project-one")).toMatchObject({
      studentId: "student",
      status: "requested",
    });
    await expect(
      dispatch(token, "project.critique.request", { id: "project-two" }),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("rejects attachments belonging to another learner", async () => {
    await expect(
      dispatch(token, "submission.save", {
        submission: {
          assignmentId: "task",
          writeUp: "My work",
          attachments: ["uploads/victim/private.pdf"],
          status: "submitted",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(state.documents.has("submissions/student_task")).toBe(false);
  });
  it("preserves graded submissions when a stale offline draft is retried", async () => {
    state.documents.set("submissions/student_task", {
      studentId: "student",
      assignmentId: "task",
      status: "graded",
      grade: 75,
    });
    await expect(
      dispatch(token, "submission.save", {
        submission: {
          assignmentId: "task",
          writeUp: "Stale draft",
          status: "draft",
        },
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(state.documents.get("submissions/student_task")?.grade).toBe(75);
  });
  it("rejects cross-track grading by an instructor", async () => {
    state.actor = {
      ...student,
      role: "Instructor",
      instructorTrackIds: ["creative-media"],
    };
    state.documents.set("submissions/student_task", {
      classId: "system-dev",
      status: "submitted",
    });
    await expect(
      dispatch(token, "submission.grade", {
        id: "student_task",
        grade: 100,
        feedback: "Well done",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("removes solution code and respects the parent module paywall", async () => {
    state.documents.set("lessons/lesson", {
      id: "lesson",
      moduleId: "module",
      classId: "system-dev",
      published: true,
      free: true,
      solutionCode: "SECRET ANSWER",
    });
    state.documents.set("modules/module", { published: true, free: false });
    await expect(getLesson(student, "lesson")).rejects.toMatchObject({
      status: 403,
    });
    const lesson = await getLesson(
      { ...student, premiumGranted: true },
      "lesson",
    );
    expect(lesson).not.toHaveProperty("solutionCode");
    expect(lesson.free).toBe(false);
  });
});
