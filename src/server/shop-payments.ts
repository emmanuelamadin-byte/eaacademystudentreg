import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminClient, actor, db, type AuthToken } from "./supabase";
import { ApiError, hasPremium } from "./policy";
import { paystack, type PaystackTransaction } from "./payments";
import { sendShopPurchaseConfirmationEmail } from "./communications";
import { sendTikTokServerEvent } from "./tiktok";
import { sendMetaServerEvent } from "./meta";
import { normalizePurchaseEmail } from "@/lib/landing-pages";
import {
  landingPagesEnabled,
  purchaseFirstEnabled,
} from "@/lib/commerce-flags";
type DeferShopWork = (work: () => Promise<void>) => void;

function databaseError(error: { message: string } | null) {
  if (!error) return;
  console.error("Shop payment database:", error.message);
  throw new ApiError(
    503,
    "We could not finish this step. Your confirmed payment is safe; please try again shortly.",
  );
}
function enabled() {
  if (!purchaseFirstEnabled)
    throw new ApiError(404, "Purchase-first checkout is not enabled yet.");
}
export function isVerifiedGoogle(token: AuthToken) {
  return (
    token.email_verified === true &&
    Boolean(token.email) &&
    (token.provider === "google" ||
      token.providers?.includes("google") === true)
  );
}
const referenceSchema = z.string().regex(/^ea_[a-zA-Z0-9_-]{20,100}$/);
export const shopCheckoutSchema = z.object({
  itemId: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/),
  expectedPrice: z.number().int().min(100).max(10000000),
  name: z.string().trim().min(1).max(150),
  email: z.email().max(254).transform(normalizePurchaseEmail),
  campaignId: z.string().uuid().optional(),
  visitId: z.string().uuid().optional(),
  utm: z
    .object({
      utm_source: z.string().max(150).optional(),
      utm_medium: z.string().max(150).optional(),
      utm_campaign: z.string().max(150).optional(),
      utm_content: z.string().max(150).optional(),
      utm_term: z.string().max(150).optional(),
    })
    .default({}),
});

export async function initializeShopCheckout(
  payload: unknown,
  token?: AuthToken,
  defer?: DeferShopWork,
) {
  enabled();
  if (process.env.SHOP_CHECKOUT_PAUSED === "true")
    throw new ApiError(
      503,
      "New purchases are temporarily unavailable. If you already paid, use the link in your receipt to access your purchase.",
    );
  const input = shopCheckoutSchema.parse(payload);
  const product = await db().collection("shopItems").doc(input.itemId).get();
  const item = product.data();
  if (!item?.published)
    throw new ApiError(404, "This course or product is not available.");
  let studentId: string | null = null;
  if (token) {
    if (!isVerifiedGoogle(token))
      throw new ApiError(403, "Use a verified Google account to purchase.");
    if (input.email !== normalizePurchaseEmail(token.email!))
      throw new ApiError(
        400,
        "Use your signed-in Google email, or sign out to use another account.",
      );
    const profile = await db().collection("users").doc(token.uid).get();
    if (profile.exists) {
      studentId = token.uid;
      const user = await actor(token);
      const owned = await db()
        .collection("shopPurchases")
        .doc(`${token.uid}_${input.itemId}`)
        .get();
      if (owned.exists)
        return {
          accessUrl:
            item.type === "course"
              ? `/app/learn-course/${input.itemId}`
              : `/app/library?purchased=${input.itemId}`,
        };
      if (item.type === "course" && item.includedInPremium && hasPremium(user))
        return { accessUrl: `/app/learn-course/${input.itemId}` };
    }
  }
  if (input.campaignId) {
    if (!landingPagesEnabled)
      throw new ApiError(404, "Campaign not available.");
    const { data: campaign, error } = await adminClient()
      .from("shop_landing_pages")
      .select("id,item_id,published")
      .eq("id", input.campaignId)
      .maybeSingle();
    databaseError(error);
    if (!campaign?.published || campaign.item_id !== input.itemId)
      throw new ApiError(400, "This campaign is no longer available.");
  }
  const amount = Math.round(Number(item.price) * 100);
  if (Number(item.price) !== input.expectedPrice)
    throw new ApiError(
      409,
      "The product price changed. Reload checkout to review the current price before paying.",
    );
  if (!Number.isSafeInteger(amount) || amount < 10000)
    throw new ApiError(400, "This product does not have a valid price.");
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin)
    throw new ApiError(
      503,
      "The public application URL has not been configured.",
    );
  const reference = `ea_${randomUUID().replaceAll("-", "")}`;
  const { error } = await adminClient()
    .from("billing_intents")
    .insert({
      reference,
      student_id: studentId,
      email: input.email,
      buyer_name: input.name,
      donor_name: input.name,
      anonymous: false,
      recurring: false,
      guest: studentId === null,
      kind: "shop_item",
      item_id: input.itemId,
      item_title: item.title,
      item_slug: item.slug,
      item_type: item.type,
      amount_kobo: amount,
      currency: "NGN",
      status: "pending",
      campaign_id: input.campaignId || null,
      visit_id: input.visitId || null,
      utm: input.utm,
      created_at: new Date().toISOString(),
    });
  databaseError(error);
  try {
    const result = await paystack<{ authorization_url: string }>(
      "/transaction/initialize",
      "POST",
      {
        reference,
        email: input.email,
        amount,
        currency: "NGN",
        channels: ["card", "bank_transfer"],
        callback_url: `${origin.replace(/\/$/, "")}/checkout/complete?reference=${encodeURIComponent(reference)}`,
        metadata: {
          academyReference: reference,
          kind: "shop_item",
          itemId: input.itemId,
          campaignId: input.campaignId,
        },
      },
    );
    const { error: initializedError } = await adminClient()
      .from("billing_intents")
      .update({ initialized_at: new Date().toISOString() })
      .eq("reference", reference);
    databaseError(initializedError);
    const properties = {
      value: amount / 100,
      currency: "NGN",
      content_id: input.itemId,
      content_type: "product",
      content_name: String(item.title),
    };
    const track = async () => {
      await sendTikTokServerEvent({
        event: "InitiateCheckout",
        event_id: `checkout_${reference}`,
        properties,
        user: { email: input.email, external_id: studentId || undefined },
      }).catch(() => {});
    };
    if (defer) defer(track);
    else await track();
    return { authorizationUrl: result.authorization_url, reference };
  } catch (cause) {
    // Keep the intent pending: initialization may have reached the provider even
    // when its response was lost. A later verified success must still fulfill it.
    throw cause;
  }
}

export async function applyShopPayment(
  transaction: PaystackTransaction,
  defer?: DeferShopWork,
) {
  if (transaction.status !== "success")
    throw new ApiError(409, "Payment is not confirmed yet.");
  const { data: fresh, error } = await adminClient().rpc(
    "fulfill_shop_payment",
    {
      p_reference: transaction.reference,
      p_email: transaction.customer.email,
      p_amount: transaction.amount,
      p_currency: transaction.currency,
      p_paid_at: transaction.paid_at,
    },
  );
  databaseError(error);
  const finish = async () => {
    const { data: intent, error: intentError } = await adminClient()
      .from("billing_intents")
      .select("*")
      .eq("reference", transaction.reference)
      .single();
    databaseError(intentError);
    if (fresh && intent) {
      const properties = {
        value: transaction.amount / 100,
        currency: "NGN",
        content_id: intent.item_id,
        content_type: "product",
        content_name: intent.item_title,
      };
      const user = {
        email: intent.email,
        external_id: intent.student_id || undefined,
      };
      await Promise.allSettled([
        sendTikTokServerEvent({
          event: "Purchase",
          event_id: `purchase_${transaction.reference}`,
          properties,
          user,
        }),
        sendMetaServerEvent({
          event: "Purchase",
          event_id: `purchase_${transaction.reference}`,
          properties,
          user,
        }),
      ]);
    }
    await deliverShopReceipt(transaction.reference).catch((cause) =>
      console.error("Shop receipt:", cause),
    );
  };
  const work = async () => {
    await finish().catch((cause) =>
      console.error("Shop payment follow-up:", cause),
    );
  };
  // The payment and receipt job are already durable. Customer-facing routes
  // register this work with Next's after(), so email/ads never delay access.
  if (defer) defer(work);
  else await work();
  return {
    status: "success",
    reference: transaction.reference,
    kind: "shop_item",
    amount: transaction.amount / 100,
  };
}

export async function getShopPaymentStatus(
  referenceValue: unknown,
  defer?: DeferShopWork,
) {
  enabled();
  const reference = referenceSchema.parse(referenceValue);
  const { data: intent, error } = await adminClient()
    .from("billing_intents")
    .select("reference,kind,status,item_id,item_title,item_type")
    .eq("reference", reference)
    .eq("kind", "shop_item")
    .maybeSingle();
  databaseError(error);
  if (!intent)
    throw new ApiError(
      404,
      "Payment could not be found. Check the link in your receipt or contact support.",
    );
  let status = intent.status;
  if (status !== "success") {
    const transaction = await paystack<PaystackTransaction>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    if (transaction.status === "success") {
      await applyShopPayment(transaction, defer);
      status = "success";
    } else {
      status = ["failed", "abandoned", "reversed"].includes(transaction.status)
        ? transaction.status
        : "pending";
    }
  } else {
    const receipt = async () => {
      await deliverShopReceipt(reference).catch(() => {});
    };
    if (defer) defer(receipt);
    else await receipt();
  }
  // Never expose the buyer email, identity, authorization state, or paid files.
  return {
    reference,
    status,
    itemId: intent.item_id,
    itemTitle: intent.item_title,
    itemType: intent.item_type,
  };
}

export async function claimPaidShopPurchases(
  token: AuthToken,
  referenceValue?: unknown,
) {
  if (!purchaseFirstEnabled) return { claimed: 0 };
  if (!isVerifiedGoogle(token))
    throw new ApiError(403, "Continue with your verified Google account.");
  if (referenceValue !== undefined) {
    const reference = referenceSchema.parse(referenceValue);
    const { data, error } = await adminClient()
      .from("billing_intents")
      .select("email,status,student_id")
      .eq("reference", reference)
      .eq("kind", "shop_item")
      .maybeSingle();
    databaseError(error);
    if (!data || data.status !== "success")
      throw new ApiError(
        409,
        "We are still confirming this payment. Please check again shortly.",
      );
    if (
      normalizePurchaseEmail(data.email) !==
        normalizePurchaseEmail(token.email!) ||
      (data.student_id && data.student_id !== token.uid)
    )
      throw new ApiError(
        403,
        "This purchase uses a different Google email. Switch accounts, or contact support if the purchase email was mistyped.",
      );
  }
  const { data, error } = await adminClient().rpc("claim_shop_purchases", {
    p_user_id: token.uid,
    p_email: normalizePurchaseEmail(token.email!),
    p_name: token.name || "Student",
    p_avatar: token.avatar_url || null,
  });
  databaseError(error);
  return { claimed: Number(data || 0) };
}

export async function deliverShopReceipt(reference: string) {
  const client = adminClient();
  const { data: reserved, error } = await client.rpc("reserve_shop_receipt", {
    p_reference: reference,
  });
  databaseError(error);
  if (!reserved) return;
  const { data: intent, error: readError } = await client
    .from("billing_intents")
    .select("*")
    .eq("reference", reference)
    .single();
  databaseError(readError);
  const result = await sendShopPurchaseConfirmationEmail({
    studentId: intent.student_id || undefined,
    studentEmail: intent.email,
    studentName: intent.buyer_name || intent.donor_name,
    itemId: intent.item_id,
    itemTitle: intent.item_title,
    itemType: intent.item_type,
    itemSlug: intent.item_slug,
    amount: intent.amount_kobo / 100,
    reference,
    guest: intent.guest,
  });
  const { error: updateError } = await client
    .from("shop_receipt_outbox")
    .update({
      status: result.sent ? "sent" : "failed",
      last_error: result.sent
        ? null
        : String(result.reason || "Email unavailable").slice(0, 500),
      ...(result.sent
        ? { sent_at: new Date().toISOString() }
        : {
            next_attempt_at: new Date(
              Date.now() + 10 * 60 * 1000,
            ).toISOString(),
          }),
    })
    .eq("reference", reference);
  databaseError(updateError);
}
export async function retryShopReceipts() {
  if (!purchaseFirstEnabled) return;
  const { data, error } = await adminClient()
    .from("shop_receipt_outbox")
    .select("reference")
    .neq("status", "sent")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(15);
  databaseError(error);
  for (const row of data || [])
    await deliverShopReceipt(row.reference).catch((cause) =>
      console.error("Receipt retry:", cause),
    );
}
