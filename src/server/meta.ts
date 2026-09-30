import "server-only";
import { createHash, randomUUID } from "node:crypto";

export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID || "1416629140565273";

const META_CONVERSIONS_API_TOKEN =
  process.env.META_CONVERSIONS_API_TOKEN ||
  process.env.FACEBOOK_ACCESS_TOKEN ||
  "";

export interface MetaCustomerInfo {
  email?: string | null;
  phone_number?: string | null;
  external_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
}

export interface MetaServerEventProperties {
  value?: number;
  currency?: string;
  content_id?: string;
  content_type?: string;
  content_name?: string;
  content_category?: string;
  url?: string;
}

export interface MetaServerEventInput {
  event:
    | "InitiateCheckout"
    | "Purchase"
    | "Subscribe"
    | "CompleteRegistration";
  event_id?: string;
  timestamp?: number;
  properties?: MetaServerEventProperties;
  user?: MetaCustomerInfo;
}

function sha256(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (/^[a-f0-9]{64}$/i.test(trimmed)) return trimmed;
  return createHash("sha256").update(trimmed).digest("hex");
}

function hashEmail(email?: string | null): string | undefined {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return undefined;
  return sha256(normalized);
}

function hashPhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.trim().replace(/[^\d]/g, "");
  if (!digits) return undefined;
  const normalized =
    digits.startsWith("0") && digits.length === 11
      ? `234${digits.slice(1)}`
      : digits;
  return sha256(normalized);
}

export async function sendMetaServerEvent(
  input: MetaServerEventInput,
): Promise<void> {
  if (!META_CONVERSIONS_API_TOKEN || !META_PIXEL_ID) {
    return;
  }

  try {
    const eventTime = input.timestamp || Math.floor(Date.now() / 1000);
    const eventId = input.event_id || `meta_${randomUUID()}`;
    const props = input.properties || {};
    const user = input.user || {};

    const userData: Record<string, unknown> = {};
    const hashedEm = hashEmail(user.email);
    const hashedPh = hashPhone(user.phone_number);
    const hashedExtId = user.external_id?.trim()
      ? sha256(user.external_id)
      : undefined;

    if (hashedEm) userData.em = [hashedEm];
    if (hashedPh) userData.ph = [hashedPh];
    if (hashedExtId) userData.external_id = [hashedExtId];
    if (user.ip) userData.client_ip_address = user.ip;
    if (user.user_agent) userData.client_user_agent = user.user_agent;

    const customData: Record<string, unknown> = {
      currency: props.currency || "NGN",
      content_type: props.content_type || "product",
    };

    if (typeof props.value === "number" && Number.isFinite(props.value)) {
      customData.value = props.value;
    }
    if (props.content_id) {
      customData.content_ids = [props.content_id];
    }
    if (props.content_name) {
      customData.content_name = props.content_name;
    }
    if (props.content_category) {
      customData.content_category = props.content_category;
    }

    const endpoint = `https://graph.facebook.com/v21.0/${encodeURIComponent(META_PIXEL_ID)}/events?access_token=${encodeURIComponent(META_CONVERSIONS_API_TOKEN)}`;

    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          {
            event_name: input.event,
            event_time: eventTime,
            event_id: eventId,
            action_source: "website",
            event_source_url:
              props.url ||
              process.env.NEXT_PUBLIC_SITE_URL ||
              "https://student.cleanbrandagency.com",
            user_data: userData,
            custom_data: customData,
          },
        ],
      }),
    });
  } catch {
    // Non-blocking analytics call
  }
}
