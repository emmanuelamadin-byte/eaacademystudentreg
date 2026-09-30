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
  | "Purchase";

export interface MetaEventParams {
  value?: number;
  currency?: string;
  content_id?: string;
  content_type?: string;
  content_name?: string;
  content_category?: string;
  query?: string;
  event_id?: string;
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
}
