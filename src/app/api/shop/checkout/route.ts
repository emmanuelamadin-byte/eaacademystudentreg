import { initializeShopCheckout } from "@/server/shop-payments";
import { after } from "next/server";
import { identity, failure } from "@/server/supabase";
import {
  shopJson,
  shopRequestBody,
  shopRequestLimit,
} from "@/server/shop-request";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    await shopRequestLimit(request, "checkout", 6);
    const input = await shopRequestBody(request);
    const token = request.headers.has("authorization")
      ? await identity(request)
      : undefined;
    return shopJson(
      await initializeShopCheckout(input, token, (work) => after(work)),
    );
  } catch (error) {
    return failure(error);
  }
}
