import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminClient, db, limit } from "./supabase";
import { ApiError, requireAdmin } from "./policy";
import { getPublicShopItem } from "./academy";
import { cleanBunnyUrl, signBunnyEmbedUrl } from "./bunny";
import {
  landingPagesEnabled,
  purchaseFirstEnabled,
} from "@/lib/commerce-flags";
import {
  landingDocumentSchema,
  validateLandingPublication,
  type LandingPageRecord,
  type CampaignMetrics,
} from "@/lib/landing-pages";
import type { AcademyUser, ShopItem } from "@/lib/types";
import { generateLandingCopy } from "./ai";

function enabled() {
  if (!landingPagesEnabled)
    throw new ApiError(404, "Landing pages are not enabled yet.");
}
function databaseError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "23505")
    throw new ApiError(409, "This campaign link is already in use.");
  console.error("Landing pages:", error.message);
  throw new ApiError(
    503,
    "Landing pages could not be loaded. Check the commerce database migration.",
  );
}
export async function getPublicLandingPage(slug: string) {
  enabled();
  const { data, error } = await adminClient()
    .from("shop_landing_pages")
    .select("id,item_id,slug,published,published_at")
    .eq("slug", slug)
    .not("published", "is", null)
    .maybeSingle();
  databaseError(error);
  if (!data) throw new ApiError(404, "This offer is not available.");
  const item = await db().collection("shopItems").doc(data.item_id).get();
  if (!item.exists || !item.data()?.published)
    throw new ApiError(404, "This offer is not available.");
  const safeItem = await getPublicShopItem(String(item.data()!.slug));
  const document = landingDocumentSchema.parse(data.published);
  document.sections = document.sections.map((s) => ({
    ...s,
    videoUrl: s.videoUrl ? signBunnyEmbedUrl(s.videoUrl) : "",
  }));
  return {
    id: String(data.id),
    slug: String(data.slug),
    document,
    item: safeItem,
  };
}

export async function landingAdmin(
  user: AcademyUser,
  action: string,
  payload: Record<string, unknown>,
) {
  requireAdmin(user);
  enabled();
  const table = adminClient().from("shop_landing_pages");
  if (action === "landing.admin.list") {
    const itemId = z.string().min(1).max(160).parse(payload.itemId);
    const { data, error } = await table
      .select("*")
      .eq("item_id", itemId)
      .order("updated_at", { ascending: false });
    databaseError(error);
    return data as LandingPageRecord[];
  }
  if (action === "landing.admin.save") {
    const input = z
      .object({
        id: z.string().uuid().optional(),
        itemId: z.string().min(1).max(160),
        name: z.string().trim().min(1).max(150),
        slug: z
          .string()
          .min(2)
          .max(120)
          .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
        document: landingDocumentSchema,
        version: z.number().int().positive().optional(),
      })
      .parse(payload);
    const product = await db().collection("shopItems").doc(input.itemId).get();
    if (!product.exists)
      throw new ApiError(
        404,
        "Save the product before creating a landing page.",
      );
    input.document.sections = input.document.sections.map((s) => ({
      ...s,
      videoUrl: s.videoUrl ? cleanBunnyUrl(s.videoUrl) : "",
    }));
    if (!input.id) {
      const { data, error } = await table
        .insert({
          id: randomUUID(),
          item_id: input.itemId,
          name: input.name,
          slug: input.slug,
          draft: input.document,
        })
        .select("*")
        .single();
      databaseError(error);
      return data;
    }
    const { data: before, error: readError } = await table
      .select("*")
      .eq("id", input.id)
      .single();
    databaseError(readError);
    if (before.item_id !== input.itemId)
      throw new ApiError(400, "A campaign cannot be moved to another product.");
    if (before.published_at && before.slug !== input.slug)
      throw new ApiError(
        400,
        "Keep the original link for a previously published campaign. Duplicate it to use a new link.",
      );
    const { data, error } = await table
      .update({
        name: input.name,
        slug: input.slug,
        draft: input.document,
        version: before.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("version", input.version || 0)
      .select("*")
      .maybeSingle();
    databaseError(error);
    if (!data)
      throw new ApiError(
        409,
        "This page changed in another tab. Reload before saving.",
      );
    return data;
  }
  const id = z.string().uuid().parse(payload.id);
  const { data: page, error } = await table.select("*").eq("id", id).single();
  databaseError(error);
  if (!page) throw new ApiError(404, "Campaign not found.");
  if (action === "landing.admin.metrics") return campaignMetrics(id);
  if (action === "landing.admin.generate") {
    await limit(user.id, "landing-ai", 5);
    const product = await db().collection("shopItems").doc(page.item_id).get();
    if (!product.exists) throw new ApiError(404, "Product not found.");
    return generateLandingCopy(product.data() as ShopItem, payload);
  }
  if (!["landing.admin.publish", "landing.admin.unpublish"].includes(action))
    throw new ApiError(400, "Unknown landing-page action.");
  const publish = action === "landing.admin.publish";
  if (publish) {
    if (!purchaseFirstEnabled)
      throw new ApiError(
        503,
        "Enable purchase-first checkout before publishing a campaign.",
      );
    try {
      validateLandingPublication(landingDocumentSchema.parse(page.draft));
    } catch (cause) {
      throw new ApiError(
        400,
        cause instanceof Error
          ? cause.message
          : "Complete the page before publishing.",
      );
    }
    const product = await db().collection("shopItems").doc(page.item_id).get();
    if (!product.data()?.published)
      throw new ApiError(
        400,
        "Publish the store product before publishing its landing page.",
      );
  }
  const version = z.number().int().positive().parse(payload.version);
  const { data, error: updateError } = await table
    .update({
      published: publish ? page.draft : null,
      ...(publish ? { published_at: new Date().toISOString() } : {}),
      version: version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("version", version)
    .select("*")
    .maybeSingle();
  databaseError(updateError);
  if (!data)
    throw new ApiError(409, "This page changed. Reload before publishing.");
  return data;
}

async function campaignMetrics(id: string): Promise<CampaignMetrics> {
  const client = adminClient();
  const count = async (event: string) => {
    const { count, error } = await client
      .from("shop_campaign_events")
      .select("visit_id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("event", event);
    databaseError(error);
    return count || 0;
  };
  // Aggregate in SQL so reporting does not silently stop at PostgREST's row cap.
  const [visits, clicks, totals] = await Promise.all([
    count("visit"),
    count("click"),
    client.rpc("shop_campaign_totals", { p_campaign_id: id }),
  ]);
  databaseError(totals.error);
  const summary = totals.data as Omit<CampaignMetrics, "visits" | "clicks">;
  return { visits, clicks, ...summary };
}
