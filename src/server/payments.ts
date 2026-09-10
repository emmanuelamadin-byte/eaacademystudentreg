import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AcademyUser } from "@/lib/types";
import { db, limit } from "./supabase";
import { ApiError, extendPremiumUntil, premiumAmountKobo } from "./policy";

type PaystackTransaction = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  paid_at: string;
  customer: { customer_code: string; email: string };
  plan?: string | { plan_code?: string };
  plan_object?: { plan_code?: string };
  subscription?: { subscription_code?: string };
};
function secret() {
  const value = process.env.PAYSTACK_SECRET_KEY;
  if (!value) throw new ApiError(503, "Paystack has not been configured.");
  return value;
}
async function paystack<T>(
  path: string,
  method = "GET",
  body?: object,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.paystack.co${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      502,
      "Paystack is temporarily unavailable. Please try again.",
    );
  }
  const value = await response.json();
  if (!response.ok || !value.status)
    throw new ApiError(
      502,
      "Paystack could not complete this request. Please check your payment settings or try again.",
    );
  return value.data as T;
}
export async function checkout(user: AcademyUser, p: Record<string, unknown>) {
  await limit(user.id, "checkout", 6);
  const input = z
    .object({
      kind: z.enum(["premium", "donation", "shop_item"]),
      amount: z.number().min(100).max(10000000).optional(),
      donorName: z.string().trim().max(100).optional(),
      anonymous: z.boolean().default(false),
      recurring: z.boolean().default(true),
      itemId: z.string().optional(),
    })
    .parse(p);
  if (!user.email)
    throw new ApiError(
      400,
      "Add a verified sign-in email before making a payment.",
    );
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin)
    throw new ApiError(
      503,
      "The public application URL has not been configured.",
    );

  let amount: number;
  let shopItemData: Record<string, unknown> | null = null;

  if (input.kind === "premium") {
    amount = premiumAmountKobo();
  } else if (input.kind === "shop_item") {
    if (!input.itemId) {
      throw new ApiError(400, "Choose an item to purchase.");
    }
    const itemDoc = await db().collection("shopItems").doc(input.itemId).get();
    if (!itemDoc.exists || !itemDoc.data()?.published) {
      throw new ApiError(404, "This course or product is no longer available.");
    }
    shopItemData = itemDoc.data()!;
    const alreadyPurchased = await db()
      .collection("shopPurchases")
      .doc(`${user.id}_${input.itemId}`)
      .get();
    if (alreadyPurchased.exists) {
      throw new ApiError(
        409,
        "You already own this item. View it anytime in your Library.",
      );
    }
    amount = Math.round(Number(shopItemData!.price) * 100);
  } else {
    amount = Math.round((input.amount || 0) * 100);
  }

  if (amount < 10000) throw new ApiError(400, "The minimum amount is ₦100.");
  let plan: string | undefined;
  if (input.kind === "premium" && input.recurring) {
    plan = process.env.PAYSTACK_MONTHLY_PLAN_CODE;
    if (!plan)
      throw new ApiError(
        503,
        "The monthly Paystack subscription plan has not been configured.",
      );
    const configured = await paystack<{
      amount: number;
      currency: string;
      interval: string;
    }>(`/plan/${encodeURIComponent(plan)}`);
    if (
      configured.amount !== amount ||
      configured.currency !== "NGN" ||
      configured.interval !== "monthly"
    )
      throw new ApiError(
        503,
        "The Paystack plan must be ₦3,000, NGN, billed monthly.",
      );
    if (user.subscriptionCode)
      throw new ApiError(
        409,
        "You already have a recurring subscription. Manage it from your billing page.",
      );
  }
  const reference = `ea_${randomUUID().replaceAll("-", "")}`;
  await db()
    .collection("billingIntents")
    .doc(reference)
    .create({
      reference,
      studentId: user.id,
      email: user.email,
      kind: input.kind,
      itemId: input.itemId || null,
      itemTitle: shopItemData?.title || null,
      itemType: shopItemData?.type || null,
      itemSlug: shopItemData?.slug || null,
      amount,
      currency: "NGN",
      recurring: !!plan,
      planCode: plan || null,
      donorName: input.anonymous ? "Anonymous" : input.donorName || user.name,
      anonymous: input.anonymous,
      createdAt: new Date().toISOString(),
      status: "pending",
    });

  const callbackUrl =
    input.kind === "shop_item"
      ? `${origin.replace(/\/$/, "")}/app/library?purchased=${encodeURIComponent(input.itemId || "")}&ref=${encodeURIComponent(reference)}`
      : `${origin.replace(/\/$/, "")}/app/billing`;

  const result = await paystack<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>("/transaction/initialize", "POST", {
    email: user.email,
    amount,
    currency: "NGN",
    reference,
    callback_url: callbackUrl,
    channels: plan ? ["card"] : ["card", "bank_transfer"],
    ...(plan ? { plan } : {}),
    metadata: {
      academyReference: reference,
      kind: input.kind,
      itemId: input.itemId || undefined,
    },
  });
  return {
    url: result.authorization_url,
    authorization_url: result.authorization_url,
    authorizationUrl: result.authorization_url,
    reference: result.reference,
  };
}
export function validSignature(
  raw: string,
  signature: string | null,
  key: string,
) {
  if (!signature || !/^[a-fA-F0-9]{128}$/.test(signature)) return false;
  const expected = createHmac("sha512", key).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
function planCode(transaction: PaystackTransaction) {
  return typeof transaction.plan === "string"
    ? transaction.plan
    : transaction.plan?.plan_code || transaction.plan_object?.plan_code;
}
async function applyPayment(
  transaction: PaystackTransaction,
  requesterId?: string,
) {
  if (transaction.status !== "success")
    throw new ApiError(
      409,
      "Your payment is not confirmed yet. Please try verification again shortly.",
    );
  if (!/^[a-zA-Z0-9_.-]{1,160}$/.test(transaction.reference))
    throw new ApiError(400, "Invalid payment reference.");
  const store = db(),
    intentRef = store.collection("billingIntents").doc(transaction.reference),
    paymentRef = store.collection("payments").doc(transaction.reference);
  const initial = await intentRef.get();
  let intent = initial.data();
  if (!intent) {
    // Renewal references are generated by Paystack. Resolve only previously verified customers on our exact plan.
    const customerCode = transaction.customer?.customer_code;
    if (!customerCode || !/^[A-Za-z0-9_-]+$/.test(customerCode))
      throw new ApiError(400, "Unknown payment customer.");
    const binding = (
      await store.collection("billingCustomers").doc(customerCode).get()
    ).data();
    if (
      !binding ||
      !binding.planCode ||
      planCode(transaction) !== binding.planCode
    )
      throw new ApiError(
        400,
        "This payment is not linked to an academy subscription.",
      );
    intent = {
      ...binding,
      kind: "premium",
      amount: premiumAmountKobo(),
      currency: "NGN",
      recurring: true,
    };
  }
  if (requesterId && intent.studentId !== requesterId)
    throw new ApiError(403, "This payment belongs to a different account.");
  if (
    transaction.currency !== "NGN" ||
    transaction.amount !== intent.amount ||
    transaction.customer?.email?.toLowerCase() !==
      String(intent.email).toLowerCase()
  )
    throw new ApiError(
      400,
      "The payment amount, currency, or account does not match.",
    );
  if (intent.recurring && planCode(transaction) !== intent.planCode)
    throw new ApiError(
      400,
      "The payment does not match the monthly subscription plan.",
    );
  const ownerRef = store.collection("users").doc(intent.studentId);
  await store.runTransaction(async (tx) => {
    const [existing, owner] = await Promise.all([
      tx.get(paymentRef),
      tx.get(ownerRef),
    ]);
    if (existing.exists) return;
    if (!owner.exists) throw new ApiError(404, "Payment account not found.");
    const paidAt = new Date(transaction.paid_at).toISOString();
    tx.create(paymentRef, {
      id: transaction.reference,
      reference: transaction.reference,
      studentId: intent!.studentId,
      amount: transaction.amount / 100,
      kind: intent!.kind,
      status: "success",
      paidAt,
      createdAt: paidAt,
    });
    if (intent!.kind === "premium") {
      tx.update(ownerRef, {
        membershipPlan: "Premium",
        premiumUntil: extendPremiumUntil(owner.data()?.premiumUntil, paidAt),
        ...(transaction.subscription?.subscription_code
          ? { subscriptionCode: transaction.subscription.subscription_code }
          : {}),
      });
      if (intent!.recurring) {
        tx.set(
          store
            .collection("billingCustomers")
            .doc(transaction.customer.customer_code),
          {
            studentId: intent!.studentId,
            email: intent!.email,
            planCode: intent!.planCode,
            customerCode: transaction.customer.customer_code,
          },
        );
      }
    } else if (intent!.kind === "shop_item") {
      const purchaseId = `${intent!.studentId}_${intent!.itemId}`;
      tx.set(store.collection("shopPurchases").doc(purchaseId), {
        id: purchaseId,
        studentId: intent!.studentId,
        studentEmail: intent!.email,
        studentName: owner.data()?.name || intent!.donorName || "Student",
        itemId: intent!.itemId,
        itemSlug: intent!.itemSlug || "",
        itemTitle: intent!.itemTitle || "",
        itemType: intent!.itemType || "course",
        amount: transaction.amount / 100,
        paymentReference: transaction.reference,
        purchasedAt: paidAt,
        createdAt: paidAt,
      });
      if (intent!.itemId) {
        const itemRef = store.collection("shopItems").doc(String(intent!.itemId));
        tx.update(itemRef, {
          salesCount: (itemRef as unknown as { salesCount?: number })?.salesCount
            ? Number((itemRef as unknown as { salesCount?: number }).salesCount) + 1
            : 1,
          updatedAt: paidAt,
        });
      }
    } else {
      tx.create(store.collection("donations").doc(transaction.reference), {
        id: transaction.reference,
        donorName: intent!.anonymous ? "Anonymous" : intent!.donorName,
        anonymous: !!intent!.anonymous,
        amount: transaction.amount / 100,
        createdAt: paidAt,
      });
    }
    if (initial.exists) tx.update(intentRef, { status: "success" });
  });
  return {
    status: "success",
    reference: transaction.reference,
    kind: intent.kind,
  };
}
export async function verifyPayment(user: AcademyUser, reference: string) {
  await limit(user.id, "verify", 12);
  const transaction = await paystack<PaystackTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  return applyPayment(transaction, user.id);
}
export async function webhook(raw: string, signature: string | null) {
  if (!validSignature(raw, signature, secret()))
    throw new ApiError(401, "Invalid webhook signature.");
  const event = JSON.parse(raw);
  if (event.event === "charge.success") {
    const reference = z
      .string()
      .regex(/^[a-zA-Z0-9_.-]{1,160}$/)
      .parse(event.data?.reference);
    const transaction = await paystack<PaystackTransaction>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    try {
      await applyPayment(transaction);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400)
        return { received: true, ignored: true };
      throw error;
    }
  }
  if (
    [
      "subscription.create",
      "subscription.disable",
      "subscription.not_renew",
    ].includes(event.event)
  ) {
    const data = event.data,
      code = data?.customer?.customer_code;
    if (typeof code === "string" && /^[A-Za-z0-9_-]+$/.test(code)) {
      const binding = (
        await db().collection("billingCustomers").doc(code).get()
      ).data();
      if (
        binding &&
        data.plan?.plan_code === binding.planCode &&
        typeof data.subscription_code === "string"
      ) {
        await db()
          .collection("users")
          .doc(binding.studentId)
          .update(
            event.event === "subscription.create"
              ? { subscriptionCode: data.subscription_code }
              : { subscriptionCode: null },
          );
      }
    }
  }
  return { received: true };
}
export async function manageSubscription(user: AcademyUser) {
  await limit(user.id, "manage", 5);
  let code = user.subscriptionCode;
  if (!code) {
    const bindings = await db()
      .collection("billingCustomers")
      .where("studentId", "==", user.id)
      .limit(1)
      .get();
    if (!bindings.empty) {
      const customer = await paystack<{
        subscriptions?: {
          subscription_code: string;
          status: string;
          plan?: { plan_code: string };
        }[];
      }>(`/customer/${encodeURIComponent(bindings.docs[0].id)}`);
      code = customer.subscriptions?.find(
        (sub) =>
          sub.status === "active" &&
          sub.plan?.plan_code === bindings.docs[0].data().planCode,
      )?.subscription_code;
      if (code)
        await db()
          .collection("users")
          .doc(user.id)
          .update({ subscriptionCode: code });
    }
  }
  if (!code)
    throw new ApiError(
      404,
      "No active recurring subscription was found. One-month passes do not renew.",
    );
  const result = await paystack<{ link: string }>(
    `/subscription/${encodeURIComponent(code)}/manage/link`,
  );
  return { url: result.link };
}
