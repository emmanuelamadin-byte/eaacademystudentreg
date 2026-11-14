import { z } from "zod";
import { claimPaidShopPurchases } from "@/server/shop-payments";
import { identity, failure } from "@/server/supabase";
import {
  shopJson,
  shopRequestBody,
  shopRequestLimit,
} from "@/server/shop-request";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const token = await identity(request);
    await shopRequestLimit(request, "claim", 20);
    const { reference } = z
      .object({ reference: z.string().max(120).optional() })
      .parse(await shopRequestBody(request));
    return shopJson(await claimPaidShopPurchases(token, reference));
  } catch (error) {
    return failure(error);
  }
}
