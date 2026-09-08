import { failure } from "@/server/supabase";
import { readLimitedBody } from "@/server/request-body";
import { webhook } from "@/server/payments";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const raw = new TextDecoder().decode(
      await readLimitedBody(request, 500000),
    );
    return Response.json(
      await webhook(raw, request.headers.get("x-paystack-signature")),
    );
  } catch (error) {
    return failure(error);
  }
}
