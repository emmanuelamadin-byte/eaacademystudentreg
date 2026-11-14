import { z } from "zod";
import { landingPagesEnabled } from "@/lib/commerce-flags";
import { adminClient, failure } from "@/server/supabase";
import { ApiError } from "@/server/policy";
import {
  shopJson,
  shopRequestBody,
  shopRequestLimit,
} from "@/server/shop-request";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!landingPagesEnabled)
      throw new ApiError(404, "Campaign not available.");
    await shopRequestLimit(request, "campaign-event", 60);
    const input = z
      .object({
        campaignId: z.string().uuid(),
        visitId: z.string().uuid(),
        event: z.enum(["visit", "click"]),
      })
      .parse(await shopRequestBody(request));
    const client = adminClient();
    const { data: campaign, error: readError } = await client
      .from("shop_landing_pages")
      .select("item_id")
      .eq("id", input.campaignId)
      .not("published", "is", null)
      .maybeSingle();
    if (readError)
      throw new ApiError(503, "Reporting temporarily unavailable.");
    if (!campaign) throw new ApiError(404, "Campaign not available.");
    const { data: item } = await client
      .from("shop_items")
      .select("published")
      .eq("id", campaign.item_id)
      .maybeSingle();
    if (!item?.published) throw new ApiError(404, "Campaign not available.");
    const { error } = await client
      .from("shop_campaign_events")
      .upsert(
        {
          campaign_id: input.campaignId,
          visit_id: input.visitId,
          event: input.event,
        },
        { onConflict: "campaign_id,visit_id,event", ignoreDuplicates: true },
      );
    if (error) throw new ApiError(503, "Reporting temporarily unavailable.");
    return shopJson({ recorded: true });
  } catch (error) {
    return failure(error);
  }
}
