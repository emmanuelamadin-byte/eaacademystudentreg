import "server-only";
import { createHash } from "node:crypto";
import webpush from "web-push";
import type { AcademyUser, CareerPathClassId } from "@/lib/types";
import { adminClient } from "./supabase";
import { ApiError } from "./policy";

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BAanuzltjxVOP3zC4_Kway3VY4qczI-o_oQI0UAAw4kNhMoYG-qoUjdN6KtE83qP7bEvnJ7dhsMk8pKTwlpLzdc";

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "LwhkpejbXpl7zMMUTlNXW6hp5uBMbCAfKQw6ptg1PEY";

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:emmanuelamadin@gmail.com";

let vapidConfigured = false;
function ensureVapid() {
  if (!vapidConfigured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  }
}

export type PushSubscriptionPayload = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PushNotificationData = {
  title: string;
  message: string;
  url?: string;
  tag?: string;
};

export function hashEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

export async function savePushToken(
  user: AcademyUser,
  subscription: PushSubscriptionPayload,
) {
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    throw new ApiError(400, "A valid push subscription object is required.");
  }

  const tokenHash = hashEndpoint(subscription.endpoint);
  const tokenJson = JSON.stringify(subscription);
  const trackId = user.enrolledClassId || "system-dev";

  const { error } = await adminClient()
    .from("push_tokens")
    .upsert(
      {
        token_hash: tokenHash,
        token: tokenJson,
        student_id: user.id,
        track_id: trackId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token_hash" },
    );

  if (error) {
    console.error("Failed to save push token:", error.message);
    throw new ApiError(500, "Could not save push notification token.");
  }

  return { success: true };
}

export async function removePushToken(user: AcademyUser, endpoint: string) {
  if (!endpoint) return { success: true };
  const tokenHash = hashEndpoint(endpoint);

  await adminClient()
    .from("push_tokens")
    .delete()
    .eq("token_hash", tokenHash)
    .eq("student_id", user.id);

  return { success: true };
}

export async function sendPushToAudience(
  audience: "all" | "track" | "free" | "premium",
  trackId: CareerPathClassId | undefined,
  notification: PushNotificationData,
): Promise<{ sent: number; failed: number }> {
  ensureVapid();

  // Query eligible push tokens
  let query = adminClient()
    .from("push_tokens")
    .select("token_hash, token, student_id, track_id");

  if (audience === "track" && trackId) {
    query = query.eq("track_id", trackId);
  }

  const { data: rows, error } = await query;
  if (error || !rows || rows.length === 0) {
    if (error) console.error("Failed to fetch push tokens for broadcast:", error.message);
    return { sent: 0, failed: 0 };
  }

  // If audience is free or premium, filter by user membership
  let targetRows = rows;
  if (audience === "free" || audience === "premium") {
    const studentIds = Array.from(new Set(rows.map((r) => r.student_id)));
    const { data: profiles } = await adminClient()
      .from("profiles")
      .select("id, membership_plan, premium_granted")
      .in("id", studentIds);

    const eligibleIds = new Set(
      (profiles || [])
        .filter((p) => {
          const isPrem = p.membership_plan === "Premium" || p.premium_granted;
          return audience === "premium" ? isPrem : !isPrem;
        })
        .map((p) => p.id),
    );

    targetRows = rows.filter((r) => eligibleIds.has(r.student_id));
  }

  const payload = JSON.stringify({
    notification: {
      title: notification.title,
      body: notification.message,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    },
    data: {
      url: notification.url || "/app/dashboard",
      notificationId: notification.tag || `announcement-${Date.now()}`,
    },
  });

  let sent = 0;
  let failed = 0;
  const expiredHashes: string[] = [];

  await Promise.allSettled(
    targetRows.map(async (row) => {
      try {
        const sub = JSON.parse(row.token) as webpush.PushSubscription;
        await webpush.sendNotification(sub, payload, {
          TTL: 86400, // 24 hours
          urgency: "normal",
        });
        sent++;
      } catch (err: unknown) {
        failed++;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // 404 or 410 means subscription expired or was cancelled by user
        if (statusCode === 404 || statusCode === 410) {
          expiredHashes.push(row.token_hash);
        } else {
          console.error("Failed to send web push to device:", err);
        }
      }
    }),
  );

  // Clean up dead subscriptions
  if (expiredHashes.length > 0) {
    try {
      await adminClient()
        .from("push_tokens")
        .delete()
        .in("token_hash", expiredHashes);
    } catch {
      // Ignore cleanup error
    }
  }

  return { sent, failed };
}
