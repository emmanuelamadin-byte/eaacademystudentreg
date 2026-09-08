import { ApiError } from "@/server/policy";
import {
  processMessageQueue,
  queueBirthdayMessages,
} from "@/server/communications";
import { failure } from "@/server/supabase";
import { verifyAutomationSecret } from "@/server/webhook-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!verifyAutomationSecret(request))
      throw new ApiError(401, "Invalid automation credentials.");
    const birthdays = await queueBirthdayMessages();
    const deliveries = await processMessageQueue(50);
    return Response.json(
      { birthdays, deliveries },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
