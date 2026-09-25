import { ApiError } from "@/server/policy";
import {
  processMessageQueue,
  queueBirthdayMessages,
  queueSubscriptionExpiryReminders,
} from "@/server/communications";
import { failure } from "@/server/supabase";
import { verifyAutomationSecret } from "@/server/webhook-security";

export const runtime = "nodejs";

async function handleAutomation(request: Request) {
  try {
    if (!verifyAutomationSecret(request))
      throw new ApiError(401, "Invalid automation credentials.");
    const birthdays = await queueBirthdayMessages();
    const subscriptionReminders = await queueSubscriptionExpiryReminders();
    const deliveries = await processMessageQueue(50);
    return Response.json(
      { birthdays, subscriptionReminders, deliveries },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  return handleAutomation(request);
}

export async function GET(request: Request) {
  return handleAutomation(request);
}

