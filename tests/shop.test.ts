import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  shopItemSchema,
  shopCourseModuleSchema,
  shopCourseLessonSchema,
  shopProgressUpdateSchema,
} from "../src/server/schemas";
import type { AcademyUser } from "../src/lib/types";

const state = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../src/server/supabase", () => {
  const snapshot = (path: string) => ({
    exists: state.documents.has(path),
    data: () => state.documents.get(path),
  });
  const reference = (path: string) => ({
    path,
    get: async () => snapshot(path),
    update: async (value: Record<string, unknown>) =>
      state.documents.set(path, { ...state.documents.get(path), ...value }),
    delete: async () => state.documents.delete(path),
    set: async (value: Record<string, unknown>) => state.documents.set(path, value),
    create: async (value: Record<string, unknown>) => state.documents.set(path, value),
  });
  const store = {
    collection: (name: string) => ({
      doc: (id: string) => reference(`${name}/${id}`),
      where: () => ({
        get: async () => ({
          empty: true,
          docs: [],
        }),
      }),
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
  return { db: () => store, limit: async () => {} };
});

import { checkout, verifyPayment } from "../src/server/payments";

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
