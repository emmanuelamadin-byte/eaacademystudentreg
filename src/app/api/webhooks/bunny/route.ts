import { ApiError } from "@/server/policy";
import { failure } from "@/server/supabase";
import { readLimitedBody } from "@/server/request-body";
import { verifyBunnyWebhook } from "@/server/webhook-security";
import { processBunnyWebhook, type BunnyWebhookPayload } from "@/server/bunny";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const raw = new TextDecoder().decode(
      await readLimitedBody(request, 500000),
    );

    let payload: BunnyWebhookPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "Send valid JSON for Bunny webhook.");
    }

    if (!verifyBunnyWebhook(request, payload)) {
      throw new ApiError(401, "Invalid Bunny webhook authorization.");
    }

    const result = await processBunnyWebhook(payload);

    return Response.json(result);
  } catch (error) {
    return failure(error);
  }
}
