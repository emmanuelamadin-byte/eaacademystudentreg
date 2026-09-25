import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  shopItemSchema,
  shopProgressUpdateSchema,
  shopQuizGenerateSchema,
  shopQuizSubmitSchema,
} from "../src/server/schemas";
import { rowFromDatabase, rowToDatabase } from "../src/lib/supabase-data";
import type { AcademyUser } from "../src/lib/types";

const state = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../src/server/supabase", () => {
  const snapshot = (path: string) => {
    const id = path.split("/").pop() || "";
    return {
      id,
      exists: state.documents.has(path),
      data: () => state.documents.get(path),
    };
  };
  const reference = (path: string) => ({
    path,
    get: async () => snapshot(path),
    update: async (value: Record<string, unknown>) =>
      state.documents.set(path, { ...state.documents.get(path), ...value }),
    delete: async () => state.documents.delete(path),
    set: async (value: Record<string, unknown>) =>
      state.documents.set(path, { ...state.documents.get(path), ...value }),
    create: async (value: Record<string, unknown>) =>
      state.documents.set(path, value),
  });
  const queryDocs = (
    name: string,
    filters: Array<{ field: string; value: unknown }>,
  ) => {
    const prefix = `${name}/`;
    const docs = Array.from(state.documents.entries())
      .filter(([key, val]) => {
        if (!key.startsWith(prefix)) return false;
        return filters.every((f) => val[f.field] === f.value);
      })
      .map(([key, val]) => ({
        id: key.slice(prefix.length),
        exists: true,
        data: () => val,
      }));
    return {
      empty: docs.length === 0,
      docs,
    };
  };
  const makeQuery = (
    name: string,
    filters: Array<{ field: string; value: unknown }> = [],
  ) => ({
    where: (field: string, _op: string, value: unknown) =>
      makeQuery(name, [...filters, { field, value }]),
    get: async () => queryDocs(name, filters),
  });
  const store = {
    collection: (name: string) => ({
      doc: (id: string) => reference(`${name}/${id}`),
      where: (field: string, _op: string, value: unknown) =>
        makeQuery(name, [{ field, value }]),
      get: async () => queryDocs(name, []),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
      const pending: (() => void)[] = [];
      const tx = {
        get: async (ref: { path: string }) => snapshot(ref.path),
        create: (ref: { path: string }, value: Record<string, unknown>) =>
          pending.push(() => state.documents.set(ref.path, value)),
        set: (ref: { path: string }, value: Record<string, unknown>) =>
          pending.push(() => state.documents.set(ref.path, value)),
        update: (ref: { path: string }, value: Record<string, unknown>) =>
          pending.push(() =>
            state.documents.set(ref.path, {
              ...state.documents.get(ref.path),
              ...value,
            }),
          ),
      };
      await fn(tx);
      pending.forEach((apply) => apply());
    },
  };
  return {
    db: () => store,
    limit: async () => {},
    actor: async (token: { uid: string }) => {
      const u = state.documents.get(`users/${token.uid}`);
      if (!u) throw new Error("User not found");
      return u as unknown as AcademyUser;
    },
  };
});

import { checkout, verifyPayment } from "../src/server/payments";
import { generateChapterQuiz } from "../src/server/ai";
import { dispatch } from "../src/server/academy";

describe("Shop & Course Builder Schemas", () => {
  it("validates a professional course schema with curriculum", () => {
    const validCourse = {
      slug: "ai-prompt-engineering-masterclass",
      type: "course" as const,
      title: "AI & Prompt Engineering Masterclass",
      subtitle: "Learn to build production-ready generative workflows.",
      description: "A comprehensive course taking you from fundamentals to advanced AI agents.",
      price: 20000,
      compareAtPrice: 40000,
      category: "AI & Machine Learning",
      tags: ["AI", "Python", "Generative AI"],
      badge: "Bestseller",
      thumbnailUrl: "https://example.com/cover.jpg",
      previewVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      whatYouWillLearn: ["Build autonomous agents", "Fine-tune models"],
      requirements: ["Basic coding knowledge"],
      targetAudience: ["Engineers and creators"],
      published: true,
      featured: true,
      level: "Intermediate" as const,
      totalDuration: "12 Hours",
      certificateEnabled: true,
      curriculum: [
        {
          id: "mod-1",
          title: "Foundations of AI Engineering",
          description: "Core architectures and token mechanics.",
          order: 1,
          lessons: [
            {
              id: "les-1",
              title: "01. Introduction to LLM Architecture",
              duration: "14:20",
              videoUrl: "https://vimeo.com/123456",
              content: "Key concepts and notes on transformers.",
              resources: [{ title: "Cheat Sheet", url: "https://example.com/sheet.pdf" }],
              isFreePreview: true,
              order: 1,
            },
          ],
        },
      ],
    };

    const parsed = shopItemSchema.parse(validCourse);
    expect(parsed.title).toBe("AI & Prompt Engineering Masterclass");
    expect(parsed.curriculum.length).toBe(1);
    expect(parsed.curriculum[0].lessons[0].isFreePreview).toBe(true);
    expect(parsed.includedInPremium).toBe(false);

    const premiumCourse = shopItemSchema.parse({
      ...validCourse,
      includedInPremium: true,
    });
    expect(premiumCourse.includedInPremium).toBe(true);
  });

  it("validates a digital product with deliverables and file format", () => {
    const validProduct = {
      slug: "system-design-handbook-pdf",
      type: "digital_product" as const,
      title: "The Production System Design Handbook",
      subtitle: "100+ architectural patterns and battle-tested case studies.",
      description: "Everything you need to design distributed high-scale web systems.",
      price: 8000,
      compareAtPrice: 15000,
      category: "Systems & Development",
      tags: ["Architecture", "PDF", "Design"],
      thumbnailUrl: "https://example.com/handbook.jpg",
      whatYouWillLearn: ["Distributed caching", "Message queues"],
      requirements: [],
      targetAudience: ["Backend developers"],
      published: true,
      fileUrl: "https://example.com/handbook.pdf",
      fileFormat: "PDF",
      fileSize: "24.5 MB",
      version: "v2.0",
      includes: ["200-page color PDF", "Figma diagram templates", "Lifetime updates"],
    };

    const parsed = shopItemSchema.parse(validProduct);
    expect(parsed.type).toBe("digital_product");
    expect(parsed.fileFormat).toBe("PDF");
    expect(parsed.includes.length).toBe(3);
  });

  it("rejects invalid slugs and negative pricing", () => {
    expect(() =>
      shopItemSchema.parse({
        slug: "Invalid Slug with Spaces!",
        type: "course",
        title: "Test",
        subtitle: "Test Sub",
        description: "Test Desc",
        price: -500,
        category: "Tech",
        thumbnailUrl: "https://example.com/img.jpg",
      }),
    ).toThrow();
  });

  it("allows courses with uploaded thumbnails, uploaded resources, and empty optional fields", () => {
    const newlyBuiltCourse = {
      slug: "brand-new-course",
      type: "course" as const,
      title: "Brand New Course",
      price: 15000,
      compareAtPrice: 0,
      category: "Systems & Development",
      tags: ["Practical", ""],
      thumbnailUrl: "/api/upload?path=uploads%2Fadmin%2Fcover.png",
      previewVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      whatYouWillLearn: ["Point 1", "", "   "],
      requirements: [],
      targetAudience: [],
      published: true,
      curriculum: [
        {
          id: "mod-1",
          title: "Module 1",
          description: "",
          order: 1,
          lessons: [
            {
              id: "les-1",
              title: "Lesson 1",
              duration: "10:00",
              videoUrl: "/api/upload?path=uploads%2Fadmin%2Fvideo.mp4",
              content: "",
              resources: [
                {
                  title: "Resource 1",
                  url: "/api/upload?path=uploads%2Fadmin%2Fnotes.pdf",
                  size: "2.1 MB",
                },
              ],
              isFreePreview: false,
              order: 1,
            },
          ],
        },
      ],
    };

    const parsed = shopItemSchema.parse(newlyBuiltCourse);
    expect(parsed.title).toBe("Brand New Course");
    expect(parsed.published).toBe(true);
    expect(parsed.thumbnailUrl).toBe("/api/upload?path=uploads%2Fadmin%2Fcover.png");
    expect(parsed.compareAtPrice).toBeNull();
    expect(parsed.whatYouWillLearn).toEqual(["Point 1"]);
    expect(parsed.tags).toEqual(["Practical"]);
    expect(parsed.curriculum[0].lessons[0].resources[0].url).toBe(
      "/api/upload?path=uploads%2Fadmin%2Fnotes.pdf",
    );
  });

  it("validates progress update payloads", () => {
    const valid = shopProgressUpdateSchema.parse({
      courseId: "course-123",
      lessonId: "lesson-456",
      completed: true,
    });
    expect(valid.completed).toBe(true);
  });
});

describe("Paystack One-Time Shop Purchases", () => {
  const testStudent: AcademyUser = {
    id: "student-123",
    name: "Jane Student",
    email: "jane@example.com",
    role: "Student",
    enrolledClassId: "system-dev",
    membershipPlan: "Free",
    enrolledAt: "2026-01-01",
  };

  beforeEach(() => {
    state.documents.clear();
    state.documents.set("users/student-123", { ...testStudent });
    state.documents.set("shopItems/course-ai-101", {
      id: "course-ai-101",
      slug: "ai-101",
      type: "course",
      title: "AI 101 Masterclass",
      price: 15000,
      published: true,
    });
  });

  it("calculates one-time amount and records shop_item intent in checkout", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://academy.test";
    process.env.PAYSTACK_SECRET_KEY = "sk_test_123";

    // Mock global fetch for Paystack initialize
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/test-shop",
          access_code: "access-shop-123",
          reference: "ea_shop_ref",
        },
      }),
    }) as unknown as typeof fetch;

    const res = await checkout(testStudent, {
      kind: "shop_item",
      itemId: "course-ai-101",
    });

    expect(res.authorization_url).toBe("https://checkout.paystack.com/test-shop");

    // Verify intent was created with amount in Kobo (15,000 NGN = 1,500,000 Kobo)
    const intentDoc = Array.from(state.documents.entries()).find(([k]) =>
      k.startsWith("billingIntents/"),
    );
    expect(intentDoc).toBeDefined();
    expect(intentDoc![1].kind).toBe("shop_item");
    expect(intentDoc![1].amount).toBe(1500000);
    expect(intentDoc![1].itemId).toBe("course-ai-101");
    expect(intentDoc![1].itemTitle).toBe("AI 101 Masterclass");

    global.fetch = originalFetch;
  });

  it("prevents purchasing an item user already owns", async () => {
    state.documents.set("shopPurchases/student-123_course-ai-101", {
      id: "student-123_course-ai-101",
      studentId: "student-123",
      itemId: "course-ai-101",
    });

    await expect(
      checkout(testStudent, {
        kind: "shop_item",
        itemId: "course-ai-101",
      }),
    ).rejects.toThrow("You already own this item");
  });

  it("applies successful payment to create shopPurchases document", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_123";
    const ref = "ea_shop_completed";
    state.documents.set(`billingIntents/${ref}`, {
      reference: ref,
      studentId: testStudent.id,
      email: testStudent.email,
      kind: "shop_item",
      itemId: "course-ai-101",
      itemTitle: "AI 101 Masterclass",
      itemType: "course",
      amount: 1500000,
    });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: {
          reference: ref,
          status: "success",
          amount: 1500000,
          currency: "NGN",
          paid_at: "2026-09-10T12:00:00.000Z",
          customer: { email: testStudent.email },
        },
      }),
    }) as unknown as typeof fetch;

    const verified = await verifyPayment(testStudent, ref);
    expect(verified.status).toBe("success");
    expect(verified.kind).toBe("shop_item");

    // Check that shopPurchases document was written
    const purchaseDoc = state.documents.get(
      `shopPurchases/${testStudent.id}_course-ai-101`,
    );
    expect(purchaseDoc).toBeDefined();
    expect(purchaseDoc!.studentId).toBe("student-123");
    expect(purchaseDoc!.itemId).toBe("course-ai-101");
    expect(purchaseDoc!.amount).toBe(15000);

    global.fetch = originalFetch;
  });
});

describe("AI-Powered Chapter Quiz & Certification System", () => {
  const instructor: AcademyUser = {
    id: "admin-1",
    name: "Lead Instructor",
    email: "instructor@eaacademy.com",
    role: "Admin",
    enrolledClassId: "system-dev",
    membershipPlan: "Premium",
    enrolledAt: "2026-01-01",
  };

  const student: AcademyUser = {
    id: "student-quiz-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "Student",
    enrolledClassId: "system-dev",
    membershipPlan: "Free",
    enrolledAt: "2026-01-01",
  };

  beforeEach(() => {
    state.documents.clear();
    state.documents.set(`users/${instructor.id}`, { ...instructor });
    state.documents.set(`users/${student.id}`, { ...student });
  });

  it("validates chapters with summary, keyLearningPoints, and quiz configuration", () => {
    const courseWithQuiz = shopItemSchema.parse({
      slug: "fullstack-architecture",
      type: "course",
      title: "Fullstack Architecture",
      price: 25000,
      category: "Systems & Development",
      thumbnailUrl: "https://example.com/thumb.png",
      published: true,
      certificateEnabled: true,
      curriculum: [
        {
          id: "ch-1",
          title: "Chapter 1: Distributed Consensus",
          description: "Leader election and state replication.",
          summary:
            "Distributed consensus ensures all non-faulty nodes agree on state transitions using quorum-based replication.",
          keyLearningPoints: [
            "Raft uses a strong leader model for log replication",
            "A majority quorum is required to commit log entries",
          ],
          order: 1,
          lessons: [
            {
              id: "les-1",
              title: "01. Raft Leader Election",
              duration: "15:00",
              videoUrl: "https://vimeo.com/111111",
              content: "Detailed overview of election timeouts and split votes.",
              resources: [],
              isFreePreview: true,
              order: 1,
            },
          ],
          quiz: {
            enabled: true,
            title: "Chapter 1 Assessment",
            required: true,
            questionCount: 4,
            retakePolicy: "limited",
            maxAttempts: 3,
            scoringMethod: "highest",
            questions: [
              {
                id: "q-mc",
                type: "multiple_choice",
                question: "What model does Raft use for log replication?",
                options: [
                  "Strong leader model",
                  "Leaderless gossip ring",
                  "Proof of work",
                  "Random broadcast",
                ],
                correctAnswer: "Strong leader model",
                explanation: "Raft elects a single strong leader to manage log replication.",
                order: 1,
              },
              {
                id: "q-tf",
                type: "true_false",
                question: "A majority quorum is required to commit log entries in Raft.",
                options: ["True", "False"],
                correctAnswer: "True",
                explanation: "Majority quorums guarantee overlap between consecutive leaders.",
                order: 2,
              },
              {
                id: "q-ma",
                type: "multiple_answer",
                question: "Select all valid node states in Raft:",
                options: ["Leader", "Follower", "Candidate", "Miner"],
                correctAnswers: ["Leader", "Follower", "Candidate"],
                explanation: "Every Raft server is in Leader, Follower, or Candidate state.",
                order: 3,
              },
              {
                id: "q-sa",
                type: "short_answer",
                question: "What mechanism resolves split votes in Raft?",
                correctAnswer: "Randomized election timeouts",
                correctAnswers: ["randomized timeouts", "election timeout"],
                explanation: "Randomized election timeouts prevent perpetual split votes.",
                order: 4,
              },
            ],
          },
        },
      ],
    });

    expect(courseWithQuiz.curriculum[0].summary).toContain("Distributed consensus");
    expect(courseWithQuiz.curriculum[0].keyLearningPoints).toHaveLength(2);
    expect(courseWithQuiz.curriculum[0].quiz?.enabled).toBe(true);
    expect(courseWithQuiz.curriculum[0].quiz?.questions).toHaveLength(4);
    expect(courseWithQuiz.curriculum[0].quiz?.retakePolicy).toBe("limited");
    expect(courseWithQuiz.curriculum[0].quiz?.scoringMethod).toBe("highest");

    const genPayload = shopQuizGenerateSchema.parse({
      chapterTitle: "Chapter 1: Distributed Consensus",
      chapterSummary: "Quorum replication.",
      keyLearningPoints: ["Raft leader election"],
      questionCount: 5,
      questionTypes: ["multiple_choice", "true_false"],
    });
    expect(genPayload.questionCount).toBe(5);

    const submitPayload = shopQuizSubmitSchema.parse({
      courseId: "course-1",
      moduleId: "ch-1",
      answers: {
        "q-mc": "Strong leader model",
        "q-ma": ["Leader", "Follower"],
      },
    });
    expect(submitPayload.moduleId).toBe("ch-1");
  });

  it("serializes and deserializes quizResults and overallQuizPercentage in supabase-data", () => {
    const progressDoc = {
      id: "student-quiz-1_course-1",
      studentId: "student-quiz-1",
      courseId: "course-1",
      completedLessonIds: ["les-1", "les-2"],
      lastLessonId: "les-2",
      completed: true,
      completedAt: "2026-09-25T08:00:00.000Z",
      certificateId: "cert-123",
      overallQuizScore: 24,
      overallQuizTotal: 30,
      overallQuizPercentage: 80,
      quizResults: {
        "ch-1": {
          moduleId: "ch-1",
          attemptsCount: 1,
          effectiveScore: 8,
          totalQuestions: 10,
          effectivePercentage: 80,
          passed: true,
          lastAttemptAt: "2026-09-25T08:00:00.000Z",
          attempts: [],
        },
      },
    };

    const dbRow = rowToDatabase("shopCourseProgress", progressDoc);
    expect(Array.isArray(dbRow.completed_lesson_ids)).toBe(true);

    const hydrated = rowFromDatabase(
      "shopCourseProgress",
      dbRow as Record<string, unknown>,
    );
    expect(hydrated.completedLessonIds).toEqual(["les-1", "les-2"]);
    expect(hydrated.overallQuizScore).toBe(24);
    expect(hydrated.overallQuizTotal).toBe(30);
    expect(hydrated.overallQuizPercentage).toBe(80);
    expect(
      (hydrated.quizResults as Record<string, { effectiveScore: number }>)["ch-1"]
        .effectiveScore,
    ).toBe(8);
  });

  it("generates chapter-grounded AI quiz questions from chapter content and learning points", async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const generated = await generateChapterQuiz(instructor, {
      courseTitle: "Color Grading Masterclass",
      chapterTitle: "Chapter 1: Primary Color Correction",
      chapterSummary:
        "Learn how to balance exposure using waveform scopes and neutralize color casts before applying creative LUTs.",
      keyLearningPoints: [
        "Always balance exposure using the Luma Waveform before creative grading",
        "Use the Vectorscope to verify accurate skin tone alignment along the skin tone line",
        "Neutralize white balance in shadows, midtones, and highlights",
      ],
      lessons: [
        {
          title: "Reading Scopes Accurately",
          content:
            "Relying on an uncalibrated monitor leads to color shifts. Scopes provide objective signal measurement.",
        },
      ],
      questionCount: 4,
      questionTypes: [
        "multiple_choice",
        "true_false",
        "multiple_answer",
        "short_answer",
      ],
    });

    expect(generated.questions).toHaveLength(4);
    expect(generated.questions.map((q) => q.type)).toEqual([
      "multiple_choice",
      "true_false",
      "multiple_answer",
      "short_answer",
    ]);
    expect((generated.questions[0].explanation || "").length).toBeGreaterThan(5);

    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  });

  it("calculates overall course quiz score across chapters and enforces the 50% certificate unlock threshold", async () => {
    const makeTenQuestions = (prefix: string) =>
      Array.from({ length: 10 }, (_, idx) => ({
        id: `${prefix}-q${idx + 1}`,
        type: "multiple_choice" as const,
        question: `Question ${idx + 1} for ${prefix}`,
        options: ["Correct Option", "Wrong A", "Wrong B", "Wrong C"],
        correctAnswer: "Correct Option",
        explanation: `Explanation for ${prefix} Q${idx + 1}`,
        order: idx + 1,
      }));

    // Create a 3-chapter course where each chapter has 10 questions (total = 30 questions)
    state.documents.set("shopItems/course-cert-test", {
      id: "course-cert-test",
      slug: "cert-test-course",
      type: "course",
      title: "Certified Systems Engineering",
      price: 20000,
      published: true,
      certificateEnabled: true,
      curriculum: [
        {
          id: "ch-1",
          title: "Chapter 1",
          description: "",
          order: 1,
          lessons: [
            {
              id: "les-1",
              title: "Lesson 1",
              duration: "10:00",
              videoUrl: "https://vimeo.com/1",
              content: "Lesson 1 content",
              resources: [],
              isFreePreview: false,
              order: 1,
            },
          ],
          quiz: {
            enabled: true,
            title: "Chapter 1 Quiz",
            required: true,
            questionCount: 10,
            retakePolicy: "unlimited",
            scoringMethod: "highest",
            questions: makeTenQuestions("ch1"),
          },
        },
        {
          id: "ch-2",
          title: "Chapter 2",
          description: "",
          order: 2,
          lessons: [],
          quiz: {
            enabled: true,
            title: "Chapter 2 Quiz",
            required: true,
            questionCount: 10,
            retakePolicy: "limited",
            maxAttempts: 2,
            scoringMethod: "latest",
            questions: makeTenQuestions("ch2"),
          },
        },
        {
          id: "ch-3",
          title: "Chapter 3",
          description: "",
          order: 3,
          lessons: [],
          quiz: {
            enabled: true,
            title: "Chapter 3 Quiz",
            required: true,
            questionCount: 10,
            retakePolicy: "single",
            scoringMethod: "highest",
            questions: makeTenQuestions("ch3"),
          },
        },
      ],
    });

    // Purchase the course for the student
    state.documents.set(`shopPurchases/${student.id}_course-cert-test`, {
      id: `${student.id}_course-cert-test`,
      studentId: student.id,
      studentName: student.name,
      studentEmail: student.email,
      itemId: "course-cert-test",
      itemType: "course",
      itemTitle: "Certified Systems Engineering",
      amount: 20000,
      currency: "NGN",
      reference: "ref-cert-test",
      createdAt: "2026-09-25T08:00:00.000Z",
    });

    const studentToken = { uid: student.id, sub: student.id, email: student.email };
    const instructorToken = { uid: instructor.id, sub: instructor.id, email: instructor.email };

    // Complete Lesson 1 first — certificate should STILL be locked because required quizzes are not completed
    const lessonProgress = (await dispatch(
      studentToken,
      "shop.course.progress",
      {
        courseId: "course-cert-test",
        lessonId: "les-1",
        completed: true,
      },
    )) as {
      certificateId: string | null;
      evaluation: { eligibleForCertificate: boolean };
    };
    expect(lessonProgress.certificateId).toBeNull();
    expect(lessonProgress.evaluation.eligibleForCertificate).toBe(false);

    // Helper to build an answer map with N correct answers out of 10
    const buildAnswers = (prefix: string, correctCount: number) => {
      const ans: Record<string, string> = {};
      for (let i = 1; i <= 10; i++) {
        ans[`${prefix}-q${i}`] = i <= correctCount ? "Correct Option" : "Wrong A";
      }
      return ans;
    };

    // First test below 50% by scoring 2/10 on Ch1, 2/10 on Ch2, and 9/10 on Ch3 => 13/30 = 43% (< 50%)
    await dispatch(studentToken, "shop.course.quiz.submit", {
      courseId: "course-cert-test",
      moduleId: "ch-1",
      answers: buildAnswers("ch1", 2),
    });

    await dispatch(studentToken, "shop.course.quiz.submit", {
      courseId: "course-cert-test",
      moduleId: "ch-2",
      answers: buildAnswers("ch2", 2),
    });

    const lowScoreSubmission = (await dispatch(
      studentToken,
      "shop.course.quiz.submit",
      {
        courseId: "course-cert-test",
        moduleId: "ch-3",
        answers: buildAnswers("ch3", 9),
      },
    )) as {
      certificateUnlocked: boolean;
      certificateId: string | null;
      evaluation: {
        overallQuizScore: number;
        overallQuizTotal: number;
        overallQuizPercentage: number;
        eligibleForCertificate: boolean;
      };
    };

    // 2 + 2 + 9 = 13 / 30 = 43% -> below 50% threshold -> Certificate Locked!
    expect(lowScoreSubmission.evaluation.overallQuizScore).toBe(13);
    expect(lowScoreSubmission.evaluation.overallQuizTotal).toBe(30);
    expect(lowScoreSubmission.evaluation.overallQuizPercentage).toBe(43);
    expect(lowScoreSubmission.evaluation.eligibleForCertificate).toBe(false);
    expect(lowScoreSubmission.certificateUnlocked).toBe(false);
    expect(lowScoreSubmission.certificateId).toBeNull();

    // Verify Chapter 3 enforces its "single" attempt policy on retake
    await expect(
      dispatch(studentToken, "shop.course.quiz.submit", {
        courseId: "course-cert-test",
        moduleId: "ch-3",
        answers: buildAnswers("ch3", 10),
      }),
    ).rejects.toThrow(/single attempt/i);

    // Retake Chapter 1 (8/10) and Chapter 2 (7/10) -> combined with Chapter 3 (9/10):
    // 8/10 + 7/10 + 9/10 = 24/30 = 80% (>= 50%) -> Certificate Unlocked!
    await dispatch(studentToken, "shop.course.quiz.submit", {
      courseId: "course-cert-test",
      moduleId: "ch-1",
      answers: buildAnswers("ch1", 8),
    });

    const passingSubmission = (await dispatch(
      studentToken,
      "shop.course.quiz.submit",
      {
        courseId: "course-cert-test",
        moduleId: "ch-2",
        answers: buildAnswers("ch2", 7),
      },
    )) as {
      certificateUnlocked: boolean;
      certificateId: string | null;
      evaluation: {
        overallQuizScore: number;
        overallQuizTotal: number;
        overallQuizPercentage: number;
        eligibleForCertificate: boolean;
      };
    };

    expect(passingSubmission.evaluation.overallQuizScore).toBe(24);
    expect(passingSubmission.evaluation.overallQuizTotal).toBe(30);
    expect(passingSubmission.evaluation.overallQuizPercentage).toBe(80);
    expect(passingSubmission.evaluation.eligibleForCertificate).toBe(true);
    expect(passingSubmission.certificateUnlocked).toBe(true);
    expect(passingSubmission.certificateId).toBeTruthy();

    // Verify Instructor Quiz Analytics Dashboard returns accurate chapter and student stats
    const analytics = (await dispatch(
      instructorToken,
      "shop.admin.quiz.analytics",
      { courseId: "course-cert-test" },
    )) as {
      overallAveragePercentage: number;
      chapters: Array<{ moduleId: string; averagePercentage: number }>;
      students: Array<{
        studentId: string;
        overallScore: number;
        overallTotal: number;
        overallPercentage: number;
        certificateUnlocked: boolean;
      }>;
    };

    expect(analytics.overallAveragePercentage).toBe(80);
    expect(analytics.students).toHaveLength(1);
    expect(analytics.students[0].overallScore).toBe(24);
    expect(analytics.students[0].overallTotal).toBe(30);
    expect(analytics.students[0].overallPercentage).toBe(80);
    expect(analytics.students[0].certificateUnlocked).toBe(true);
  });
});

