import { ApiError } from "@/server/policy";
import { updateDeliveryStatus } from "@/server/communications";
import { failure } from "@/server/supabase";
import { readLimitedBody } from "@/server/request-body";
import { verifyMetaSignature } from "@/server/webhook-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (
    mode === "subscribe" &&
    token &&
    token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
    challenge
  )
    return new Response(challenge, { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  try {
    const payload = new TextDecoder().decode(
      await readLimitedBody(request, 500000),
    );
    if (
      !verifyMetaSignature(payload, request.headers.get("x-hub-signature-256"))
    )
      throw new ApiError(401, "Invalid WhatsApp webhook signature.");
    const body = JSON.parse(payload) as {
      entry?: {
        changes?: {
          value?: {
            statuses?: { id?: string; status?: string }[];
          };
        }[];
      }[];
    };
    for (const entry of body.entry || [])
      for (const change of entry.changes || [])
        for (const status of change.value?.statuses || [])
          if (
            status.id &&
            ["sent", "delivered", "read", "failed"].includes(
              status.status || "",
            )
          )
            await updateDeliveryStatus(
              status.id,
              status.status as "sent" | "delivered" | "read" | "failed",
            );
    return Response.json({ received: true });
  } catch (error) {
    return failure(error);
  }
}
