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
  buildSubscriptionReminderContent,
  getSubscriptionReminderStage,
  sendDonationThankYouEmail,
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
  });
});


