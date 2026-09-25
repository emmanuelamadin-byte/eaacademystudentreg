import "server-only";
import { randomUUID } from "node:crypto";

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
  kind: "broadcast" | "birthday" | "subscription_reminder";
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
  throw new ApiError(500, `The communication request could not be completed: ${error.message}`);
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

  let broadcastId: string = randomUUID();
  try {
    const { data: broadcast, error: broadcastError } = await adminClient()
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
      .maybeSingle();
    if (broadcast?.id) {
      broadcastId = String(broadcast.id);
    } else if (broadcastError) {
      console.warn("Broadcast table insert warning (will still deliver in-app notification):", broadcastError.message);
    }
  } catch (cause) {
    console.warn("Broadcast insert exception (will still deliver in-app notification):", cause);
  }

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
    try {
      const { error } = await adminClient()
        .from("message_deliveries")
        .insert(deliveries);
      if (error) {
        console.warn("Message deliveries queue warning:", error.message);
      }
    } catch (deliveryErr) {
      console.warn("Message deliveries queue exception:", deliveryErr);
    }
  } else if (dueNow) {
    try {
      await adminClient()
        .from("broadcasts")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", broadcastId);
    } catch {
      // Table may not exist yet; ignore
    }
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
  try {
    const { data, error } = await adminClient()
      .from("broadcasts")
      .select(
        "id,title,audience,channels,status,scheduled_for,recipient_count,sent_count,failed_count,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      console.warn("listBroadcasts query warning:", error.message);
      return { broadcasts: [], configuration: configuration() };
    }
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
  } catch (err) {
    console.warn("listBroadcasts exception:", err);
    return { broadcasts: [], configuration: configuration() };
  }
}

export function formatEmailSender(
  rawFrom = process.env.EMAIL_FROM,
): string | null {
  const trimmed = rawFrom?.trim();
  if (!trimmed) return null;
  const angleMatch = trimmed.match(/<([^<>]+@[^<>]+)>/);
  const address = (angleMatch ? angleMatch[1] : trimmed).trim();
  if (!address.includes("@")) return trimmed;
  return `EA Academy <${address}>`;
}

async function sendEmail(delivery: Delivery) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = formatEmailSender();
  if (!apiKey || !from) return null;
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://ea-academy.org"
  ).replace(/\/$/, "");
  const billingUrl = `${appUrl}/app/billing`;
  const safeMessage = escapeHtml(delivery.message).replaceAll("\n", "<br />");

  let html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#10233f"><h1 style="font-size:24px">${escapeHtml(delivery.subject || "EA Academy")}</h1><p style="font-size:16px;line-height:1.7">${safeMessage}</p>${appUrl ? `<p><a href="${escapeHtml(appUrl)}/app/account">Manage communication preferences</a></p>` : ""}</div>`;

  if (delivery.kind === "subscription_reminder") {
    const subjectStr = delivery.subject || "Your EA Academy Premium subscription expires soon";
    const isUrgent =
      subjectStr.includes("2 day") ||
      delivery.template_variables?.stage === "2d";
    const badgeBg = isUrgent ? "#fef2f2" : "#fffbeb";
    const badgeColor = isUrgent ? "#dc2626" : "#d97706";
    const badgeBorder = isUrgent ? "#fecaca" : "#fde68a";
    const badgeLabel = isUrgent
      ? "⚠️ Expires in 2 Days"
      : "⏳ Expires in 7 Days";

    html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;padding:28px 24px;background-color:#ffffff;color:#1e293b;border-radius:12px;border:1px solid #e2e8f0">
  <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid #f1f5f9">
    <div style="display:inline-block;padding:6px 14px;background-color:${badgeBg};border:1px solid ${badgeBorder};border-radius:9999px;font-size:12px;font-weight:700;color:${badgeColor};letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px">
      ${badgeLabel}
    </div>
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#002751;letter-spacing:-0.02em">
      ${escapeHtml(subjectStr)}
    </h1>
  </div>

  <div style="padding:24px 0;line-height:1.65;font-size:15px;color:#334155">
    <p style="margin:0 0 20px">${safeMessage}</p>

    <div style="margin:24px 0;padding:18px 20px;background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">
        Membership Summary
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr>
          <td style="padding:5px 0;color:#64748b">Plan:</td>
          <td style="padding:5px 0;text-align:right;font-weight:700;color:#002751">EA Academy Premium</td>
        </tr>
        <tr>
          <td style="padding:5px 0;color:#64748b">Renewal Rate:</td>
          <td style="padding:5px 0;text-align:right;font-weight:600;color:#334155">₦3,000 / 30 days</td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:28px 0 8px">
      <a href="${escapeHtml(billingUrl)}" style="display:inline-block;background-color:#002751;color:#ffffff;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;text-decoration:none">
        Renew Premium Membership &rarr;
      </a>
    </div>
  </div>

  <div style="border-top:1px solid #f1f5f9;padding-top:20px;font-size:13px;color:#64748b;line-height:1.5">
    <p style="margin:0 0 4px;font-weight:600;color:#002751">Keep building your future,</p>
    <p style="margin:0 0 12px;color:#334155"><strong>The EA Academy Team</strong></p>
    <p style="margin:0;font-size:12px;color:#94a3b8">
      Manage your subscription or notification settings anytime in your <a href="${escapeHtml(billingUrl)}" style="color:#0284c7;text-decoration:none">EA Academy Billing Dashboard</a>.
    </p>
  </div>
</div>`;
  }

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
      html,
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
  try {
    const { data, error } = await adminClient()
      .from("message_deliveries")
      .select("status")
      .eq("broadcast_id", broadcastId);
    if (error) return;
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
    await adminClient()
      .from("broadcasts")
      .update({
        sent_count: sent,
        failed_count: failed,
        status,
        completed_at: pending ? null : new Date().toISOString(),
      })
      .eq("id", broadcastId);
  } catch (err) {
    console.warn("refreshBroadcastStatus warning:", err);
  }
}

async function publishDueInAppBroadcasts() {
  try {
    const { data, error } = await adminClient()
      .from("broadcasts")
      .select("id,title,message,audience,track_id,action_path,channels")
      .contains("channels", ["in-app"])
      .is("in_app_sent_at", null)
      .lte("scheduled_for", new Date().toISOString())
      .limit(50);
    if (error || !data) return 0;
    let published = 0;
    for (const item of data) {
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
      if (notificationError) continue;
      await adminClient()
        .from("broadcasts")
        .update({ in_app_sent_at: new Date().toISOString() })
        .eq("id", item.id);
      await refreshBroadcastStatus(item.id);
      published += 1;
    }
    return published;
  } catch (err) {
    console.warn("publishDueInAppBroadcasts warning:", err);
    return 0;
  }
}

export async function processMessageQueue(maximum = 50) {
  const inAppPublished = await publishDueInAppBroadcasts();
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  try {
    await adminClient()
      .from("message_deliveries")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("status", "processing")
      .lt("updated_at", staleBefore);
    const { data, error } = await adminClient()
      .from("message_deliveries")
      .select("*")
      .in("status", ["queued", "failed"])
      .lt("attempts", 3)
      .lte("scheduled_for", new Date().toISOString())
      .order("created_at")
      .limit(Math.min(Math.max(maximum, 1), 100));
    if (error || !data) {
      return {
        processed: 0,
        sent: 0,
        failed: 0,
        awaitingConfiguration: 0,
        inAppPublished,
      };
    }
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
        .from("message_deliveries")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", row.status)
        .select("id")
        .maybeSingle();
      if (claimError || !claimed) continue;
      try {
        const providerId =
          row.channel === "email"
            ? await sendEmail(row)
            : await sendWhatsapp(row);
        await adminClient()
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
        sent += 1;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Delivery failed.";
        await adminClient()
          .from("message_deliveries")
          .update({
            status: "failed",
            attempts: row.attempts + 1,
            last_error: message.slice(0, 1000),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
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
  } catch (err) {
    console.warn("processMessageQueue warning:", err);
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      awaitingConfiguration: 0,
      inAppPublished,
    };
  }
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
  try {
    const { data: inserted, error: insertError } = await adminClient()
      .from("message_deliveries")
      .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true })
      .select("id");
    if (insertError) {
      console.warn("queueBirthdayMessages warning:", insertError.message);
      return { queued: 0 };
    }
    return { queued: inserted?.length || 0 };
  } catch (err) {
    console.warn("queueBirthdayMessages exception:", err);
    return { queued: 0 };
  }
}

export function getSubscriptionReminderStage(
  premiumUntil: string | null | undefined,
  now = new Date(),
): "7d" | "2d" | null {
  if (!premiumUntil) return null;
  const expiryMs = Date.parse(premiumUntil);
  if (!Number.isFinite(expiryMs)) return null;
  const msRemaining = expiryMs - now.getTime();
  if (msRemaining <= 0) return null;

  const daysRemaining = msRemaining / (24 * 60 * 60 * 1000);
  if (daysRemaining > 0 && daysRemaining <= 2.5) {
    return "2d";
  }
  if (daysRemaining > 5 && daysRemaining <= 7.5) {
    return "7d";
  }
  return null;
}

export function buildSubscriptionReminderContent(info: {
  studentId: string;
  fullName?: string | null;
  email: string;
  premiumUntil: string;
  stage: "7d" | "2d";
}) {
  const firstName =
    String(info.fullName || "Student")
      .trim()
      .split(/\s+/)[0] || "Student";
  const expiryDateObj = new Date(info.premiumUntil);
  const expiryDateFormatted = expiryDateObj.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const expiryDateKey = expiryDateObj.toISOString().slice(0, 10);

  if (info.stage === "2d") {
    return {
      student_id: info.studentId,
      kind: "subscription_reminder" as const,
      channel: "email" as const,
      recipient: info.email,
      subject: `⚠️ Urgent: Your EA Academy Premium subscription expires in 2 days`,
      message: `Hi ${firstName},\n\nYour EA Academy Premium subscription is expiring in 2 days (on ${expiryDateFormatted}).\n\nTo avoid losing access to all career tracks, the Academy selected courses, live mentor sessions, and your verified learning transcript, please renew your subscription before it expires.\n\nClick the button below to visit your Billing dashboard and renew in under a minute.`,
      idempotency_key: `subscription_expiry:2d:${info.studentId}:${expiryDateKey}:email`,
    };
  }

  return {
    student_id: info.studentId,
    kind: "subscription_reminder" as const,
    channel: "email" as const,
    recipient: info.email,
    subject: `⏳ Your EA Academy Premium subscription expires in 7 days`,
    message: `Hi ${firstName},\n\nThis is a friendly reminder that your EA Academy Premium subscription will expire in 7 days (on ${expiryDateFormatted}).\n\nRenewing your membership ensures uninterrupted access to:\n• All career tracks and Premium classroom modules\n• Access to the Academy selected courses.\n• Live mentor sessions, recordings, and your verified learning transcript\n\nYou can renew your Premium membership anytime from your Billing dashboard so you don't lose momentum.`,
    idempotency_key: `subscription_expiry:7d:${info.studentId}:${expiryDateKey}:email`,
  };
}

export async function queueSubscriptionExpiryReminders(now = new Date()) {
  const minExpiryIso = now.toISOString();
  const maxExpiryIso = new Date(
    now.getTime() + 8 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await adminClient()
    .from("profiles")
    .select(
      "id,full_name,email,role,premium_until,premium_granted,email_notifications_enabled",
    )
    .eq("role", "Student")
    .not("premium_until", "is", null)
    .gt("premium_until", minExpiryIso)
    .lte("premium_until", maxExpiryIso);

  databaseError(error);

  const rows: Record<string, unknown>[] = [];
  let queued7d = 0;
  let queued2d = 0;

  for (const profile of data || []) {
    if (profile.premium_granted === true) continue;
    if (!profile.email || profile.email_notifications_enabled === false)
      continue;
    const stage = getSubscriptionReminderStage(profile.premium_until, now);
    if (!stage) continue;

    const row = buildSubscriptionReminderContent({
      studentId: String(profile.id),
      fullName: profile.full_name,
      email: String(profile.email),
      premiumUntil: String(profile.premium_until),
      stage,
    });
    rows.push(row);
    if (stage === "7d") queued7d += 1;
    if (stage === "2d") queued2d += 1;
  }

  if (!rows.length) return { queued: 0, queued7d: 0, queued2d: 0 };

  try {
    const { data: inserted, error: insertError } = await adminClient()
      .from("message_deliveries")
      .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true })
      .select("id");
    if (insertError) {
      console.warn(
        "queueSubscriptionExpiryReminders warning:",
        insertError.message,
      );
      return { queued: 0, queued7d: 0, queued2d: 0 };
    }
    return {
      queued: inserted?.length || 0,
      queued7d,
      queued2d,
    };
  } catch (err) {
    console.warn("queueSubscriptionExpiryReminders exception:", err);
    return { queued: 0, queued7d: 0, queued2d: 0 };
  }
}

export async function updateDeliveryStatus(
  providerMessageId: string,
  status: "sent" | "delivered" | "read" | "failed",
) {
  try {
    const { data: delivery, error: readError } = await adminClient()
      .from("message_deliveries")
      .select("id,broadcast_id,status")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle();
    if (readError || !delivery) return;
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
      .from("message_deliveries")
      .update(update)
      .eq("id", delivery.id);
    if (error) {
      console.warn("updateDeliveryStatus warning:", error.message);
      return;
    }
    if (delivery.broadcast_id)
      await refreshBroadcastStatus(delivery.broadcast_id);
  } catch (err) {
    console.warn("updateDeliveryStatus exception:", err);
  }
}

export async function notifyOwnerOfNewStudent(info: {
  ownerEmail: string;
  studentName: string;
  studentEmail: string;
  trackName: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = formatEmailSender();
  if (!apiKey || !from) return;
  const { ownerEmail, studentName, studentEmail, trackName } = info;
  const subject = `🎉 New student: ${studentName}`;
  const text = `A new student just enrolled in EA Academy.\n\nName: ${studentName}\nEmail: ${studentEmail}\nCareer Path: ${trackName}\n\nLog in to the admin dashboard to view their profile.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#10233f">
<h2 style="font-size:20px;margin-bottom:4px">🎉 New student enrolled!</h2>
<p style="font-size:15px;margin:0 0 18px;color:#475569">Someone just joined EA Academy.</p>
<table style="width:100%;border-collapse:collapse;font-size:15px">
<tr><td style="padding:10px 14px;background:#f1f5f9;border-radius:6px 6px 0 0;font-weight:600;color:#002751">Name</td><td style="padding:10px 14px;background:#f8fafc">${studentName}</td></tr>
<tr><td style="padding:10px 14px;background:#f1f5f9;font-weight:600;color:#002751">Email</td><td style="padding:10px 14px;background:#f8fafc">${studentEmail}</td></tr>
<tr><td style="padding:10px 14px;background:#f1f5f9;border-radius:0 0 6px 6px;font-weight:600;color:#002751">Career Path</td><td style="padding:10px 14px;background:#f8fafc">${trackName}</td></tr>
</table>
</div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [ownerEmail], subject, text, html }),
  });
}

export async function sendDonationThankYouEmail(info: {
  donorEmail: string;
  donorName?: string | null;
  amount: number;
  reference: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = formatEmailSender();
  if (!apiKey || !from) return { sent: false, reason: "missing_credentials" };

  const { donorEmail, donorName, amount, reference } = info;
  if (!donorEmail) return { sent: false, reason: "missing_email" };

  const name = donorName?.trim() || "Supporter";
  const safeDonorName = escapeHtml(name);
  const safeReference = escapeHtml(reference);
  const formattedAmount = `₦${Math.round(amount).toLocaleString("en-NG")}`;
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const subject = `💙 Thank you for supporting EA Academy scholars!`;
  const text = `Dear ${name},

Thank you so much for your generous contribution of ${formattedAmount} to the EA Academy Scholarship Fund.

Your support directly helps ambitious learners acquire practical AI and digital skills, opening the door to life-changing career opportunities.

Contribution Receipt Summary:
- Amount: ${formattedAmount}
- Reference: ${reference}
- Date: ${dateStr}
- Purpose: EA Academy Student Scholarships

Together, we are bridging the opportunity divide and raising the next generation of digital leaders.

With heartfelt appreciation,
Emmanuel Amadin & The EA Academy Team
https://ea-academy.org`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;padding:28px 24px;background-color:#ffffff;color:#1e293b;border-radius:12px;border:1px solid #e2e8f0">
  <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid #f1f5f9">
    <div style="display:inline-block;padding:6px 14px;background-color:#eff6ff;border-radius:9999px;font-size:12px;font-weight:600;color:#0284c7;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px">
      💙 EA Academy Scholarship Fund
    </div>
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#002751;letter-spacing:-0.02em">
      Thank You for Your Generosity!
    </h1>
  </div>

  <div style="padding:24px 0;line-height:1.6;font-size:15px;color:#334155">
    <p style="margin-top:0">Dear <strong>${safeDonorName}</strong>,</p>
    <p>
      On behalf of every aspiring student at EA Academy, <strong>thank you so much</strong> for your generous contribution of <strong>${formattedAmount}</strong> to our Scholarship Fund.
    </p>
    <p>
      Your support directly breaks down financial barriers for talented, driven learners — giving them access to world-class, practical training in AI tools, software engineering, and digital skills.
    </p>

    <div style="margin:24px 0;padding:18px 20px;background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">
        Contribution Receipt Summary
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr>
          <td style="padding:6px 0;color:#64748b">Amount:</td>
          <td style="padding:6px 0;text-align:right;font-weight:700;color:#002751;font-size:16px">${formattedAmount}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b">Reference Code:</td>
          <td style="padding:6px 0;text-align:right;font-family:monospace;color:#334155">${safeReference}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b">Date:</td>
          <td style="padding:6px 0;text-align:right;color:#334155">${dateStr}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b">Purpose:</td>
          <td style="padding:6px 0;text-align:right;color:#334155">EA Academy Student Scholarships</td>
        </tr>
      </table>
    </div>

    <p style="margin-bottom:0">
      Together, we are bridging the opportunity divide and raising the next generation of digital leaders.
    </p>
  </div>

  <div style="border-top:1px solid #f1f5f9;padding-top:20px;font-size:13px;color:#64748b;line-height:1.5">
    <p style="margin:0 0 4px;font-weight:600;color:#002751">With heartfelt appreciation,</p>
    <p style="margin:0 0 16px;color:#334155"><strong>Emmanuel Amadin</strong> & The EA Academy Team</p>
    <p style="margin:0;font-size:12px;color:#94a3b8">
      EA Academy — Equipping African talent for global opportunities.<br/>
      <a href="https://ea-academy.org" style="color:#0284c7;text-decoration:none">ea-academy.org</a>
    </p>
  </div>
</div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [donorEmail], subject, text, html }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error sending donation thank-you:", errText);
      return { sent: false, reason: errText };
    }
    return { sent: true };
  } catch (err) {
    console.error("Exception sending donation thank-you email:", err);
    return { sent: false, reason: String(err) };
  }
}

