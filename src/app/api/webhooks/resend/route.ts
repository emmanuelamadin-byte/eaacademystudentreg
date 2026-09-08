import { ApiError } from "@/server/policy";
import { updateDeliveryStatus } from "@/server/communications";
import { failure } from "@/server/supabase";
import { readLimitedBody } from "@/server/request-body";
import { verifyResendWebhook } from "@/server/webhook-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = new TextDecoder().decode(
      await readLimitedBody(request, 500000),
    );
    if (!verifyResendWebhook(payload, request.headers))
      throw new ApiError(401, "Invalid Resend webhook signature.");
    const event = JSON.parse(payload) as {
      type?: string;
      data?: { email_id?: string };
    };
    const providerId = event.data?.email_id;
    const statuses: Record<string, "sent" | "delivered" | "read" | "failed"> = {
      "email.sent": "sent",
      "email.delivered": "delivered",
      "email.bounced": "failed",
      "email.complained": "failed",
      "email.delivery_delayed": "failed",
    };
    const status = event.type ? statuses[event.type] : undefined;
    if (providerId && status) await updateDeliveryStatus(providerId, status);
    return Response.json({ received: true });
  } catch (error) {
    return failure(error);
  }
}
