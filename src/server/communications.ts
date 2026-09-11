import "server-only";

import { ApiError } from "./policy";
import { adminClient } from "./supabase";
import { localDateParts } from "@/lib/birthdays";
import { sendPushToAudience } from "./push";
import type { AcademyUser, CareerPathClassId } from "@/lib/types";

export type MessageChannel = "in-app" | "email" | "whatsapp";
export type BroadcastAudience = "all" | "track" | "free" | "premium";

export type BroadcastInput = {
  title: string;
  message: string;
  audience: BroadcastAudience;
  trackId?: CareerPathClassId;
  channels: MessageChannel[];
  actionPath?: string;
  whatsappTemplate?: string;
  scheduledFor?: string;
};

export type BroadcastSummary = {
  id: string;
  title: string;
  audience: BroadcastAudience;
  channels: MessageChannel[];
  status: string;
  scheduledFor: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
};

type Recipient = {
  id: string;
  full_name: string;
  email: string;
  phone_number?: string;
  primary_track: CareerPathClassId;
  membership_plan: "Free" | "Premium";
  premium_granted?: boolean;
  email_notifications_enabled?: boolean;
  whatsapp_notifications_enabled?: boolean;
  whatsapp_opted_in_at?: string;
};

type Delivery = {
  id: string;
  broadcast_id?: string;
  student_id: string;
  kind: "broadcast" | "birthday";
  channel: "email" | "whatsapp";
  recipient: string;
  subject?: string;
  message: string;
  template_name?: string;
  template_variables: Record<string, string>;
  status: "queued" | "processing" | "sent" | "delivered" | "read" | "failed";
  attempts: number;
  idempotency_key: string;
};

const configuration = () => ({
  email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  whatsapp: Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_GRAPH_API_VERSION,
  ),
  automation: Boolean(process.env.AUTOMATION_SECRET),
});

function databaseError(error: { message: string } | null) {
  if (!error) return;
  console.error("Communication database request failed:", error.message);
  throw new ApiError(500, "The communication request could not be completed.");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isRecipientInAudience(recipient: Recipient, input: BroadcastInput) {
  if (input.audience === "track")
    return recipient.primary_track === input.trackId;
  if (input.audience === "premium")
    return recipient.membership_plan === "Premium" || recipient.premium_granted;
  if (input.audience === "free")
    return (
      recipient.membership_plan !== "Premium" && !recipient.premium_granted
    );
  return true;
}

export async function saveCommunicationPreferences(
  userId: string,
  preferences: {
    emailNotificationsEnabled: boolean;
    birthdayEmailEnabled: boolean;
    whatsappNotificationsEnabled: boolean;
    birthdayWhatsappEnabled: boolean;
    whatsappConsent: boolean;
  },
) {
  if (preferences.whatsappNotificationsEnabled && !preferences.whatsappConsent)
    throw new ApiError(
      400,
      "Confirm that you agree to receive EA Academy updates on WhatsApp.",
    );
  if (
    preferences.birthdayWhatsappEnabled &&
    !preferences.whatsappNotificationsEnabled
  )
    throw new ApiError(
      400,
      "Enable WhatsApp academy updates before enabling birthday wishes.",
    );
  const now = new Date().toISOString();
  const { data: previous, error: previousError } = await adminClient()
    .from("profiles")
    .select("whatsapp_opted_in_at,whatsapp_opted_out_at")
    .eq("id", userId)
    .single();
  databaseError(previousError);
  const optedInAt =
    preferences.whatsappNotificationsEnabled &&
    (!previous?.whatsapp_opted_in_at || previous?.whatsapp_opted_out_at)
      ? now
      : previous?.whatsapp_opted_in_at;
  const { error } = await adminClient()
    .from("profiles")
    .update({
      email_notifications_enabled: preferences.emailNotificationsEnabled,
      birthday_email_enabled: preferences.birthdayEmailEnabled,
      whatsapp_notifications_enabled: preferences.whatsappNotificationsEnabled,
      birthday_whatsapp_enabled: preferences.birthdayWhatsappEnabled,
      communication_consent_version: "2026-09-08-v1",
      ...(preferences.whatsappNotificationsEnabled
        ? { whatsapp_opted_in_at: optedInAt, whatsapp_opted_out_at: null }
        : { whatsapp_opted_out_at: now }),
    })
    .eq("id", userId);
  databaseError(error);
  return preferences;
}

export async function createBroadcast(
  admin: AcademyUser,
  input: BroadcastInput,
) {
  const scheduledFor = input.scheduledFor || new Date().toISOString();
  const dueNow = Date.parse(scheduledFor) <= Date.now();
  const { data: profiles, error: profileError } = await adminClient()
    .from("profiles")
    .select(
      "id,full_name,email,phone_number,primary_track,membership_plan,premium_granted,email_notifications_enabled,whatsapp_notifications_enabled,whatsapp_opted_in_at",
    )
    .eq("role", "Student");
  databaseError(profileError);
  const recipients = ((profiles || []) as Recipient[]).filter((recipient) =>
    isRecipientInAudience(recipient, input),
  );
  if (!recipients.length)
    throw new ApiError(400, "No students match this broadcast audience.");

  const { data: broadcast, error: broadcastError } = await adminClient()
    .schema("private")
    .from("broadcasts")
    .insert({
      title: input.title,
      message: input.message,
      audience: input.audience,
      track_id: input.trackId,
      channels: input.channels,
      action_path: input.actionPath,
      whatsapp_template:
        input.whatsappTemplate || process.env.WHATSAPP_BROADCAST_TEMPLATE,
      scheduled_for: scheduledFor,
      created_by: admin.id,
      recipient_count: recipients.length,
      status:
        input.channels.some((channel) => channel !== "in-app") || !dueNow
          ? "queued"
          : "completed",
      in_app_sent_at:
        input.channels.includes("in-app") && dueNow
          ? new Date().toISOString()
          : null,
    })
    .select("id")
    .single();
  databaseError(broadcastError);
  const broadcastId = String(broadcast?.id);

  if (input.channels.includes("in-app") && dueNow) {
    const targetTrack = input.audience === "track" ? input.trackId : "all";
    const { error } = await adminClient()
      .from("notifications")
      .insert({
        title: input.title,
        message: input.message,
        type: "announcement",
        target_track: targetTrack || "all",
        priority: "normal",
        action_path: input.actionPath,
        created_at: new Date().toISOString(),
        push_sent: true,
        push_delivered: 0,
      });
    databaseError(error);

    // Send native phone push notifications to all registered student devices
    void sendPushToAudience(input.audience, input.trackId, {
      title: input.title,
      message: input.message,
      url: input.actionPath || "/app/dashboard",
      tag: `announcement-${broadcastId}`,
    }).catch((pushErr) => {
      console.error("Failed to deliver broadcast push notifications:", pushErr);
    });
  }

  const deliveries = recipients.flatMap((recipient) => {
    const rows: Record<string, unknown>[] = [];
    if (
      input.channels.includes("email") &&
      recipient.email &&
      recipient.email_notifications_enabled !== false
    )
      rows.push({
        broadcast_id: broadcastId,
        student_id: recipient.id,
        kind: "broadcast",
        channel: "email",
        recipient: recipient.email,
        subject: input.title,
        message: input.message,
        scheduled_for: scheduledFor,
        idempotency_key: `broadcast:${broadcastId}:${recipient.id}:email`,
      });
    if (
      input.channels.includes("whatsapp") &&
      recipient.phone_number &&
      recipient.whatsapp_notifications_enabled &&
      recipient.whatsapp_opted_in_at
    )
      rows.push({
        broadcast_id: broadcastId,
        student_id: recipient.id,
        kind: "broadcast",
        channel: "whatsapp",
        recipient: recipient.phone_number,
        message: input.message,
        template_name:
          input.whatsappTemplate || process.env.WHATSAPP_BROADCAST_TEMPLATE,
        template_variables: {
          title: input.title,
          message: input.message,
        },
        scheduled_for: scheduledFor,
        idempotency_key: `broadcast:${broadcastId}:${recipient.id}:whatsapp`,
      });
    return rows;
  });
  if (deliveries.length) {
    const { error } = await adminClient()
      .schema("private")
      .from("message_deliveries")
      .insert(deliveries);
    databaseError(error);
  } else if (dueNow) {
    const { error } = await adminClient()
      .schema("private")
      .from("broadcasts")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", broadcastId);
    databaseError(error);
  }
  return {
    id: broadcastId,
    recipients: recipients.length,
    queued: deliveries.length,
    configuration: configuration(),
  };
}

export async function listBroadcasts(): Promise<{
  broadcasts: BroadcastSummary[];
  configuration: ReturnType<typeof configuration>;
}> {
  const { data, error } = await adminClient()
    .schema("private")
    .from("broadcasts")
    .select(
      "id,title,audience,channels,status,scheduled_for,recipient_count,sent_count,failed_count,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(30);
  databaseError(error);
  return {
    broadcasts: (data || []).map((item) => ({
      id: item.id,
      title: item.title,
      audience: item.audience,
      channels: item.channels,
      status: item.status,
      scheduledFor: item.scheduled_for,
      recipientCount: item.recipient_count,
      sentCount: item.sent_count,
      failedCount: item.failed_count,
      createdAt: item.created_at,
    })) as BroadcastSummary[],
    configuration: configuration(),
  };
}

async function sendEmail(delivery: Delivery) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const safeMessage = escapeHtml(delivery.message).replaceAll("\n", "<br />");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": delivery.idempotency_key,
    },
    body: JSON.stringify({
      from,
      to: [delivery.recipient],
      subject: delivery.subject || "A message from EA Academy",
      reply_to: process.env.EMAIL_REPLY_TO || undefined,
      text: delivery.message,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#10233f"><h1 style="font-size:24px">${escapeHtml(delivery.subject || "EA Academy")}</h1><p style="font-size:16px;line-height:1.7">${safeMessage}</p>${appUrl ? `<p><a href="${escapeHtml(appUrl)}/app/account">Manage communication preferences</a></p>` : ""}</div>`,
      tags: [
        { name: "kind", value: delivery.kind },
        { name: "student", value: delivery.student_id.replaceAll("-", "") },
      ],
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!response.ok)
    throw new Error(body.message || "Resend rejected the message.");
  return body.id || "accepted";
}

async function sendWhatsapp(delivery: Delivery) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_GRAPH_API_VERSION;
  if (!accessToken || !phoneNumberId || !version) return null;
  if (!delivery.template_name)
    throw new Error("No approved WhatsApp template is configured.");
  const variables = delivery.template_variables || {};
  const parameters =
    delivery.kind === "birthday"
      ? [{ type: "text", text: variables.firstName || "Student" }]
      : [
          { type: "text", text: variables.title || "EA Academy" },
          { type: "text", text: variables.message || delivery.message },
        ];
  const response = await fetch(
    `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: delivery.recipient.replace(/^\+/, ""),
        type: "template",
        template: {
          name: delivery.template_name,
          language: {
            code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
          },
          components: [{ type: "body", parameters }],
        },
      }),
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(body.error?.message || "Meta rejected the message.");
  return body.messages?.[0]?.id || "accepted";
}

async function refreshBroadcastStatus(broadcastId: string) {
  const { data, error } = await adminClient()
    .schema("private")
    .from("message_deliveries")
    .select("status")
    .eq("broadcast_id", broadcastId);
  databaseError(error);
  const statuses = (data || []).map((item) => item.status);
  const sent = statuses.filter((status) =>
    ["sent", "delivered", "read"].includes(status),
  ).length;
  const failed = statuses.filter((status) => status === "failed").length;
  const queued = statuses.filter((status) => status === "queued").length;
  const processing = statuses.filter(
    (status) => status === "processing",
  ).length;
  const pending = queued + processing;
  const status = processing
    ? "processing"
    : queued
      ? "queued"
      : failed && sent
        ? "partial"
        : failed
          ? "failed"
          : "completed";
  const { error: updateError } = await adminClient()
    .schema("private")
    .from("broadcasts")
    .update({
      sent_count: sent,
      failed_count: failed,
      status,
      completed_at: pending ? null : new Date().toISOString(),
    })
    .eq("id", broadcastId);
  databaseError(updateError);
}

async function publishDueInAppBroadcasts() {
  const { data, error } = await adminClient()
    .schema("private")
    .from("broadcasts")
    .select("id,title,message,audience,track_id,action_path,channels")
    .contains("channels", ["in-app"])
    .is("in_app_sent_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .limit(50);
  databaseError(error);
  let published = 0;
  for (const item of data || []) {
    if (!["all", "track"].includes(item.audience)) continue;
    const { error: notificationError } = await adminClient()
      .from("notifications")
      .insert({
        title: item.title,
        message: item.message,
        type: "announcement",
        target_track: item.audience === "track" ? item.track_id : "all",
        priority: "normal",
        action_path: item.action_path,
        created_at: new Date().toISOString(),
        push_sent: false,
        push_delivered: 0,
      });
    databaseError(notificationError);
    const { error: updateError } = await adminClient()
      .schema("private")
      .from("broadcasts")
      .update({ in_app_sent_at: new Date().toISOString() })
      .eq("id", item.id);
    databaseError(updateError);
    await refreshBroadcastStatus(item.id);
    published += 1;
  }
  return published;
}

export async function processMessageQueue(maximum = 50) {
  const inAppPublished = await publishDueInAppBroadcasts();
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { error: staleError } = await adminClient()
    .schema("private")
    .from("message_deliveries")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("updated_at", staleBefore);
  databaseError(staleError);
  const { data, error } = await adminClient()
    .schema("private")
    .from("message_deliveries")
    .select("*")
    .in("status", ["queued", "failed"])
    .lt("attempts", 3)
    .lte("scheduled_for", new Date().toISOString())
    .order("created_at")
    .limit(Math.min(Math.max(maximum, 1), 100));
  databaseError(error);
  let sent = 0;
  let failed = 0;
  let awaitingConfiguration = 0;
  const broadcasts = new Set<string>();
  for (const row of (data || []) as Delivery[]) {
    if (row.broadcast_id) broadcasts.add(row.broadcast_id);
    const configured =
      row.channel === "email"
        ? configuration().email
        : configuration().whatsapp;
    if (!configured) {
      awaitingConfiguration += 1;
      continue;
    }
    const { data: claimed, error: claimError } = await adminClient()
      .schema("private")
      .from("message_deliveries")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", row.status)
      .select("id")
      .maybeSingle();
    databaseError(claimError);
    if (!claimed) continue;
    try {
      const providerId =
        row.channel === "email"
          ? await sendEmail(row)
          : await sendWhatsapp(row);
      const { error: updateError } = await adminClient()
        .schema("private")
        .from("message_deliveries")
        .update({
          status: "sent",
          provider_message_id: providerId,
          attempts: row.attempts + 1,
          last_error: null,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      databaseError(updateError);
      sent += 1;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Delivery failed.";
      const { error: updateError } = await adminClient()
        .schema("private")
        .from("message_deliveries")
        .update({
          status: "failed",
          attempts: row.attempts + 1,
          last_error: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      databaseError(updateError);
      failed += 1;
    }
  }
  for (const broadcastId of broadcasts)
    await refreshBroadcastStatus(broadcastId);
  return {
    processed: sent + failed,
    sent,
    failed,
    awaitingConfiguration,
    inAppPublished,
  };
}

export async function queueBirthdayMessages(now = new Date()) {
  const { data, error } = await adminClient()
    .from("profiles")
    .select(
      "id,full_name,email,phone_number,birth_month,birth_day,time_zone,birthday_email_enabled,birthday_whatsapp_enabled,whatsapp_notifications_enabled,whatsapp_opted_in_at",
    )
    .eq("role", "Student")
    .not("birth_month", "is", null)
    .not("birth_day", "is", null);
  databaseError(error);
  const rows: Record<string, unknown>[] = [];
  for (const profile of data || []) {
    const local = localDateParts(profile.time_zone || "UTC", now);
    if (
      local.hour !== 9 ||
      local.month !== profile.birth_month ||
      local.day !== profile.birth_day
    )
      continue;
    const firstName = String(profile.full_name || "Student").split(" ")[0];
    const message = `Happy birthday, ${firstName}! Everyone at EA Academy is celebrating you today. We hope this new year brings you growth, joy, and bold new opportunities.`;
    if (profile.email && profile.birthday_email_enabled !== false)
      rows.push({
        student_id: profile.id,
        kind: "birthday",
        channel: "email",
        recipient: profile.email,
        subject: `Happy birthday, ${firstName}!`,
        message,
        idempotency_key: `birthday:${local.year}:${profile.id}:email`,
      });
    if (
      profile.phone_number &&
      profile.birthday_whatsapp_enabled &&
      profile.whatsapp_notifications_enabled &&
      profile.whatsapp_opted_in_at
    )
      rows.push({
        student_id: profile.id,
        kind: "birthday",
        channel: "whatsapp",
        recipient: profile.phone_number,
        message,
        template_name: process.env.WHATSAPP_BIRTHDAY_TEMPLATE,
        template_variables: { firstName },
        idempotency_key: `birthday:${local.year}:${profile.id}:whatsapp`,
      });
  }
  if (!rows.length) return { queued: 0 };
  const { data: inserted, error: insertError } = await adminClient()
    .schema("private")
    .from("message_deliveries")
    .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select("id");
  databaseError(insertError);
  return { queued: inserted?.length || 0 };
}

export async function updateDeliveryStatus(
  providerMessageId: string,
  status: "sent" | "delivered" | "read" | "failed",
) {
  const { data: delivery, error: readError } = await adminClient()
    .schema("private")
    .from("message_deliveries")
    .select("id,broadcast_id,status")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  databaseError(readError);
  if (!delivery) return;
  const rank: Record<string, number> = {
    queued: 0,
    processing: 1,
    sent: 2,
    delivered: 3,
    read: 4,
    failed: 5,
  };
  if (status !== "failed" && rank[status] <= rank[delivery.status]) return;
  const timestamp = new Date().toISOString();
  const update: Record<string, unknown> = { status, updated_at: timestamp };
  if (status === "delivered") update.delivered_at = timestamp;
  if (status === "read") update.read_at = timestamp;
  const { error } = await adminClient()
    .schema("private")
    .from("message_deliveries")
    .update(update)
    .eq("id", delivery.id);
  databaseError(error);
  if (delivery.broadcast_id)
    await refreshBroadcastStatus(delivery.broadcast_id);
}
