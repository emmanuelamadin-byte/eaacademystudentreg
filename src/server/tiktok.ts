import "server-only";
import { createHash, randomUUID } from "node:crypto";

export const TIKTOK_PIXEL_ID =
  process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || "DAR9IL3C77U5PB609PVG";

const TIKTOK_ACCESS_TOKEN =
  process.env.TIKTOK_ACCESS_TOKEN || "f8254d6ab6dce7e3f241eace438c4268818b781c";

const TIKTOK_EVENTS_ENDPOINT =
  "https://business-api.tiktok.com/open_api/v1.3/event/track/";

export type TikTokEventName =
  | "ViewContent"
  | "AddToWishlist"
  | "Search"
  | "AddPaymentInfo"
  | "AddToCart"
  | "InitiateCheckout"
  | "PlaceAnOrder"
  | "CompleteRegistration"
  | "Purchase"
  | "CompletePayment";

export interface TikTokCustomerInfo {
  email?: string | null;
  phone_number?: string | null;
  external_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  callback?: string | null; // ttclid
  ttclid?: string | null;
  ttp?: string | null;
}

export interface TikTokEventProperties {
  value?: number;
  currency?: string;
  content_id?: string;
  content_type?: string;
  content_name?: string;
  content_category?: string;
  query?: string;
  brand?: string;
  url?: string;
  referrer?: string;
}

export interface TikTokServerEventInput {
  event: TikTokEventName;
  event_id?: string;
  timestamp?: number;
  url?: string;
  referrer?: string;
  properties?: TikTokEventProperties;
  user?: TikTokCustomerInfo;
  test_event_code?: string;
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function sha256(value: string): string {
  const trimmed = value.trim();
  if (isSha256Hex(trimmed)) return trimmed.toLowerCase();
  return createHash("sha256").update(trimmed).digest("hex");
}

export function hashEmail(email?: string | null): string | undefined {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return undefined;
  return sha256(normalized);
}

export function hashPhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const raw = phone.trim();
  if (!raw) return undefined;
  if (isSha256Hex(raw)) return raw.toLowerCase();
  // Normalize to E.164 with leading '+'
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return undefined;
  let e164 = digits;
  if (!e164.startsWith("+")) {
    if (e164.startsWith("0") && e164.length === 11) {
      e164 = `+234${e164.slice(1)}`;
    } else {
      e164 = `+${e164}`;
    }
  }
  return sha256(e164);
}

export function hashExternalId(externalId?: string | null): string | undefined {
  if (!externalId) return undefined;
  const normalized = externalId.trim().toLowerCase();
  if (!normalized) return undefined;
  return sha256(normalized);
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function extractTikTokRequestContext(request?: Request): {
  ip?: string;
  user_agent?: string;
  ttp?: string;
  ttclid?: string;
  referrer?: string;
} {
  if (!request) return {};
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp =
    request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip");
  const ip = forwardedFor
    ? forwardedFor.split(",")[0]?.trim()
    : realIp?.trim() || undefined;

  const rawUa = request.headers.get("user-agent")?.trim() || undefined;
  const isAutomatedUa =
    rawUa &&
    /^(node|undici|axios|got|curl|python|java|go-http-client|wget)/i.test(rawUa);
  const user_agent = isAutomatedUa ? undefined : rawUa;

  const cookies = parseCookies(request.headers.get("cookie"));
  const ttp = cookies["_ttp"] || undefined;
  const ttclid = cookies["ttclid"] || cookies["tt_clid"] || undefined;
  const referrer = request.headers.get("referer") || undefined;

  return { ip, user_agent, ttp, ttclid, referrer };
}

export async function sendTikTokServerEvent(
  input: TikTokServerEventInput,
): Promise<{ ok: boolean; event_id: string }> {
  const eventId = input.event_id || randomUUID();
  if (!TIKTOK_ACCESS_TOKEN || !TIKTOK_PIXEL_ID) {
    return { ok: false, event_id: eventId };
  }

  const eventTime = input.timestamp
    ? Math.floor(
        input.timestamp > 1e11 ? input.timestamp / 1000 : input.timestamp,
      )
    : Math.floor(Date.now() / 1000);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://student.cleanbrandagency.com";

  const pageUrl = input.url || input.properties?.url || siteUrl;
  const pageReferrer = input.referrer || input.properties?.referrer || undefined;

  const userObj: Record<string, string> = {};
  const emailHash = hashEmail(input.user?.email);
  const phoneHash = hashPhone(input.user?.phone_number);
  const externalIdHash = hashExternalId(input.user?.external_id);

  if (emailHash) userObj.email = emailHash;
  if (phoneHash) userObj.phone = phoneHash;
  if (externalIdHash) userObj.external_id = externalIdHash;
  if (input.user?.ip) userObj.ip = input.user.ip;
  if (input.user?.user_agent) userObj.user_agent = input.user.user_agent;
  if (input.user?.ttp) userObj.ttp = input.user.ttp;
  const clickId = input.user?.ttclid || input.user?.callback;
  if (clickId) userObj.ttclid = clickId;

  const props = input.properties || {};
  const propertiesObj: Record<string, unknown> = {};

  if (typeof props.value === "number" && Number.isFinite(props.value)) {
    propertiesObj.value = props.value;
  }
  if (props.currency) {
    propertiesObj.currency = props.currency;
  } else if (typeof props.value === "number") {
    propertiesObj.currency = "NGN";
  }

  if (props.content_id) {
    propertiesObj.content_id = props.content_id;
  }
  if (props.content_type) {
    propertiesObj.content_type = props.content_type;
  } else if (props.content_id || props.content_name) {
    propertiesObj.content_type = "product";
  }
  if (props.content_name) {
    propertiesObj.content_name = props.content_name;
  }
  if (props.content_category) {
    propertiesObj.content_category = props.content_category;
  }
  if (props.query) {
    propertiesObj.query = props.query;
    propertiesObj.search_string = props.query;
  }
  const brand = props.brand || "EA Academy";
  propertiesObj.brand = brand;

  if (props.content_id || props.content_name) {
    propertiesObj.contents = [
      {
        content_id: props.content_id || "ea-academy",
        content_type:
          (propertiesObj.content_type as string) || "product",
        content_name: props.content_name || "EA Academy",
        ...(props.content_category
          ? { content_category: props.content_category }
          : {}),
        ...(typeof props.value === "number" ? { price: props.value } : {}),
        quantity: 1,
        brand,
      },
    ];
  }

  const eventRecord: Record<string, unknown> = {
    event: input.event,
    event_time: eventTime,
    event_id: eventId,
    user: userObj,
    page: {
      url: pageUrl,
      ...(pageReferrer ? { referrer: pageReferrer } : {}),
    },
    properties: propertiesObj,
  };

  const payload: Record<string, unknown> = {
    event_source: "web",
    event_source_id: TIKTOK_PIXEL_ID,
    data: [eventRecord],
  };

  const testCode =
    input.test_event_code || process.env.TIKTOK_TEST_EVENT_CODE || undefined;
  if (testCode) {
    payload.test_event_code = testCode;
  }

  try {
    const response = await fetch(TIKTOK_EVENTS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": TIKTOK_ACCESS_TOKEN,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, event_id: eventId };
    }
    const result = (await response.json().catch(() => null)) as {
      code?: number;
    } | null;
    return { ok: result?.code === 0, event_id: eventId };
  } catch {
    return { ok: false, event_id: eventId };
  }
}
