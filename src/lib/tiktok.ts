"use client";

export type TikTokEventName =
  | "ViewContent"
  | "AddToWishlist"
  | "Search"
  | "AddPaymentInfo"
  | "AddToCart"
  | "InitiateCheckout"
  | "PlaceAnOrder"
  | "CompleteRegistration"
  | "Purchase";

export interface TikTokEventParams {
  value?: number;
  currency?: string;
  content_id?: string;
  content_type?: string;
  content_name?: string;
  content_category?: string;
  query?: string;
  brand?: string;
  event_id?: string;
  timestamp?: number;
  url?: string;
}

export interface TikTokUserParams {
  email?: string | null;
  phone_number?: string | null;
  external_id?: string | null;
  callback?: string | null;
  ttp?: string | null;
}

declare global {
  interface Window {
    ttq?: {
      page: () => void;
      track: (
        event: string,
        data?: Record<string, unknown>,
        options?: { event_id?: string },
      ) => void;
      identify: (data?: Record<string, unknown>) => void;
    };
  }
}

function getCookieValue(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(
      "(?:^|; )" + name.replace(/([$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)",
    ),
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function captureTikTokClickId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    const ttclid = params.get("ttclid");
    if (ttclid) {
      const maxAge = 60 * 60 * 24 * 30; // 30 days
      document.cookie = `ttclid=${encodeURIComponent(ttclid)}; path=/; max-age=${maxAge}; SameSite=Lax`;
      localStorage.setItem("ea_ttclid", ttclid);
      return ttclid;
    }
    return (
      getCookieValue("ttclid") ||
      localStorage.getItem("ea_ttclid") ||
      undefined
    );
  } catch {
    return getCookieValue("ttclid");
  }
}

export function identifyTikTokUser(user?: TikTokUserParams | null) {
  if (typeof window === "undefined" || !user) return;
  const payload: Record<string, string> = {};
  if (user.email?.trim()) payload.email = user.email.trim().toLowerCase();
  if (user.phone_number?.trim()) {
    const digits = user.phone_number.trim().replace(/[^\d+]/g, "");
    if (digits) {
      payload.phone_number = digits.startsWith("+")
        ? digits
        : digits.startsWith("0") && digits.length === 11
          ? `+234${digits.slice(1)}`
          : `+${digits}`;
    }
  }
  if (user.external_id?.trim()) payload.external_id = user.external_id.trim();
  if (Object.keys(payload).length > 0) {
    window.ttq?.identify(payload);
  }
}

function generateEventId(prefix = "tt"): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function trackTikTokEvent(
  event: TikTokEventName,
  params: TikTokEventParams = {},
  user?: TikTokUserParams | null,
) {
  if (typeof window === "undefined") return;

  const eventId = params.event_id || generateEventId(event.toLowerCase());
  const timestamp = params.timestamp || Math.floor(Date.now() / 1000);
  const url = params.url || window.location.href;
  const currency = params.currency || "NGN";
  const brand = params.brand || "EA Academy";
  const contentType = params.content_type || "product";

  if (user) {
    identifyTikTokUser(user);
  }

  const browserProps: Record<string, unknown> = {
    currency,
    brand,
    content_type: contentType,
  };

  if (typeof params.value === "number" && Number.isFinite(params.value)) {
    browserProps.value = params.value;
  }
  if (params.content_id) browserProps.content_id = params.content_id;
  if (params.content_name) browserProps.content_name = params.content_name;
  if (params.content_category) {
    browserProps.content_category = params.content_category;
  }
  if (params.query) {
    browserProps.query = params.query;
    browserProps.search_string = params.query;
  }
  if (params.content_id || params.content_name) {
    browserProps.contents = [
      {
        content_id: params.content_id || "ea-academy",
        content_type: contentType,
        content_name: params.content_name || "EA Academy",
        ...(params.content_category
          ? { content_category: params.content_category }
          : {}),
        ...(typeof params.value === "number" ? { price: params.value } : {}),
        quantity: 1,
        brand,
      },
    ];
  }

  // 1. Fire client-side TikTok Pixel with event_id for deduplication
  window.ttq?.track(event, browserProps, { event_id: eventId });
  if (event === "Purchase") {
    window.ttq?.track("CompletePayment", browserProps, {
      event_id: `${eventId}_cp`,
    });
  }

  // 2. Fire server-side TikTok Events API (/open_api/v1.3/event/track/)
  const ttp = user?.ttp || getCookieValue("_ttp");
  const ttclid = user?.callback || captureTikTokClickId();

  void fetch("/api/tiktok/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      event,
      event_id: eventId,
      timestamp,
      url,
      referrer: document.referrer || undefined,
      properties: {
        value: params.value,
        currency,
        content_id: params.content_id,
        content_type: contentType,
        content_name: params.content_name,
        content_category: params.content_category,
        query: params.query,
        brand,
        url,
      },
      user: {
        email: user?.email || undefined,
        phone_number: user?.phone_number || undefined,
        external_id: user?.external_id || undefined,
        callback: ttclid,
        ttclid,
        ttp,
      },
    }),
  }).catch(() => {});
}
