"use client";
import { accessToken } from "./api";

type Attribution = { visitId: string; utm: Record<string, string> };
const utmKeys = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
];
const memory = new Map<string, Attribution>();
export function campaignAttribution(campaignId: string): Attribution {
  const key = `ea-campaign:${campaignId}`;
  let value = memory.get(key);
  try {
    const saved = sessionStorage.getItem(key);
    if (!value && saved) value = JSON.parse(saved);
  } catch {
    /* Storage can be unavailable in private browsers. */
  }
  if (!value?.visitId || !/^[0-9a-f-]{36}$/i.test(value.visitId))
    value = { visitId: crypto.randomUUID(), utm: {} };
  const params = new URLSearchParams(location.search);
  const incoming: Record<string, string> = {};
  for (const name of utmKeys)
    if (params.get(name)) incoming[name] = params.get(name)!.slice(0, 150);
  // Explicit campaign parameters start a new attribution; direct returns keep it.
  if (Object.keys(incoming).length) value.utm = incoming;
  memory.set(key, value);
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* In-memory fallback above. */
  }
  return value;
}
export function recordCampaignEvent(
  campaignId: string,
  event: "visit" | "click",
) {
  const { visitId } = campaignAttribution(campaignId);
  void fetch("/api/shop/campaign-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId, visitId, event }),
    keepalive: true,
  }).catch(() => {});
}
export function campaignCheckoutUrl(itemId: string, campaignId?: string) {
  const params = new URLSearchParams();
  if (campaignId) {
    const { visitId, utm } = campaignAttribution(campaignId);
    params.set("campaign", campaignId);
    params.set("visit", visitId);
    for (const [key, value] of Object.entries(utm)) params.set(key, value);
  }
  return `/checkout/${encodeURIComponent(itemId)}${params.size ? `?${params}` : ""}`;
}
export async function shopApi<T>(path: string, body: unknown): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`/api/shop/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response
    .json()
    .catch(() => ({ error: "The server did not respond. Please try again." }));
  if (!response.ok)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "This step could not be completed.",
    );
  return result.data;
}
