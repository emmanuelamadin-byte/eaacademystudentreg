"use client";
import { useEffect } from "react";
import {
  campaignCheckoutUrl,
  recordCampaignEvent,
} from "@/lib/campaign-tracking";
import { purchaseFirstEnabled } from "@/lib/commerce-flags";
import { trackTikTokEvent } from "@/lib/tiktok";

export function CampaignVisit({
  campaignId,
  itemId,
  title,
  price,
}: {
  campaignId: string;
  itemId: string;
  title: string;
  price: number;
}) {
  useEffect(() => {
    recordCampaignEvent(campaignId, "visit");
    trackTikTokEvent("ViewContent", {
      value: price,
      currency: "NGN",
      content_id: itemId,
      content_name: title,
      content_type: "product",
    });
  }, [campaignId, itemId, title, price]);
  return null;
}
export function CampaignBuyButton({
  campaignId,
  itemId,
  label,
  preview = false,
}: {
  campaignId?: string;
  itemId: string;
  label: string;
  preview?: boolean;
}) {
  if (preview)
    return (
      <button type="button" className="offer-button" disabled>
        {label} <span aria-hidden="true">↗</span>
      </button>
    );
  return (
    <a
      className="offer-button"
      href={`/checkout/${encodeURIComponent(itemId)}`}
      aria-disabled={!purchaseFirstEnabled}
      onClick={(event) => {
        if (!purchaseFirstEnabled) {
          event.preventDefault();
          return;
        }
        if (campaignId) recordCampaignEvent(campaignId, "click");
        event.currentTarget.href = campaignCheckoutUrl(itemId, campaignId);
      }}
    >
      {label} <span aria-hidden="true">↗</span>
    </a>
  );
}
