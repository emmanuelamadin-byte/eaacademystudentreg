import { ApiError } from "@/server/policy";
import {
  processMessageQueue,
  queueAbandonedCheckoutReminders,
  queueBirthdayMessages,
  queueSubscriptionExpiryReminders,
} from "@/server/communications";
import { failure } from "@/server/supabase";
import { verifyAutomationSecret } from "@/server/webhook-security";
import { retryShopReceipts } from "@/server/shop-payments";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handleAutomation(request: Request) {
  try {
    if (!verifyAutomationSecret(request))
      throw new ApiError(401, "Invalid automation credentials.");
    const birthdays = await queueBirthdayMessages();
    const subscriptionReminders = await queueSubscriptionExpiryReminders();
    const abandonedCheckouts = await queueAbandonedCheckoutReminders();
    const deliveries = await processMessageQueue(50);
    await retryShopReceipts();
    return Response.json(
      { birthdays, subscriptionReminders, abandonedCheckouts, deliveries },
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
