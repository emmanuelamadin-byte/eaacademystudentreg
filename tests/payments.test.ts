import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
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
  });
  const store = {
    collection: (name: string) => ({
      doc: (id: string) => reference(`${name}/${id}`),
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
import { validSignature, verifyPayment, webhook } from "../src/server/payments";
import {
  buildAbandonedCheckoutReminderContent,
  buildStudentNurtureSequence,
  buildSubscriptionReminderContent,
  formatEmailSender,
  getSubscriptionReminderStage,
  sendDonationThankYouEmail,
  sendShopPurchaseConfirmationEmail,
  sendStudentWelcomeEmail,
} from "../src/server/communications";
const user: AcademyUser = {
  id: "student",
  name: "Student",
  email: "student@example.com",
  role: "Student",
  enrolledClassId: "system-dev",
  membershipPlan: "Free",
  enrolledAt: "2026-01-01",
};
const payment = {
  reference: "ea_payment",
  status: "success",
  amount: 300000,
  currency: "NGN",
  paid_at: "2026-09-05T12:00:00.000Z",
  customer: { customer_code: "CUS_student", email: user.email },
};
beforeEach(() => {
  state.documents.clear();
  state.documents.set("users/student", { ...user });
  state.documents.set("billingIntents/ea_payment", {
    studentId: user.id,
    email: user.email,
    kind: "premium",
    amount: 300000,
    currency: "NGN",
    recurring: false,
  });
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_unit_test_only");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: true, data: payment })),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("payment verification and ledger integrity", () => {
  it("grants access only after server verification and does not double-credit retries", async () => {
    await verifyPayment(user, "ea_payment");
    await verifyPayment(user, "ea_payment");
    expect(state.documents.get("users/student")?.premiumUntil).toBe(
      "2026-10-05T12:00:00.000Z",
    );
    expect(
      [...state.documents.keys()].filter((key) => key.startsWith("payments/")),
    ).toHaveLength(1);
  });
  it("succeeds if payment was already recorded even if Paystack network fails", async () => {
    state.documents.set("payments/ea_payment", {
      studentId: user.id,
      amount: 3000,
      kind: "premium",
      status: "success",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network timeout or connection refused");
      }),
    );
    const result = await verifyPayment(user, "ea_payment");
    expect(result.status).toBe("success");
  });
  it("rejects amount mismatches without granting membership", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ status: true, data: { ...payment, amount: 100 } }),
      ),
    );
    await expect(verifyPayment(user, "ea_payment")).rejects.toMatchObject({
      status: 400,
    });
    expect(state.documents.get("users/student")?.membershipPlan).toBe("Free");
  });
  it("rejects another account trying to claim a payment", async () => {
    await expect(
      verifyPayment({ ...user, id: "other" }, "ea_payment"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("publishes anonymous recognition without donor identity", async () => {
    state.documents.set("billingIntents/ea_payment", {
      studentId: user.id,
      email: user.email,
      kind: "donation",
      amount: 300000,
      currency: "NGN",
      anonymous: true,
      donorName: "Private donor name",
    });
    await verifyPayment(user, "ea_payment");
    expect(state.documents.get("donations/ea_payment")).toMatchObject({
      anonymous: true,
      donorName: "Anonymous",
      amount: 3000,
    });
    expect(state.documents.get("donations/ea_payment")).not.toHaveProperty(
      "email",
    );
    expect(state.documents.get("users/student")?.membershipPlan).toBe("Free");
  });
  it("validates webhook signatures before calling the payment provider", async () => {
    const raw = JSON.stringify({
      event: "charge.success",
      data: { reference: "ea_payment" },
    });
    const signature = createHmac("sha512", "sk_test_unit_test_only")
      .update(raw)
      .digest("hex");
    expect(validSignature(raw, signature, "sk_test_unit_test_only")).toBe(true);
    expect(validSignature(raw + " ", signature, "sk_test_unit_test_only")).toBe(
      false,
    );
    await expect(webhook(raw, "forged")).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
    await webhook(raw, signature);
    expect(state.documents.get("users/student")?.membershipPlan).toBe(
      "Premium",
    );
  });
  it("accepts renewals only for a previously verified customer and exact plan", async () => {
    state.documents.delete("billingIntents/ea_payment");
    state.documents.set("billingCustomers/CUS_student", {
      studentId: user.id,
      email: user.email,
      planCode: "PLN_academy",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: true,
          data: { ...payment, plan: { plan_code: "PLN_other" } },
        }),
      ),
    );
    await expect(verifyPayment(user, "ea_payment")).rejects.toMatchObject({
      status: 400,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: true,
          data: { ...payment, plan: { plan_code: "PLN_academy" } },
        }),
      ),
    );
    await verifyPayment(user, "ea_payment");
    expect(state.documents.get("users/student")?.membershipPlan).toBe(
      "Premium",
    );
  });
  it("sends a branded thank-you email to donors with donation details", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "EA Academy <onboarding@resend.dev>");
    const fetchMock = vi.fn(async () =>
      Response.json({ id: "resend_123" }, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendDonationThankYouEmail({
      donorEmail: "donor@example.com",
      donorName: "Ada Lovelace",
      amount: 5000,
      reference: "ea_donation_123",
    });

    expect(result.sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key",
        }),
      }),
    );
    const callArgs = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(callArgs[1]?.body));
    expect(body.to).toEqual(["donor@example.com"]);
    expect(body.subject).toContain(
      "Thank you for supporting EA Academy scholars!",
    );
    expect(body.text).toContain("₦5,000");
    expect(body.text).toContain("ea_donation_123");
    expect(body.html).toContain("Ada Lovelace");
    expect(body.html).toContain("₦5,000");
  });
  it("sends thank-you email when a donation is fulfilled and does not duplicate on retry", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "EA Academy <onboarding@resend.dev>");
    const sentEmails: Array<{ to: string[]; subject: string; text: string }> =
      [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes("api.resend.com")) {
          const body = JSON.parse(String(init?.body));
          sentEmails.push(body);
          return Response.json({ id: "resend_123" });
        }
        return Response.json({ status: true, data: payment });
      }),
    );

    state.documents.set("billingIntents/ea_payment", {
      studentId: user.id,
      email: user.email,
      kind: "donation",
      amount: 300000,
      currency: "NGN",
      donorName: "Generous Donor",
      anonymous: false,
    });

    await verifyPayment(user, "ea_payment");
    // Give any unawaited background task a microtick to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toEqual([user.email]);
    expect(sentEmails[0].text).toContain("₦3,000");

    // Retry verification (should be idempotent and not send email again)
    await verifyPayment(user, "ea_payment");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sentEmails).toHaveLength(1);
  });

  it("identifies 7-day and 2-day subscription expiry reminder stages and builds distinct idempotency keys", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");

    // 7 days before expiry -> "7d"
    expect(
      getSubscriptionReminderStage("2026-10-08T12:00:00.000Z", now),
    ).toBe("7d");

    // 2 days before expiry -> "2d"
    expect(
      getSubscriptionReminderStage("2026-10-03T12:00:00.000Z", now),
    ).toBe("2d");

    // 15 days before expiry -> null
    expect(
      getSubscriptionReminderStage("2026-10-16T12:00:00.000Z", now),
    ).toBeNull();

    // 4 days before expiry (between 7d and 2d windows) -> null
    expect(
      getSubscriptionReminderStage("2026-10-05T12:00:00.000Z", now),
    ).toBeNull();

    // Already expired -> null
    expect(
      getSubscriptionReminderStage("2026-09-30T12:00:00.000Z", now),
    ).toBeNull();

    const reminder7d = buildSubscriptionReminderContent({
      studentId: "student_1",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      premiumUntil: "2026-10-08T12:00:00.000Z",
      stage: "7d",
    });
    expect(reminder7d.kind).toBe("subscription_reminder");
    expect(reminder7d.subject).toContain("expires in 7 days");
    expect(reminder7d.message).toContain("Hi Ada,");
    expect(reminder7d.message).toContain(
      "Access to the Academy selected courses.",
    );
    expect(reminder7d.message).not.toContain("1-on-1");
    expect(reminder7d.idempotency_key).toBe(
      "subscription_expiry:7d:student_1:2026-10-08:email",
    );

    const reminder2d = buildSubscriptionReminderContent({
      studentId: "student_1",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      premiumUntil: "2026-10-08T12:00:00.000Z",
      stage: "2d",
    });
    expect(reminder2d.kind).toBe("subscription_reminder");
    expect(reminder2d.subject).toContain("expires in 2 days");
    expect(reminder2d.message).not.toContain("1-on-1");
    expect(reminder2d.idempotency_key).toBe(
      "subscription_expiry:2d:student_1:2026-10-08:email",
    );

    expect(formatEmailSender("noreply@ea-academy.org")).toBe(
      "EA Academy <noreply@ea-academy.org>",
    );
    expect(formatEmailSender("noreply <noreply@ea-academy.org>")).toBe(
      "EA Academy <noreply@ea-academy.org>",
    );
    expect(formatEmailSender("EA Academy <onboarding@resend.dev>")).toBe(
      "EA Academy <hello@cleanbrandagency.com>",
    );
  });

  it("sends student welcome email and builds a 4-stage WhatsApp community & Premium nurture sequence", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "EA Academy <onboarding@resend.dev>");

    const sentEmails: Array<{
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        sentEmails.push(JSON.parse(String(init?.body)));
        return Response.json({ id: "resend_welcome_123" });
      }),
    );

    const welcomeRes = await sendStudentWelcomeEmail({
      studentId: "student_new",
      studentName: "Chinedu Okafor",
      studentEmail: "chinedu@example.com",
      trackName: "Systems & Software Development",
      whatsappGroupUrl: "https://chat.whatsapp.com/test-community",
    });

    expect(welcomeRes).toEqual({ sent: true });
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].from).toBe("EA Academy <hello@cleanbrandagency.com>");
    expect(sentEmails[0].to).toEqual(["chinedu@example.com"]);
    expect(sentEmails[0].subject).toContain("Welcome to EA Academy, Chinedu!");
    expect(sentEmails[0].text).toContain("Systems & Software Development");
    expect(sentEmails[0].text).toContain("https://chat.whatsapp.com/test-community");
    expect(sentEmails[0].text.toLowerCase()).not.toContain("ai mentor");
    expect(sentEmails[0].text.toLowerCase()).not.toContain("ai tutor");

    const enrolledAt = new Date("2026-09-27T10:00:00.000Z");
    const sequence = buildStudentNurtureSequence({
      studentId: "student_new",
      studentName: "Chinedu Okafor",
      studentEmail: "chinedu@example.com",
      trackName: "Systems & Software Development",
      whatsappGroupUrl: "https://chat.whatsapp.com/test-community",
      enrolledAt,
    });

    expect(sequence).toHaveLength(4);
    expect(sequence.map((s) => s.template_variables.stage)).toEqual([
      "day2",
      "day4",
      "day7",
      "day10",
    ]);
    expect(sequence[0].scheduled_for).toBe("2026-09-29T10:00:00.000Z");
    expect(sequence[1].scheduled_for).toBe("2026-10-01T10:00:00.000Z");
    expect(sequence[2].scheduled_for).toBe("2026-10-04T10:00:00.000Z");
    expect(sequence[3].scheduled_for).toBe("2026-10-07T10:00:00.000Z");

    for (const item of sequence) {
      expect(item.kind).toBe("nurture");
      expect(item.message).toContain("WhatsApp");
      expect(item.message.toLowerCase()).not.toContain("ai mentor");
      expect(item.message.toLowerCase()).not.toContain("ai tutor");
    }
    expect(sequence[2].message).toContain("₦3,000/month");
    expect(sequence[2].message).toContain("₦100 a day");
  });

  it("sends confirmation email when a student buys a course or digital product and does not duplicate on retry", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "EA Academy <onboarding@resend.dev>");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://ea-academy.org");

    const sentEmails: Array<{
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes("api.resend.com")) {
          sentEmails.push(JSON.parse(String(init?.body)));
          return Response.json({ id: "resend_shop_123" });
        }
        return Response.json({
          status: true,
          data: {
            ...payment,
            reference: "ea_shop_course_1",
            amount: 1500000,
          },
        });
      }),
    );

    state.documents.set("shopItems/course_ai", {
      id: "course_ai",
      slug: "ai-masterclass",
      type: "course",
      title: "AI Engineering Masterclass",
      price: 15000,
      published: true,
    });
    state.documents.set("billingIntents/ea_shop_course_1", {
      reference: "ea_shop_course_1",
      studentId: user.id,
      email: user.email,
      kind: "shop_item",
      itemId: "course_ai",
      itemTitle: "AI Engineering Masterclass",
      itemType: "course",
      itemSlug: "ai-masterclass",
      amount: 1500000,
      currency: "NGN",
    });

    await verifyPayment(user, "ea_shop_course_1");
    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toEqual([user.email]);
    expect(sentEmails[0].subject).toContain(
      "Course Unlocked: AI Engineering Masterclass",
    );
    expect(sentEmails[0].text).toContain("₦15,000");
    expect(sentEmails[0].text).toContain(
      "https://ea-academy.org/app/learn-course/course_ai",
    );
    expect(sentEmails[0].html).toContain("Start Learning Now");

    // Retry verification must not send a second email
    await verifyPayment(user, "ea_shop_course_1");
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(sentEmails).toHaveLength(1);

    // Direct test for Digital Product email layout
    const prodRes = await sendShopPurchaseConfirmationEmail({
      studentId: user.id,
      studentEmail: user.email,
      studentName: "Ada Lovelace",
      itemId: "prod_handbook",
      itemTitle: "System Design Handbook PDF",
      itemType: "digital_product",
      itemSlug: "system-design-handbook",
      amount: 8000,
      reference: "ea_shop_prod_1",
      whatsappGroupUrl: "https://chat.whatsapp.com/test-community",
    });

    expect(prodRes).toEqual({ sent: true });
    expect(sentEmails).toHaveLength(2);
    expect(sentEmails[1].subject).toContain(
      "Your Download Is Ready: System Design Handbook PDF",
    );
    expect(sentEmails[1].text).toContain("₦8,000");
    expect(sentEmails[1].text).toContain(
      "https://ea-academy.org/app/library?purchased=prod_handbook",
    );
    expect(sentEmails[1].html).toContain("Access &amp; Download in My Library");
  });

  it("builds abandoned checkout follow-up reminders with recovery links and deduplicated idempotency keys", () => {
    const createdAt = "2026-09-29T10:00:00.000Z";

    const courseReminder = buildAbandonedCheckoutReminderContent({
      reference: "ea_abandoned_1",
      studentId: "student_1",
      studentName: "Chinedu Okafor",
      email: "chinedu@example.com",
      kind: "shop_item",
      itemId: "course_ai",
      itemTitle: "AI Engineering Masterclass",
      itemType: "course",
      itemSlug: "ai-masterclass",
      amountNaira: 15000,
      createdAt,
    });

    expect(courseReminder.kind).toBe("abandoned_checkout");
    expect(courseReminder.subject).toContain(
      'Still thinking about "AI Engineering Masterclass", Chinedu?',
    );
    expect(courseReminder.scheduled_for).toBe("2026-09-29T11:00:00.000Z");
    expect(courseReminder.template_variables.ctaPath).toBe(
      "/shop/ai-masterclass?buy=course_ai",
    );
    expect(courseReminder.template_variables.amountFormatted).toBe("₦15,000");
    expect(courseReminder.idempotency_key).toBe(
      "abandoned_checkout:shop_item:student_1:course_ai:2026-09-29:email",
    );

    const productReminder = buildAbandonedCheckoutReminderContent({
      reference: "ea_abandoned_2",
      studentId: "student_1",
      studentName: "Chinedu Okafor",
      email: "chinedu@example.com",
      kind: "shop_item",
      itemId: "prod_handbook",
      itemTitle: "System Design Handbook PDF",
      itemType: "digital_product",
      itemSlug: "system-design-handbook",
      amountNaira: 8000,
      createdAt,
    });

    expect(productReminder.subject).toContain(
      'You left "System Design Handbook PDF" in your checkout, Chinedu',
    );
    expect(productReminder.template_variables.ctaPath).toBe(
      "/shop/system-design-handbook?buy=prod_handbook",
    );
    expect(productReminder.template_variables.ctaLabel).toContain(
      "Complete My Order & Download",
    );

    const premiumReminder = buildAbandonedCheckoutReminderContent({
      reference: "ea_abandoned_3",
      studentId: "student_1",
      studentName: "Chinedu Okafor",
      email: "chinedu@example.com",
      kind: "premium",
      amountNaira: 3000,
      createdAt,
    });

    expect(premiumReminder.subject).toContain(
      "Complete your EA Academy Premium upgrade, Chinedu",
    );
    expect(premiumReminder.template_variables.ctaPath).toBe("/app/billing");
    expect(premiumReminder.idempotency_key).toBe(
      "abandoned_checkout:premium:student_1:2026-09-29:email",
    );
  });
});

import { summarizeRevenueAnalytics } from "../src/lib/revenue";

describe("admin 4-stream revenue analytics", () => {
  it("breaks down revenue into courses, digital products, premium memberships, and donations without double counting", () => {
    const nowMs = Date.parse("2026-09-27T12:00:00.000Z");

    const summary = summarizeRevenueAnalytics({
      nowMs,
      period: "all",
      payments: [
        {
          id: "ref_course_1",
          reference: "ref_course_1",
          studentId: "s1",
          amount: 15000,
          kind: "shop_item",
          status: "success",
          createdAt: "2026-09-26T10:00:00.000Z",
        },
        {
          id: "ref_product_1",
          reference: "ref_product_1",
          studentId: "s1",
          amount: 5000,
          kind: "shop_item",
          status: "success",
          createdAt: "2026-09-25T10:00:00.000Z",
        },
        {
          id: "ref_premium_1",
          reference: "ref_premium_1",
          studentId: "s2",
          amount: 3000,
          kind: "premium",
          status: "success",
          createdAt: "2026-09-20T10:00:00.000Z",
        },
        {
          id: "ref_donation_1",
          reference: "ref_donation_1",
          studentId: "s3",
          amount: 10000,
          kind: "donation",
          status: "success",
          createdAt: "2026-08-01T10:00:00.000Z",
        },
      ],
      shopPurchases: [
        {
          id: "s1_course_1",
          studentId: "s1",
          studentEmail: "ada@example.com",
          studentName: "Ada Lovelace",
          itemId: "course_1",
          itemSlug: "ai-masterclass",
          itemTitle: "AI Engineering Masterclass",
          itemType: "course",
          amount: 15000,
          paymentReference: "ref_course_1",
          purchasedAt: "2026-09-26T10:00:00.000Z",
        },
        {
          id: "s1_prod_1",
          studentId: "s1",
          studentEmail: "ada@example.com",
          studentName: "Ada Lovelace",
          itemId: "prod_1",
          itemSlug: "design-handbook",
          itemTitle: "System Design Handbook PDF",
          itemType: "digital_product",
          amount: 5000,
          paymentReference: "ref_product_1",
          purchasedAt: "2026-09-25T10:00:00.000Z",
        },
      ],
      donations: [
        {
          id: "ref_donation_1",
          donorName: "Chidi Supporter",
          amount: 10000,
          anonymous: false,
          createdAt: "2026-08-01T10:00:00.000Z",
        },
      ],
      users: [
        {
          id: "s1",
          name: "Ada Lovelace",
          email: "ada@example.com",
          role: "Student",
          enrolledClassId: "system-dev",
          membershipPlan: "Free",
          enrolledAt: "2026-01-01",
        },
        {
          id: "s2",
          name: "Grace Hopper",
          email: "grace@example.com",
          role: "Student",
          enrolledClassId: "system-dev",
          membershipPlan: "Premium",
          premiumUntil: "2026-10-20T10:00:00.000Z",
          subscriptionCode: "SUB_123",
          enrolledAt: "2026-01-01",
        },
      ],
      shopItems: [
        {
          id: "course_1",
          slug: "ai-masterclass",
          type: "course",
          title: "AI Engineering Masterclass",
          subtitle: "",
          description: "",
          price: 15000,
          category: "Systems & Development",
          tags: [],
          thumbnailUrl: "",
          whatYouWillLearn: [],
          published: true,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
        {
          id: "prod_1",
          slug: "design-handbook",
          type: "digital_product",
          title: "System Design Handbook PDF",
          subtitle: "",
          description: "",
          price: 5000,
          category: "Systems & Development",
          tags: [],
          thumbnailUrl: "",
          whatYouWillLearn: [],
          published: true,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      ],
      settings: {
        scholarshipGoal: 50000,
        scholarshipCost: 3000,
      },
    });

    expect(summary.totalRevenue).toBe(33000);
    expect(summary.storeRevenue).toBe(20000);
    expect(summary.streams.course.revenue).toBe(15000);
    expect(summary.streams.course.count).toBe(1);
    expect(summary.streams.digital_product.revenue).toBe(5000);
    expect(summary.streams.digital_product.count).toBe(1);
    expect(summary.streams.premium.revenue).toBe(3000);
    expect(summary.streams.premium.count).toBe(1);
    expect(summary.streams.donation.revenue).toBe(10000);
    expect(summary.streams.donation.count).toBe(1);
    expect(summary.metrics.activePaidMembersCount).toBe(1);
    expect(summary.metrics.recurringSubscribersCount).toBe(1);
    expect(summary.metrics.scholarshipGoalPercent).toBe(20);
    expect(summary.itemPerformance).toHaveLength(2);
    expect(summary.itemPerformance[0].title).toBe("AI Engineering Masterclass");
    expect(summary.itemPerformance[0].periodRevenue).toBe(15000);

    // Filter to 7 days (excludes the August donation and Sept 20 premium payment)
    const last7d = summarizeRevenueAnalytics({
      nowMs,
      period: "7d",
      payments: summary.allTransactions.map((t) => ({
        id: t.id,
        reference: t.reference,
        studentId: t.studentId || "s1",
        amount: t.amount,
        kind:
          t.stream === "premium"
            ? "premium"
            : t.stream === "donation"
              ? "donation"
              : "shop_item",
        status: "success",
        createdAt: t.createdAt,
      })),
      shopPurchases: [
        {
          id: "s1_course_1",
          studentId: "s1",
          studentEmail: "ada@example.com",
          studentName: "Ada Lovelace",
          itemId: "course_1",
          itemSlug: "ai-masterclass",
          itemTitle: "AI Engineering Masterclass",
          itemType: "course",
          amount: 15000,
          paymentReference: "ref_course_1",
          purchasedAt: "2026-09-26T10:00:00.000Z",
        },
        {
          id: "s1_prod_1",
          studentId: "s1",
          studentEmail: "ada@example.com",
          studentName: "Ada Lovelace",
          itemId: "prod_1",
          itemSlug: "design-handbook",
          itemTitle: "System Design Handbook PDF",
          itemType: "digital_product",
          amount: 5000,
          paymentReference: "ref_product_1",
          purchasedAt: "2026-09-25T10:00:00.000Z",
        },
      ],
    });
    expect(last7d.totalRevenue).toBe(20000);
    expect(last7d.allTimeRevenue).toBe(33000);
    expect(last7d.streams.course.revenue).toBe(15000);
    expect(last7d.streams.digital_product.revenue).toBe(5000);
    expect(last7d.streams.premium.revenue).toBe(0);
    expect(last7d.streams.donation.revenue).toBe(0);
  });
});




