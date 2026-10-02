import "server-only";
import { randomUUID } from "node:crypto";

import { ApiError } from "./policy";
import { adminClient } from "./supabase";
import { localDateParts } from "@/lib/birthdays";
import { sendPushToAudience } from "./push";
import type { AcademyUser, CareerPathClassId } from "@/lib/types";

export type MessageChannel = "in-app" | "email" | "whatsapp";
export type BroadcastAudience = "all" | "track" | "free" | "premium";

export type WhatsappTemplateSummary = {
  name: string;
  status: string;
  language: string;
  category?: string;
  bodyText?: string;
  variableCount: number;
};

export type BroadcastInput = {
  title: string;
  message: string;
  audience: BroadcastAudience;
  trackId?: CareerPathClassId;
  channels: MessageChannel[];
  actionPath?: string;
  whatsappTemplate?: string;
  whatsappLanguage?: string;
  whatsappVariableCount?: number;
  whatsappParameters?: string[];
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
  lastError?: string | null;
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
  kind:
    | "broadcast"
    | "birthday"
    | "subscription_reminder"
    | "nurture"
    | "abandoned_checkout";
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

export const DEFAULT_VERIFIED_SENDER_ADDRESS = "hello@cleanbrandagency.com";
export const DEFAULT_WHATSAPP_GROUP_URL =
  "https://chat.whatsapp.com/KwZC1W1Wl6FCEBiYGCbNAo?s=cl&p=i&mlu=4&ilr=4";

const configuration = () => ({
  email: Boolean(process.env.RESEND_API_KEY && formatEmailSender()),
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
        template_variables: {},
        scheduled_for: scheduledFor,
        idempotency_key: `broadcast:${broadcastId}:${recipient.id}:email`,
      });
    if (
      input.channels.includes("whatsapp") &&
      recipient.phone_number &&
      recipient.whatsapp_notifications_enabled !== false
    ) {
      const studentFirstName = recipient.full_name
        ? recipient.full_name.trim().split(/\s+/)[0]
        : "Student";

      let resolvedParams: string[] | undefined;
      if (input.whatsappParameters && input.whatsappParameters.length > 0) {
        resolvedParams = input.whatsappParameters.map((param, index) => {
          if (index === 0 && (!param || param === "{name}" || param === "{firstName}")) {
            return studentFirstName;
          }
          if (param === "{name}" || param === "{firstName}") {
            return studentFirstName;
          }
          return param;
        });
      }

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
          firstName: studentFirstName,
          ...(input.whatsappLanguage ? { language: input.whatsappLanguage } : {}),
          ...(input.whatsappVariableCount !== undefined
            ? { variableCount: String(input.whatsappVariableCount) }
            : {}),
          ...(resolvedParams ? { customParameters: JSON.stringify(resolvedParams) } : {}),
        },
        scheduled_for: scheduledFor,
        idempotency_key: `broadcast:${broadcastId}:${recipient.id}:whatsapp`,
      });
    }
    return rows;
  });
  if (deliveries.length) {
    const { error: insertError } = await adminClient()
      .from("message_deliveries")
      .insert(deliveries);
    if (insertError) {
      console.error("Message deliveries queue error:", insertError.message);
      throw new ApiError(500, `Failed to queue message deliveries: ${insertError.message}`);
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

const templateVariableCache = new Map<string, number>();

export async function fetchApprovedWhatsappTemplates(): Promise<WhatsappTemplateSummary[]> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const version = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
  const defaultTemplate = process.env.WHATSAPP_BROADCAST_TEMPLATE || "ea_academy_broadcast";

  const fallback: WhatsappTemplateSummary[] = [
    {
      name: defaultTemplate,
      status: "CONFIGURED",
      language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
      bodyText: "Default broadcast template (from environment)",
      variableCount: 2,
    },
  ];

  if (!accessToken || !wabaId) {
    return fallback;
  }

  try {
    const url = `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(wabaId)}/message_templates?fields=name,status,language,category,components&limit=100`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("Could not fetch Meta WhatsApp templates:", err);
      return fallback;
    }

    const payload = (await res.json()) as {
      data?: Array<{
        name: string;
        status: string;
        language: string;
        category?: string;
        components?: Array<{
          type: string;
          text?: string;
        }>;
      }>;
    };

    const templates: WhatsappTemplateSummary[] = [];
    for (const t of payload.data || []) {
      if (t.status === "APPROVED") {
        const bodyComp = t.components?.find((c) => c.type === "BODY");
        const bodyText = bodyComp?.text || "";
        const matches = bodyText.match(/\{\{\d+\}\}/g);
        const count = matches ? new Set(matches).size : 0;
        templateVariableCache.set(t.name, count);
        templates.push({
          name: t.name,
          status: t.status,
          language: t.language,
          category: t.category,
          bodyText,
          variableCount: count,
        });
      }
    }

    if (templates.length === 0) {
      return fallback;
    }

    return templates;
  } catch (err) {
    console.warn("Exception fetching Meta WhatsApp templates:", err);
    return fallback;
  }
}

export async function listBroadcasts(): Promise<{
  broadcasts: BroadcastSummary[];
  configuration: ReturnType<typeof configuration>;
  whatsappTemplates: WhatsappTemplateSummary[];
}> {
  const whatsappTemplates = await fetchApprovedWhatsappTemplates();
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
      return { broadcasts: [], configuration: configuration(), whatsappTemplates };
    }

    const failedBroadcastIds = (data || [])
      .filter((item) => (item.failed_count || 0) > 0)
      .map((item) => item.id);

    const errorMap = new Map<string, string>();
    if (failedBroadcastIds.length > 0) {
      try {
        const { data: errorRows } = await adminClient()
          .from("message_deliveries")
          .select("broadcast_id,last_error")
          .in("broadcast_id", failedBroadcastIds)
          .eq("status", "failed")
          .not("last_error", "is", null)
          .order("updated_at", { ascending: false })
          .limit(20);

        for (const row of errorRows || []) {
          if (row.broadcast_id && row.last_error && !errorMap.has(row.broadcast_id)) {
            errorMap.set(row.broadcast_id, row.last_error);
          }
        }
      } catch (err) {
        console.warn("Error fetching broadcast last_error:", err);
      }
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
        lastError: errorMap.get(item.id) || null,
        createdAt: item.created_at,
      })) as BroadcastSummary[],
      configuration: configuration(),
      whatsappTemplates,
    };
  } catch (err) {
    console.warn("listBroadcasts exception:", err);
    return { broadcasts: [], configuration: configuration(), whatsappTemplates };
  }
}

export function formatEmailSender(
  rawFrom = process.env.EMAIL_FROM,
): string | null {
  const trimmed = rawFrom?.trim();
  if (!trimmed) {
    return rawFrom === undefined && process.env.RESEND_API_KEY
      ? `EA Academy <${DEFAULT_VERIFIED_SENDER_ADDRESS}>`
      : null;
  }
  const angleMatch = trimmed.match(/<([^<>]+@[^<>]+)>/);
  const parsedAddress = (angleMatch ? angleMatch[1] : trimmed).trim();
  if (!parsedAddress.includes("@")) return trimmed;
  // Resend's sandbox address only delivers to the account owner; upgrade to our verified domain
  const address =
    parsedAddress.toLowerCase() === "onboarding@resend.dev"
      ? DEFAULT_VERIFIED_SENDER_ADDRESS
      : parsedAddress;
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
  } else if (delivery.kind === "nurture") {
    const vars = delivery.template_variables || {};
    const stage = vars.stage || "day2";
    const whatsappUrl = vars.whatsappGroupUrl || DEFAULT_WHATSAPP_GROUP_URL;
    const ctaLabel = vars.ctaLabel || "Explore EA Academy Premium →";
    const ctaUrl = vars.ctaPath
      ? `${appUrl}${vars.ctaPath}`
      : billingUrl;
    const badgeLabel =
      stage === "day2"
        ? "🤝 Student Community & Support"
        : stage === "day4"
          ? "💼 Career & Portfolio Growth"
          : stage === "day7"
            ? "🔓 Your All-Access Pass (₦100/day)"
            : "🎯 A Personal Note from Emmanuel";

    html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;padding:28px 24px;background-color:#ffffff;color:#1e293b;border-radius:12px;border:1px solid #e2e8f0">
  <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid #f1f5f9">
    <div style="display:inline-block;padding:6px 14px;background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:9999px;font-size:12px;font-weight:700;color:#0284c7;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:12px">
      ${escapeHtml(badgeLabel)}
    </div>
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#002751;letter-spacing:-0.02em">
      ${escapeHtml(delivery.subject || "EA Academy")}
    </h1>
  </div>

  <div style="padding:24px 0;line-height:1.68;font-size:15px;color:#334155">
    <p style="margin:0 0 22px">${safeMessage}</p>

    <div style="margin:22px 0;padding:18px 20px;background-color:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0">
      <div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:6px">
        💬 Stuck on a lesson or have a question?
      </div>
      <p style="margin:0 0 12px;font-size:14px;color:#15803d;line-height:1.55">
        Our active <strong>WhatsApp Student Community</strong> is here for you. Instructors and fellow students answer questions daily and genuinely care about your progress.
      </p>
      <a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;background-color:#16a34a;color:#ffffff;font-weight:600;font-size:13px;padding:9px 18px;border-radius:6px;text-decoration:none">
        Join the WhatsApp Community &rarr;
      </a>
    </div>

    <div style="text-align:center;margin:28px 0 8px">
      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background-color:#002751;color:#ffffff;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;text-decoration:none">
        ${escapeHtml(ctaLabel)}
      </a>
    </div>
  </div>

  <div style="border-top:1px solid #f1f5f9;padding-top:20px;font-size:13px;color:#64748b;line-height:1.5">
    <p style="margin:0 0 4px;font-weight:600;color:#002751">Rooting for your success,</p>
    <p style="margin:0 0 12px;color:#334155"><strong>Emmanuel Amadin</strong> &amp; The EA Academy Team</p>
    <p style="margin:0;font-size:12px;color:#94a3b8">
      Manage your communication preferences anytime in your <a href="${escapeHtml(appUrl)}/app/account" style="color:#0284c7;text-decoration:none">EA Academy Account Settings</a>.
    </p>
  </div>
</div>`;
  } else if (delivery.kind === "abandoned_checkout") {
    const vars = delivery.template_variables || {};
    const itemType = vars.itemType || "course";
    const itemTitle = vars.itemTitle || "EA Academy Course";
    const amountFormatted = vars.amountFormatted || "₦3,000";
    const whatsappUrl = vars.whatsappGroupUrl || DEFAULT_WHATSAPP_GROUP_URL;
    const ctaLabel =
      vars.ctaLabel ||
      (itemType === "digital_product"
        ? "Complete My Order & Download →"
        : itemType === "premium"
          ? "Complete My Premium Upgrade →"
          : "Complete My Course Enrollment →");
    const ctaUrl = vars.ctaPath ? `${appUrl}${vars.ctaPath}` : billingUrl;
    const badgeLabel =
      itemType === "digital_product"
        ? "🛒 Complete Your Order"
        : itemType === "premium"
          ? "🔓 Complete Your Upgrade"
          : "🎓 Complete Your Enrollment";
    const itemTypeLabel =
      itemType === "digital_product"
        ? "Digital Product & Instant Download"
        : itemType === "premium"
          ? "EA Academy Premium Membership"
          : "Self-Paced Online Course";

    html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;padding:28px 24px;background-color:#ffffff;color:#1e293b;border-radius:12px;border:1px solid #e2e8f0">
  <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid #f1f5f9">
    <div style="display:inline-block;padding:6px 14px;background-color:#fffbeb;border:1px solid #fde68a;border-radius:9999px;font-size:12px;font-weight:700;color:#d97706;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:12px">
      ${escapeHtml(badgeLabel)}
    </div>
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#002751;letter-spacing:-0.02em">
      ${escapeHtml(delivery.subject || `Complete your order for ${itemTitle}`)}
    </h1>
  </div>

  <div style="padding:24px 0;line-height:1.68;font-size:15px;color:#334155">
    <p style="margin:0 0 22px">${safeMessage}</p>

    <div style="margin:24px 0;padding:18px 20px;background-color:#f8fafc;border-radius:10px;border:1px solid #e2e8f0">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">
        Saved Checkout Summary
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr>
          <td style="padding:6px 0;color:#64748b">Item:</td>
          <td style="padding:6px 0;text-align:right;font-weight:700;color:#002751">${escapeHtml(itemTitle)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b">Format:</td>
          <td style="padding:6px 0;text-align:right;color:#334155">${escapeHtml(itemTypeLabel)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b">Price:</td>
          <td style="padding:6px 0;text-align:right;font-weight:700;color:#002751;font-size:15px">${escapeHtml(amountFormatted)}</td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:28px 0 22px">
      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background-color:#002751;color:#ffffff;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;text-decoration:none">
        ${escapeHtml(ctaLabel)}
      </a>
    </div>

    <div style="margin:22px 0 0;padding:16px 18px;background-color:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0">
      <div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:6px">
        💬 Had trouble with payment or have a question?
      </div>
      <p style="margin:0 0 12px;font-size:13.5px;color:#15803d;line-height:1.55">
        If Paystack, your card, or bank transfer gave you any hiccup, simply reply to this email or reach out in our WhatsApp community and we will help you get set up right away.
      </p>
      <a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;background-color:#16a34a;color:#ffffff;font-weight:600;font-size:13px;padding:8px 16px;border-radius:6px;text-decoration:none">
        Chat with Us on WhatsApp &rarr;
      </a>
    </div>
  </div>

  <div style="border-top:1px solid #f1f5f9;padding-top:20px;font-size:13px;color:#64748b;line-height:1.5">
    <p style="margin:0 0 4px;font-weight:600;color:#002751">Rooting for your success,</p>
    <p style="margin:0 0 12px;color:#334155"><strong>Emmanuel Amadin</strong> &amp; The EA Academy Team</p>
    <p style="margin:0;font-size:12px;color:#94a3b8">
      Manage your communication preferences anytime in your <a href="${escapeHtml(appUrl)}/app/account" style="color:#0284c7;text-decoration:none">EA Academy Account Settings</a>.
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
  const version = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
  if (!accessToken || !phoneNumberId || !version) return null;
  if (!delivery.template_name)
    throw new Error("No approved WhatsApp template is configured.");
  const variables = delivery.template_variables || {};

  let parameters: Array<{ type: string; text: string }>;
  if (delivery.kind === "birthday") {
    parameters = [{ type: "text", text: variables.firstName || "Student" }];
  } else if (variables.customParameters) {
    try {
      const parsed = JSON.parse(variables.customParameters) as string[];
      parameters = parsed.map((val) => ({
        type: "text",
        text: val || "—",
      }));
    } catch {
      parameters = [
        { type: "text", text: variables.title || "EA Academy" },
        { type: "text", text: variables.message || delivery.message },
      ];
    }
  } else {
    const specifiedCount = variables.variableCount ? Number(variables.variableCount) : undefined;
    const count = specifiedCount !== undefined ? specifiedCount : (templateVariableCache.get(delivery.template_name) ?? 2);
    if (count === 0) {
      parameters = [];
    } else if (count === 1) {
      parameters = [{ type: "text", text: variables.message || variables.title || delivery.message }];
    } else {
      parameters = [
        { type: "text", text: variables.title || "EA Academy" },
        { type: "text", text: variables.message || delivery.message },
      ];
    }
  }

  let toPhone = delivery.recipient.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (/^0[789][01]\d{8}$/.test(toPhone)) {
    toPhone = "234" + toPhone.slice(1);
  }

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
        to: toPhone,
        type: "template",
        template: {
          name: delivery.template_name,
          language: {
            code: variables.language || process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
          },
          ...(parameters.length > 0
            ? { components: [{ type: "body", parameters }] }
            : {}),
        },
      }),
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: {
      message?: string;
      error_data?: { details?: string };
      error_user_title?: string;
      error_user_msg?: string;
    };
  };
  if (!response.ok) {
    const errorDetail =
      body.error?.error_data?.details ||
      body.error?.error_user_msg ||
      body.error?.message ||
      "Meta rejected the message.";
    throw new Error(errorDetail);
  }
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
      if (row.kind === "nurture" || row.kind === "abandoned_checkout") {
        const { data: studentProfile } = await adminClient()
          .from("profiles")
          .select(
            "membership_plan,premium_until,premium_granted,email_notifications_enabled",
          )
          .eq("id", row.student_id)
          .maybeSingle();
        const isAlreadyPremium =
          studentProfile?.membership_plan === "Premium" ||
          studentProfile?.premium_granted === true ||
          (studentProfile?.premium_until &&
            Date.parse(String(studentProfile.premium_until)) > Date.now());
        if (
          !studentProfile ||
          studentProfile.email_notifications_enabled === false
        ) {
          await adminClient()
            .from("message_deliveries")
            .delete()
            .eq("id", row.id);
          continue;
        }
        if (row.kind === "nurture" && isAlreadyPremium) {
          await adminClient()
            .from("message_deliveries")
            .delete()
            .eq("id", row.id);
          continue;
        }
        if (row.kind === "abandoned_checkout") {
          const vars = row.template_variables || {};
          if (vars.intentKind === "premium" && isAlreadyPremium) {
            await adminClient()
              .from("message_deliveries")
              .delete()
              .eq("id", row.id);
            continue;
          }
          if (vars.intentKind === "shop_item" && vars.itemId) {
            const { data: existingPurchase } = await adminClient()
              .from("shop_purchases")
              .select("id")
              .eq("student_id", row.student_id)
              .eq("item_id", vars.itemId)
              .maybeSingle();
            if (existingPurchase) {
              await adminClient()
                .from("message_deliveries")
                .delete()
                .eq("id", row.id);
              continue;
            }
          }
          if (vars.reference) {
            const { data: intentRow } = await adminClient()
              .from("billing_intents")
              .select("status")
              .eq("reference", vars.reference)
              .maybeSingle();
            if (intentRow?.status === "success") {
              await adminClient()
                .from("message_deliveries")
                .delete()
                .eq("id", row.id);
              continue;
            }
          }
        }
      }
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
        template_variables: { firstName },
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
      template_variables: {
        stage: info.stage,
        firstName,
        expiryDateFormatted,
      },
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
    template_variables: {
      stage: info.stage,
      firstName,
      expiryDateFormatted,
    },
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
  studentId?: string;
  studentName: string;
  studentEmail: string;
  phoneNumber?: string;
  trackName: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = formatEmailSender();
  if (!apiKey || !from) return { sent: false, reason: "missing_credentials" };
  const { ownerEmail, studentId, studentName, studentEmail, phoneNumber, trackName } = info;
  const safeName = escapeHtml(studentName || "New student");
  const safeEmail = escapeHtml(studentEmail || "—");
  const safePhone = phoneNumber ? escapeHtml(phoneNumber) : "";
  const safeTrack = escapeHtml(trackName || "—");
  const subject = `🎉 New student: ${studentName}`;
  const text = `A new student just enrolled in EA Academy.\n\nName: ${studentName}\nEmail: ${studentEmail}${phoneNumber ? `\nPhone: ${phoneNumber}` : ""}\nCareer Path: ${trackName}\n\nLog in to the admin dashboard to view their profile.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#10233f">
<h2 style="font-size:20px;margin-bottom:4px">🎉 New student enrolled!</h2>
<p style="font-size:15px;margin:0 0 18px;color:#475569">Someone just joined EA Academy.</p>
<table style="width:100%;border-collapse:collapse;font-size:15px">
<tr><td style="padding:10px 14px;background:#f1f5f9;border-radius:6px 6px 0 0;font-weight:600;color:#002751">Name</td><td style="padding:10px 14px;background:#f8fafc">${safeName}</td></tr>
<tr><td style="padding:10px 14px;background:#f1f5f9;font-weight:600;color:#002751">Email</td><td style="padding:10px 14px;background:#f8fafc">${safeEmail}</td></tr>
${safePhone ? `<tr><td style="padding:10px 14px;background:#f1f5f9;font-weight:600;color:#002751">Phone</td><td style="padding:10px 14px;background:#f8fafc">${safePhone}</td></tr>` : ""}
<tr><td style="padding:10px 14px;background:#f1f5f9;border-radius:0 0 6px 6px;font-weight:600;color:#002751">Career Path</td><td style="padding:10px 14px;background:#f8fafc">${safeTrack}</td></tr>
</table>
</div>`;
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    if (studentId) {
      headers["Idempotency-Key"] = `owner-new-student:${studentId}:email`;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({
        from,
        to: [ownerEmail],
        reply_to: studentEmail || process.env.EMAIL_REPLY_TO || undefined,
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error sending owner new-student alert:", errText);
      return { sent: false, reason: errText };
    }
    return { sent: true };
  } catch (err) {
    console.error("Exception sending owner new-student alert:", err);
    return { sent: false, reason: String(err) };
  }
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

export async function getCommunityWhatsappUrl(): Promise<string> {
  try {
    const { data } = await adminClient()
      .from("community_settings")
      .select("whatsapp_group_url")
      .limit(1)
      .maybeSingle();
    const url = String(data?.whatsapp_group_url || "").trim();
    return url || DEFAULT_WHATSAPP_GROUP_URL;
  } catch {
    return DEFAULT_WHATSAPP_GROUP_URL;
  }
}

export async function sendStudentWelcomeEmail(info: {
  studentId: string;
  studentName?: string | null;
  studentEmail: string;
  trackName: string;
  whatsappGroupUrl?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = formatEmailSender();
  if (!apiKey || !from) return { sent: false, reason: "missing_credentials" };

  const studentEmail = info.studentEmail?.trim();
  if (!studentEmail) return { sent: false, reason: "missing_email" };

  const firstName =
    String(info.studentName || "Student")
      .trim()
      .split(/\s+/)[0] || "Student";
  const safeFirstName = escapeHtml(firstName);
  const safeTrackName = escapeHtml(info.trackName || "Systems & Software Development");
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://ea-academy.org"
  ).replace(/\/$/, "");
  const tracksUrl = `${appUrl}/app/tracks`;
  const communityUrl = `${appUrl}/app/community`;
  const billingUrl = `${appUrl}/app/billing`;
  const whatsappUrl =
    info.whatsappGroupUrl?.trim() || (await getCommunityWhatsappUrl());

  const subject = `🎉 Welcome to EA Academy, ${firstName}! Your ${info.trackName} roadmap is ready`;

  const text = `Hi ${firstName},

Welcome to EA Academy! We are thrilled to have you enrolled in the ${info.trackName} career track.

You didn't join just to watch another set of random online videos — you joined to build real digital skills, gain confidence, and open doors to serious opportunities.

Here is your Day 1 Game Plan (takes 5 minutes):

1. Watch your first intro lesson:
   Dive straight into your ${info.trackName} curriculum and complete Lesson 1 today: ${tracksUrl}

2. Join our Student WhatsApp Community:
   Never learn in isolation! Our WhatsApp community is where instructors and fellow students answer your questions, help when you're stuck, and genuinely care about your progress: ${whatsappUrl}

3. Say hello in the Cohort Lounge:
   Introduce yourself inside the Academy workspace and see what other students are building: ${communityUrl}

Whenever you're ready to unlock all modules across all 3 Career Tracks, Live Group Mentor Sessions, Instructor Assignment Reviews, Selected Academy Courses, and your Verified Learning Transcript, you can upgrade to EA Academy Premium for just ₦3,000/month: ${billingUrl}

We are rooting for your success every step of the way!

Warm regards,
Emmanuel Amadin & The EA Academy Team
${appUrl}`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;padding:28px 24px;background-color:#ffffff;color:#1e293b;border-radius:12px;border:1px solid #e2e8f0">
  <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid #f1f5f9">
    <div style="display:inline-block;padding:6px 14px;background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:9999px;font-size:12px;font-weight:700;color:#0284c7;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px">
      🎓 Welcome to EA Academy
    </div>
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#002751;letter-spacing:-0.02em">
      Your ${safeTrackName} Journey Starts Today!
    </h1>
  </div>

  <div style="padding:24px 0;line-height:1.65;font-size:15px;color:#334155">
    <p style="margin-top:0">Hi <strong>${safeFirstName}</strong>,</p>
    <p>
      Welcome to <strong>EA Academy</strong>! We are thrilled to have you enrolled in the <strong>${safeTrackName}</strong> career track.
    </p>
    <p>
      You didn’t join just to watch random videos — you joined to build practical skills, gain real confidence, and unlock career-changing opportunities.
    </p>

    <div style="margin:22px 0;padding:18px 20px;background-color:#f8fafc;border-radius:10px;border:1px solid #e2e8f0">
      <div style="font-size:12px;font-weight:700;color:#002751;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">
        🚀 Your Day 1 Game Plan
      </div>
      <ol style="margin:0;padding-left:20px;color:#334155;font-size:14px;line-height:1.7">
        <li style="margin-bottom:8px">
          <strong>Watch your first intro lesson:</strong> Open your <strong>${safeTrackName}</strong> curriculum and complete Lesson 1 today to build instant momentum.
        </li>
        <li style="margin-bottom:8px">
          <strong>Join our WhatsApp Student Community:</strong> Never learn alone — our instructors and fellow students answer your questions daily and genuinely care about your progress.
        </li>
        <li>
          <strong>Introduce yourself in the Cohort Lounge:</strong> Share your goals and connect with peers on the same path.
        </li>
      </ol>
    </div>

    <div style="text-align:center;margin:24px 0">
      <a href="${escapeHtml(tracksUrl)}" style="display:inline-block;background-color:#002751;color:#ffffff;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;text-decoration:none">
        Start Your First Lesson &rarr;
      </a>
    </div>

    <div style="margin:24px 0;padding:18px 20px;background-color:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0">
      <div style="font-size:14px;font-weight:700;color:#166534;margin-bottom:6px">
        💬 Join Our Active WhatsApp Community
      </div>
      <p style="margin:0 0 14px;font-size:14px;color:#15803d;line-height:1.55">
        Have a question about your track or want accountability partners who care about your growth? Tap below to join the private EA Academy student WhatsApp group.
      </p>
      <a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;background-color:#16a34a;color:#ffffff;font-weight:600;font-size:13px;padding:10px 18px;border-radius:6px;text-decoration:none">
        Join the WhatsApp Community &rarr;
      </a>
    </div>
  </div>

  <div style="border-top:1px solid #f1f5f9;padding-top:20px;font-size:13px;color:#64748b;line-height:1.5">
    <p style="margin:0 0 4px;font-weight:600;color:#002751">Rooting for your success,</p>
    <p style="margin:0 0 12px;color:#334155"><strong>Emmanuel Amadin</strong> &amp; The EA Academy Team</p>
    <p style="margin:0;font-size:12px;color:#94a3b8">
      Ready for full access to all 3 Career Tracks, Live Mentor Sessions, and Instructor Reviews? <a href="${escapeHtml(billingUrl)}" style="color:#0284c7;text-decoration:none">Explore EA Academy Premium (₦3,000/mo)</a>.
    </p>
  </div>
</div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `welcome:${info.studentId}:email`,
      },
      body: JSON.stringify({
        from,
        to: [studentEmail],
        subject,
        reply_to: process.env.EMAIL_REPLY_TO || undefined,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error sending student welcome email:", errText);
      return { sent: false, reason: errText };
    }
    return { sent: true };
  } catch (err) {
    console.error("Exception sending student welcome email:", err);
    return { sent: false, reason: String(err) };
  }
}

export type NurtureStage = "day2" | "day4" | "day7" | "day10";

export function buildStudentNurtureSequence(info: {
  studentId: string;
  studentName?: string | null;
  studentEmail: string;
  trackName: string;
  whatsappGroupUrl?: string;
  enrolledAt?: Date;
}) {
  const firstName =
    String(info.studentName || "Student")
      .trim()
      .split(/\s+/)[0] || "Student";
  const trackName = info.trackName || "Systems & Software Development";
  const whatsappGroupUrl =
    info.whatsappGroupUrl?.trim() || DEFAULT_WHATSAPP_GROUP_URL;
  const baseMs = (info.enrolledAt || new Date()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const stages: Array<{
    stage: NurtureStage;
    daysOffset: number;
    subject: string;
    message: string;
    ctaLabel: string;
    ctaPath: string;
  }> = [
    {
      stage: "day2",
      daysOffset: 2,
      subject: `How is your ${trackName} journey going, ${firstName}? (Don't learn alone 🤝)`,
      message: `Hi ${firstName},\n\nYou enrolled in ${trackName} a couple of days ago, and I wanted to check in on you.\n\nDo you know the #1 reason most self-taught learners give up? It isn't a lack of talent — it's learning in isolation and getting stuck with nobody to ask.\n\nAt EA Academy, we do things differently because we genuinely care about your progress:\n• In our active WhatsApp Student Community, fellow learners and instructors answer your questions daily and keep you moving forward.\n• And when you're ready for deeper mentorship, EA Academy Premium unlocks Live Group Mentor Sessions, session recordings, and direct Instructor Assignment Reviews so an expert checks your work step by step.\n\nIf you haven't joined our WhatsApp community yet, hop in today and introduce yourself — and check out your upcoming lessons in your workspace!`,
      ctaLabel: "Continue Learning in My Workspace →",
      ctaPath: "/app/tracks",
    },
    {
      stage: "day4",
      daysOffset: 4,
      subject: `Don't just watch tutorials, ${firstName} — build a portfolio that gets you hired 💼`,
      message: `Hi ${firstName},\n\nWatching free tutorials feels productive, but employers and clients don't pay for videos you've watched — they pay for what you can build and prove.\n\nThat's why we designed EA Academy Premium to bridge the gap between "watching lessons" and landing real opportunities.\n\nWhen you upgrade to Premium, you unlock:\n• Full access to all 3 Career Tracks (Systems & Software Development, Creative Media, and Business Growth)\n• Direct Instructor Grading & Feedback on your practical assignments\n• Monthly Portfolio Critique to make your work stand out\n• A Verified Learning Transcript with a unique public verification link for your CV and LinkedIn\n\nMeanwhile, remember our WhatsApp community is always open whenever you have a question or want feedback from peers who care about your growth.`,
      ctaLabel: "See Everything Inside Premium →",
      ctaPath: "/app/billing",
    },
    {
      stage: "day7",
      daysOffset: 7,
      subject: `Unlock all EA Academy tracks & selected courses for ₦100/day 🔓`,
      message: `Hi ${firstName},\n\nHappy 1-week anniversary at EA Academy! 🎉\n\nIf you've enjoyed your starter lessons and our supportive WhatsApp community, imagine how fast you'll grow when you remove every limit on your account.\n\nEA Academy Premium is just ₦3,000/month — that works out to ₦100 a day (less than a bottle of soda or a short bus ride).\n\nHere is what your ₦3,000/month All-Access Pass unlocks immediately:\n• Every module and lesson across all 3 Career Tracks\n• Free access to EA Academy Selected Courses in the Shop\n• Live Group Mentor Sessions & full session recordings\n• Direct Instructor Reviews on your assignments + 1 Monthly Portfolio Critique\n• Ad-Free Classroom experience & your Verified Learning Record\n\nInvest in your next chapter today and unlock the full EA Academy experience.`,
      ctaLabel: "Upgrade to Premium (₦3,000/mo) →",
      ctaPath: "/app/billing",
    },
    {
      stage: "day10",
      daysOffset: 10,
      subject: `A personal note from Emmanuel about your ${trackName} goals 🎯`,
      message: `Hi ${firstName},\n\nIt's been 10 days since you joined EA Academy for ${trackName}, and I wanted to send you a personal note.\n\nWhether you've already completed several lessons or life got busy this week, please remember this: consistency beats perfection every single time.\n\nYou don't have to figure everything out by yourself. Our WhatsApp community is filled with people who answer your questions and genuinely care about your progress — and our instructors are ready to review your assignments, host live mentor sessions, and guide your portfolio inside EA Academy Premium.\n\nIf anything is holding you back, simply reply to this email and tell me what you're working on — I read every reply. Or if you're ready to go all-in on your skills today, click below to activate your Premium All-Access Pass.`,
      ctaLabel: "Activate Your All-Access Pass →",
      ctaPath: "/app/billing",
    },
  ];

  return stages.map((item) => ({
    student_id: info.studentId,
    kind: "nurture" as const,
    channel: "email" as const,
    recipient: info.studentEmail.trim(),
    subject: item.subject,
    message: item.message,
    template_variables: {
      stage: item.stage,
      firstName,
      trackName,
      whatsappGroupUrl,
      ctaLabel: item.ctaLabel,
      ctaPath: item.ctaPath,
    },
    scheduled_for: new Date(baseMs + item.daysOffset * dayMs).toISOString(),
    idempotency_key: `nurture:${item.stage}:${info.studentId}:email`,
  }));
}

export async function queueStudentNurtureSequence(info: {
  studentId: string;
  studentName?: string | null;
  studentEmail: string;
  trackName: string;
  whatsappGroupUrl?: string;
  enrolledAt?: Date;
}) {
  if (
    !info.studentId ||
    !info.studentEmail?.trim() ||
    !process.env.SUPABASE_SECRET_KEY
  ) {
    return { queued: 0 };
  }
  try {
    const whatsappGroupUrl =
      info.whatsappGroupUrl?.trim() || (await getCommunityWhatsappUrl());
    const rows = buildStudentNurtureSequence({
      ...info,
      whatsappGroupUrl,
    });
    const { data: inserted, error } = await adminClient()
      .from("message_deliveries")
      .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.warn("queueStudentNurtureSequence warning:", error.message);
      return { queued: 0 };
    }
    return { queued: inserted?.length || 0 };
  } catch (err) {
    console.warn("queueStudentNurtureSequence exception:", err);
    return { queued: 0 };
  }
}

export async function cancelStudentNurtureSequence(studentId: string) {
  if (!studentId || !process.env.SUPABASE_SECRET_KEY) return;
  try {
    await adminClient()
      .from("message_deliveries")
      .delete()
      .eq("student_id", studentId)
      .eq("kind", "nurture")
      .in("status", ["queued", "failed"]);
  } catch (err) {
    console.warn("cancelStudentNurtureSequence warning:", err);
  }
}

export async function onboardNewStudentCommunications(info: {
  studentId: string;
  studentName?: string | null;
  studentEmail: string;
  trackName: string;
  isPremium?: boolean;
}) {
  if (!info.studentEmail?.trim()) return;
  const whatsappGroupUrl = await getCommunityWhatsappUrl();
  await sendStudentWelcomeEmail({
    studentId: info.studentId,
    studentName: info.studentName,
    studentEmail: info.studentEmail,
    trackName: info.trackName,
    whatsappGroupUrl,
  });
  if (!info.isPremium) {
    await queueStudentNurtureSequence({
      studentId: info.studentId,
      studentName: info.studentName,
      studentEmail: info.studentEmail,
      trackName: info.trackName,
      whatsappGroupUrl,
    });
  }
}

let lastBackgroundQueueRunMs = 0;

export function triggerBackgroundMessageQueue() {
  if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SECRET_KEY) return;
  const nowMs = Date.now();
  if (nowMs - lastBackgroundQueueRunMs < 5 * 60 * 1000) return;
  lastBackgroundQueueRunMs = nowMs;
  void processMessageQueue(15).catch(() => {});
}

export async function sendShopPurchaseConfirmationEmail(info: {
  studentId?: string;
  studentEmail: string;
  studentName?: string | null;
  itemId: string;
  itemTitle: string;
  itemType: "course" | "digital_product";
  itemSlug?: string | null;
  amount: number;
  reference: string;
  whatsappGroupUrl?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = formatEmailSender();
  if (!apiKey || !from) return { sent: false, reason: "missing_credentials" };

  const studentEmail = info.studentEmail?.trim();
  if (!studentEmail) return { sent: false, reason: "missing_email" };

  const firstName =
    String(info.studentName || "Student")
      .trim()
      .split(/\s+/)[0] || "Student";
  const safeFirstName = escapeHtml(firstName);
  const isDigitalProduct = info.itemType === "digital_product";
  const itemTitle =
    info.itemTitle?.trim() ||
    (isDigitalProduct ? "EA Academy Digital Product" : "EA Academy Course");
  const safeItemTitle = escapeHtml(itemTitle);
  const safeReference = escapeHtml(info.reference);
  const formattedAmount = `₦${Math.round(info.amount).toLocaleString("en-NG")}`;
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://ea-academy.org"
  ).replace(/\/$/, "");
  const libraryUrl = `${appUrl}/app/library`;
  const primaryActionUrl = isDigitalProduct
    ? `${appUrl}/app/library?purchased=${encodeURIComponent(info.itemId)}`
    : `${appUrl}/app/learn-course/${encodeURIComponent(info.itemId)}`;
  const primaryActionLabel = isDigitalProduct
    ? "Access & Download in My Library →"
    : "Start Learning Now →";
  const whatsappUrl =
    info.whatsappGroupUrl?.trim() || (await getCommunityWhatsappUrl());

  const subject = isDigitalProduct
    ? `📦 Your Download Is Ready: ${itemTitle}`
    : `🎉 Course Unlocked: ${itemTitle} — Start Learning Now`;

  const badgeLabel = isDigitalProduct
    ? "📦 Digital Product Unlocked"
    : "🎓 Course Enrollment Confirmed";

  const headline = isDigitalProduct
    ? "Your Digital Download Is Ready!"
    : `You're Enrolled in ${itemTitle}!`;

  const itemTypeLabel = isDigitalProduct
    ? "Digital Product & Download"
    : "Self-Paced Online Course";

  const accessSummary = isDigitalProduct
    ? "Instant & Permanent Download in Library"
    : "Immediate & Lifetime Classroom Access";

  const text = isDigitalProduct
    ? `Hi ${firstName},

Thank you for your purchase! Your payment of ${formattedAmount} for "${itemTitle}" has been confirmed, and your digital product is ready for immediate download inside your EA Academy Digital Library.

Order Receipt Summary:
- Item: ${itemTitle}
- Type: ${itemTypeLabel}
- Amount Paid: ${formattedAmount}
- Reference: ${info.reference}
- Date: ${dateStr}

Access & Download Your Product Now:
${primaryActionUrl}

You can re-download your files anytime from your EA Academy Digital Library (${libraryUrl}).

Need help or want to connect with fellow builders? Join our active WhatsApp Student Community:
${whatsappUrl}

Warm regards,
Emmanuel Amadin & The EA Academy Team
${appUrl}`
    : `Hi ${firstName},

Congratulations and welcome! Your payment of ${formattedAmount} for "${itemTitle}" has been confirmed, and full lifetime access to your course classroom is now unlocked.

Order & Enrollment Receipt Summary:
- Course: ${itemTitle}
- Type: ${itemTypeLabel}
- Amount Paid: ${formattedAmount}
- Reference: ${info.reference}
- Date: ${dateStr}

Start Learning Right Away:
1. Open your Course Classroom & watch Lesson 1: ${primaryActionUrl}
2. Complete chapter lessons & assessments at your own pace to unlock your verifiable EA Academy Certificate.
3. Access all your courses anytime in your Digital Library: ${libraryUrl}

Join our active WhatsApp Student Community to ask questions and connect with instructors and peers:
${whatsappUrl}

Rooting for your success,
Emmanuel Amadin & The EA Academy Team
${appUrl}`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;padding:28px 24px;background-color:#ffffff;color:#1e293b;border-radius:12px;border:1px solid #e2e8f0">
  <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid #f1f5f9">
    <div style="display:inline-block;padding:6px 14px;background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:9999px;font-size:12px;font-weight:700;color:#059669;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px">
      ${escapeHtml(badgeLabel)}
    </div>
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#002751;letter-spacing:-0.02em">
      ${escapeHtml(headline)}
    </h1>
  </div>

  <div style="padding:24px 0;line-height:1.65;font-size:15px;color:#334155">
    <p style="margin-top:0">Hi <strong>${safeFirstName}</strong>,</p>
    <p>
      ${
        isDigitalProduct
          ? `Thank you for your order! Your payment of <strong>${formattedAmount}</strong> has been confirmed, and <strong>${safeItemTitle}</strong> is now unlocked in your EA Academy Digital Library for immediate download.`
          : `Congratulations! Your payment of <strong>${formattedAmount}</strong> has been confirmed, and you now have full, permanent access to <strong>${safeItemTitle}</strong>.`
      }
    </p>

    <div style="margin:24px 0;padding:18px 20px;background-color:#f8fafc;border-radius:10px;border:1px solid #e2e8f0">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">
        Order Receipt Summary
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr>
          <td style="padding:6px 0;color:#64748b">Item:</td>
          <td style="padding:6px 0;text-align:right;font-weight:700;color:#002751">${safeItemTitle}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b">Format:</td>
          <td style="padding:6px 0;text-align:right;color:#334155">${escapeHtml(itemTypeLabel)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b">Amount Paid:</td>
          <td style="padding:6px 0;text-align:right;font-weight:700;color:#059669;font-size:16px">${formattedAmount}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b">Reference Code:</td>
          <td style="padding:6px 0;text-align:right;font-family:monospace;color:#334155">${safeReference}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b">Date:</td>
          <td style="padding:6px 0;text-align:right;color:#334155">${escapeHtml(dateStr)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b">Access:</td>
          <td style="padding:6px 0;text-align:right;color:#334155">${escapeHtml(accessSummary)}</td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:26px 0 18px">
      <a href="${escapeHtml(primaryActionUrl)}" style="display:inline-block;background-color:#002751;color:#ffffff;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;text-decoration:none">
        ${escapeHtml(primaryActionLabel)}
      </a>
    </div>

    <p style="font-size:13.5px;color:#475569;text-align:center;margin:0 0 24px">
      You can also access all your purchased courses, certificates, and downloads anytime in your <a href="${escapeHtml(libraryUrl)}" style="color:#0284c7;font-weight:600;text-decoration:none">EA Academy Digital Library</a>.
    </p>

    <div style="margin:24px 0 0;padding:18px 20px;background-color:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0">
      <div style="font-size:14px;font-weight:700;color:#166534;margin-bottom:6px">
        💬 Have Questions as You Learn?
      </div>
      <p style="margin:0 0 14px;font-size:14px;color:#15803d;line-height:1.55">
        Join our active <strong>WhatsApp Student Community</strong> where instructors and fellow learners answer questions daily and support your growth.
      </p>
      <a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;background-color:#16a34a;color:#ffffff;font-weight:600;font-size:13px;padding:10px 18px;border-radius:6px;text-decoration:none">
        Join the WhatsApp Community &rarr;
      </a>
    </div>
  </div>

  <div style="border-top:1px solid #f1f5f9;padding-top:20px;font-size:13px;color:#64748b;line-height:1.5">
    <p style="margin:0 0 4px;font-weight:600;color:#002751">Rooting for your success,</p>
    <p style="margin:0 0 12px;color:#334155"><strong>Emmanuel Amadin</strong> &amp; The EA Academy Team</p>
    <p style="margin:0;font-size:12px;color:#94a3b8">
      EA Academy — Equipping African talent for global opportunities. <a href="${escapeHtml(appUrl)}" style="color:#0284c7;text-decoration:none">${escapeHtml(appUrl.replace(/^https?:\/\//, ""))}</a>
    </p>
  </div>
</div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `shop_purchase:${info.reference}:email`,
      },
      body: JSON.stringify({
        from,
        to: [studentEmail],
        subject,
        reply_to: process.env.EMAIL_REPLY_TO || undefined,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error sending shop purchase email:", errText);
      return { sent: false, reason: errText };
    }
    return { sent: true };
  } catch (err) {
    console.error("Exception sending shop purchase email:", err);
    return { sent: false, reason: String(err) };
  }
}

export function buildAbandonedCheckoutReminderContent(info: {
  reference: string;
  studentId: string;
  studentName?: string | null;
  email: string;
  kind: "shop_item" | "premium";
  itemId?: string | null;
  itemTitle?: string | null;
  itemType?: string | null;
  itemSlug?: string | null;
  amountNaira: number;
  createdAt?: string | Date;
  scheduledFor?: string | Date;
  whatsappGroupUrl?: string;
}) {
  const firstName =
    String(info.studentName || "Student")
      .trim()
      .split(/\s+/)[0] || "Student";
  const formattedAmount = `₦${Math.round(info.amountNaira).toLocaleString("en-NG")}`;
  const createdDate = info.createdAt ? new Date(info.createdAt) : new Date();
  const dateKey = Number.isFinite(createdDate.getTime())
    ? createdDate.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const scheduledDate = info.scheduledFor
    ? new Date(info.scheduledFor)
    : new Date(
        (Number.isFinite(createdDate.getTime())
          ? createdDate.getTime()
          : Date.now()) +
          60 * 60 * 1000,
      );
  const whatsappGroupUrl =
    info.whatsappGroupUrl?.trim() || DEFAULT_WHATSAPP_GROUP_URL;

  if (info.kind === "premium") {
    const itemTitle = "EA Academy Premium Membership";
    const ctaPath = "/app/billing";
    const ctaLabel = "Complete My Premium Upgrade →";
    const subject = `Complete your EA Academy Premium upgrade, ${firstName} 🔓`;
    const message = `Hi ${firstName},\n\nWe noticed you started upgrading to EA Academy Premium (${formattedAmount}/month) earlier, but your checkout wasn't completed.\n\nWhen you activate your Premium All-Access Pass, you immediately unlock:\n• Every module and practical lesson across all 3 Career Tracks\n• Free access to EA Academy Selected Courses in the Shop\n• Live Group Mentor Sessions & full session recordings\n• Direct Instructor Grading & Feedback on your assignments + Monthly Portfolio Critique\n• Your Verified Learning Transcript\n\nIf you experienced a network or payment hiccup with Paystack or bank transfer, you can resume and complete your upgrade in under a minute using the button below — or reply to this email if you need any help!`;

    return {
      student_id: info.studentId,
      kind: "abandoned_checkout" as const,
      channel: "email" as const,
      recipient: info.email.trim(),
      subject,
      message,
      template_variables: {
        reference: info.reference,
        intentKind: "premium",
        itemType: "premium",
        itemTitle,
        amountFormatted: `${formattedAmount} / 30 days`,
        ctaPath,
        ctaLabel,
        whatsappGroupUrl,
      },
      scheduled_for: scheduledDate.toISOString(),
      idempotency_key: `abandoned_checkout:premium:${info.studentId}:${dateKey}:email`,
    };
  }

  const isDigitalProduct = info.itemType === "digital_product";
  const itemTitle =
    info.itemTitle?.trim() ||
    (isDigitalProduct ? "EA Academy Digital Product" : "EA Academy Course");
  const itemId = info.itemId?.trim() || "";
  const itemSlug = info.itemSlug?.trim() || "";
  const ctaPath = itemSlug
    ? `/shop/${encodeURIComponent(itemSlug)}${itemId ? `?buy=${encodeURIComponent(itemId)}` : ""}`
    : "/shop";
  const ctaLabel = isDigitalProduct
    ? "Complete My Order & Download →"
    : "Complete My Course Enrollment →";

  const subject = isDigitalProduct
    ? `You left "${itemTitle}" in your checkout, ${firstName} 📦`
    : `Still thinking about "${itemTitle}", ${firstName}? Your spot is waiting 🎓`;

  const message = isDigitalProduct
    ? `Hi ${firstName},\n\nWe noticed you started checking out "${itemTitle}" (${formattedAmount}) in the EA Academy Shop, but didn't finish completing your order.\n\nWe saved your selection so you can pick up right where you left off. As soon as your payment is confirmed, "${itemTitle}" is unlocked immediately in your EA Academy Digital Library for instant and permanent download.\n\nClick the button below to complete your order in one click — and if you ran into any issue with Paystack, card, or bank transfer, just reply to this email and we'll help you right away.`
    : `Hi ${firstName},\n\nWe noticed you started enrolling in "${itemTitle}" (${formattedAmount}), but your checkout wasn't completed.\n\nYour spot is still waiting for you! As soon as you complete your enrollment, you unlock immediate, lifetime access to:\n• All HD video lessons and practical walkthroughs in "${itemTitle}"\n• Downloadable course resources and chapter assessments\n• Your verifiable EA Academy Certificate of Completion\n\nClick the button below to resume your enrollment where you left off — or reply directly to this email if you had any trouble with payment.`;

  return {
    student_id: info.studentId,
    kind: "abandoned_checkout" as const,
    channel: "email" as const,
    recipient: info.email.trim(),
    subject,
    message,
    template_variables: {
      reference: info.reference,
      intentKind: "shop_item",
      itemId,
      itemSlug,
      itemType: isDigitalProduct ? "digital_product" : "course",
      itemTitle,
      amountFormatted: formattedAmount,
      ctaPath,
      ctaLabel,
      whatsappGroupUrl,
    },
    scheduled_for: scheduledDate.toISOString(),
    idempotency_key: `abandoned_checkout:shop_item:${info.studentId}:${itemId || info.reference}:${dateKey}:email`,
  };
}

export async function queueAbandonedCheckoutFollowUp(info: {
  reference: string;
  studentId: string;
  studentName?: string | null;
  email: string;
  kind: "shop_item" | "premium";
  itemId?: string | null;
  itemTitle?: string | null;
  itemType?: string | null;
  itemSlug?: string | null;
  amountNaira: number;
  createdAt?: string | Date;
}) {
  if (
    !info.studentId ||
    !info.email?.trim() ||
    !process.env.SUPABASE_SECRET_KEY
  ) {
    return { queued: 0 };
  }
  try {
    const whatsappGroupUrl = await getCommunityWhatsappUrl();
    const row = buildAbandonedCheckoutReminderContent({
      ...info,
      whatsappGroupUrl,
    });
    const { data: inserted, error } = await adminClient()
      .from("message_deliveries")
      .upsert([row], {
        onConflict: "idempotency_key",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) {
      console.warn("queueAbandonedCheckoutFollowUp warning:", error.message);
      return { queued: 0 };
    }
    return { queued: inserted?.length || 0 };
  } catch (err) {
    console.warn("queueAbandonedCheckoutFollowUp exception:", err);
    return { queued: 0 };
  }
}

export async function queueAbandonedCheckoutReminders(now = new Date()) {
  if (!process.env.SUPABASE_SECRET_KEY) return { queued: 0 };
  const minAgeIso = new Date(now.getTime() - 45 * 60 * 1000).toISOString();
  const maxAgeIso = new Date(
    now.getTime() - 72 * 60 * 60 * 1000,
  ).toISOString();

  try {
    const { data: intents, error } = await adminClient()
      .from("billing_intents")
      .select(
        "reference,student_id,email,kind,item_id,item_title,item_type,item_slug,amount_kobo,donor_name,created_at,status",
      )
      .eq("status", "pending")
      .in("kind", ["shop_item", "premium"])
      .gte("created_at", maxAgeIso)
      .lte("created_at", minAgeIso)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error || !intents?.length) {
      if (error) {
        console.warn("queueAbandonedCheckoutReminders query warning:", error.message);
      }
      return { queued: 0 };
    }

    const whatsappGroupUrl = await getCommunityWhatsappUrl();
    const rows: Record<string, unknown>[] = [];
    const seenKeys = new Set<string>();

    for (const intent of intents) {
      const studentId = String(intent.student_id || "");
      const email = String(intent.email || "").trim();
      const kind = intent.kind as "shop_item" | "premium";
      if (!studentId || !email) continue;

      const { data: profile } = await adminClient()
        .from("profiles")
        .select(
          "full_name,membership_plan,premium_until,premium_granted,email_notifications_enabled",
        )
        .eq("id", studentId)
        .maybeSingle();

      if (!profile || profile.email_notifications_enabled === false) continue;

      const isAlreadyPremium =
        profile.membership_plan === "Premium" ||
        profile.premium_granted === true ||
        (profile.premium_until &&
          Date.parse(String(profile.premium_until)) > now.getTime());

      if (kind === "premium" && isAlreadyPremium) continue;

      if (kind === "shop_item" && intent.item_id) {
        const { data: existingPurchase } = await adminClient()
          .from("shop_purchases")
          .select("id")
          .eq("student_id", studentId)
          .eq("item_id", String(intent.item_id))
          .maybeSingle();
        if (existingPurchase) continue;
      }

      const row = buildAbandonedCheckoutReminderContent({
        reference: String(intent.reference),
        studentId,
        studentName: profile.full_name || intent.donor_name,
        email,
        kind,
        itemId: intent.item_id ? String(intent.item_id) : null,
        itemTitle: intent.item_title ? String(intent.item_title) : null,
        itemType: intent.item_type ? String(intent.item_type) : null,
        itemSlug: intent.item_slug ? String(intent.item_slug) : null,
        amountNaira: Number(intent.amount_kobo || 0) / 100,
        createdAt: String(intent.created_at || now.toISOString()),
        scheduledFor: now,
        whatsappGroupUrl,
      });

      if (seenKeys.has(row.idempotency_key)) continue;
      seenKeys.add(row.idempotency_key);
      rows.push(row);
    }

    if (!rows.length) return { queued: 0 };

    const { data: inserted, error: insertError } = await adminClient()
      .from("message_deliveries")
      .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true })
      .select("id");

    if (insertError) {
      console.warn(
        "queueAbandonedCheckoutReminders insert warning:",
        insertError.message,
      );
      return { queued: 0 };
    }

    return { queued: inserted?.length || 0 };
  } catch (err) {
    console.warn("queueAbandonedCheckoutReminders exception:", err);
    return { queued: 0 };
  }
}

export async function cancelAbandonedCheckoutReminders(
  studentId: string,
  target?: { kind?: "shop_item" | "premium"; itemId?: string | null },
) {
  if (!studentId || !process.env.SUPABASE_SECRET_KEY) return;
  try {
    const { data: rows } = await adminClient()
      .from("message_deliveries")
      .select("id,template_variables")
      .eq("student_id", studentId)
      .eq("kind", "abandoned_checkout")
      .in("status", ["queued", "failed"]);

    if (!rows?.length) return;

    const idsToDelete = rows
      .filter((row) => {
        if (!target) return true;
        const vars = (row.template_variables || {}) as Record<string, string>;
        if (target.kind === "premium") {
          return vars.intentKind === "premium";
        }
        if (target.kind === "shop_item" && target.itemId) {
          return vars.itemId === target.itemId;
        }
        return true;
      })
      .map((row) => row.id);

    if (idsToDelete.length > 0) {
      await adminClient()
        .from("message_deliveries")
        .delete()
        .in("id", idsToDelete);
    }
  } catch (err) {
    console.warn("cancelAbandonedCheckoutReminders warning:", err);
  }
}

export async function deleteBroadcast(broadcastId: string) {
  if (!broadcastId) {
    throw new ApiError(400, "Broadcast ID is required.");
  }
  try {
    await adminClient()
      .from("message_deliveries")
      .delete()
      .eq("broadcast_id", broadcastId);

    const { error } = await adminClient()
      .from("broadcasts")
      .delete()
      .eq("id", broadcastId);

    if (error) {
      console.warn("deleteBroadcast warning:", error.message);
      throw new ApiError(500, `Failed to delete broadcast: ${error.message}`);
    }
    return { success: true, deletedId: broadcastId };
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, "Failed to delete broadcast record.");
  }
}
