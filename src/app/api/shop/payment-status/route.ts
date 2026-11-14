import { z } from "zod";
import { after } from "next/server";
import { getShopPaymentStatus } from "@/server/shop-payments";
import { failure } from "@/server/supabase";
import {
  shopJson,
  shopRequestBody,
  shopRequestLimit,
} from "@/server/shop-request";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    await shopRequestLimit(request, "payment-status", 24);
    const { reference } = z
      .object({ reference: z.string().max(120) })
      .parse(await shopRequestBody(request));
    return shopJson(
      await getShopPaymentStatus(reference, (work) => after(work)),
    );
  } catch (error) {
    return failure(error);
  }
}
