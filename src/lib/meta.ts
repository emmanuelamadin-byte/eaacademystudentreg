"use client";

export type MetaStandardEventName =
  | "PageView"
  | "ViewContent"
  | "AddToWishlist"
  | "Search"
  | "AddPaymentInfo"
  | "AddToCart"
  | "InitiateCheckout"
  | "CompleteRegistration"
  | "Purchase"
  | "Subscribe";

export interface MetaEventParams {
  value?: number;
  currency?: string;
  content_id?: string;
  content_type?: string;
  content_name?: string;
  content_category?: string;
  query?: string;
  event_id?: string;
  user_id?: string;
}

export interface MetaUserParams {
  email?: string | null;
  phone_number?: string | null;
  external_id?: string | null;
}

declare global {
  interface Window {
    fbq?: (
      command: "init" | "track" | "trackCustom",
      eventNameOrPixelId: string,
      params?: Record<string, unknown>,
      options?: { eventID?: string },
    ) => void;
    _fbq?: unknown;
  }
}

export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID || "1416629140565273";

const PREMIUM_TRACKED_STORAGE_PREFIX = "ea_meta_premium_tracked_";

export function markPremiumTrackedInBrowser(userId?: string | null, ref?: string) {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(
      `${PREMIUM_TRACKED_STORAGE_PREFIX}${userId}`,
      ref || new Date().toISOString(),
    );
  } catch {
    // Ignore storage errors in private browsing
  }
}

export function hasPremiumBeenTrackedInBrowser(userId?: string | null): boolean {
  if (typeof window === "undefined" || !userId) return false;
  try {
    return Boolean(
      localStorage.getItem(`${PREMIUM_TRACKED_STORAGE_PREFIX}${userId}`),
    );
  } catch {
    return false;
  }
}

export function identifyMetaUser(user?: MetaUserParams | null) {
  if (typeof window === "undefined" || typeof window.fbq !== "function" || !user) {
    return;
  }
  const advancedMatching: Record<string, string> = {};
  if (user.email?.trim()) {
    advancedMatching.em = user.email.trim().toLowerCase();
  }
  if (user.phone_number?.trim()) {
    const digits = user.phone_number.trim().replace(/[^\d]/g, "");
    if (digits) {
      advancedMatching.ph =
        digits.startsWith("0") && digits.length === 11
          ? `234${digits.slice(1)}`
          : digits;
    }
  }
  if (user.external_id?.trim()) {
    advancedMatching.external_id = user.external_id.trim();
  }
  if (Object.keys(advancedMatching).length > 0) {
    window.fbq("init", META_PIXEL_ID, advancedMatching);
  }
}

export function trackMetaEvent(
  event: MetaStandardEventName | "PlaceAnOrder",
  params: MetaEventParams = {},
) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") {
    return;
  }

  const currency = params.currency || "NGN";
  const contentType = params.content_type || "product";

  const payload: Record<string, unknown> = {
    currency,
    content_type: contentType,
  };

  if (typeof params.value === "number" && Number.isFinite(params.value)) {
    payload.value = params.value;
  }
  if (params.content_id) {
    payload.content_ids = [params.content_id];
  }
  if (params.content_name) {
    payload.content_name = params.content_name;
  }
  if (params.content_category) {
    payload.content_category = params.content_category;
  }
  if (params.query) {
    payload.search_string = params.query;
  }
  if (params.content_id || params.content_name) {
    payload.contents = [
      {
        id: params.content_id || "ea-academy",
        quantity: 1,
        ...(typeof params.value === "number"
          ? { item_price: params.value }
          : {}),
      },
    ];
  }

  const options = params.event_id ? { eventID: params.event_id } : undefined;

  if (event === "PlaceAnOrder") {
    window.fbq("trackCustom", "PlaceAnOrder", payload, options);
    return;
  }

  window.fbq("track", event, payload, options);

  // When a user completes a Premium upgrade Purchase, also fire Meta's standard Subscribe event
  // and record it in localStorage so browser fallback doesn't duplicate it.
  if (event === "Purchase" && params.content_id === "ea-academy-premium") {
    const subOptions = params.event_id
      ? { eventID: `${params.event_id}_sub` }
      : undefined;
    window.fbq(
      "track",
      "Subscribe",
      {
        value: typeof params.value === "number" ? params.value : 3000,
        currency,
        predicted_ltv: typeof params.value === "number" ? params.value : 3000,
        content_name: params.content_name || "EA Academy Premium Membership",
        content_ids: ["ea-academy-premium"],
      },
      subOptions,
    );
    if (params.user_id) {
      markPremiumTrackedInBrowser(params.user_id, params.event_id);
    }
  }
}
