import "server-only";
import { createHash } from "node:crypto";
import { adminClient } from "./supabase";
import { ApiError } from "./policy";
import { readLimitedBody } from "./request-body";

export async function shopRequestLimit(
  request: Request,
  action: string,
  maximum = 12,
) {
  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const digest = createHash("sha256").update(address).digest("hex");
  const { data, error } = await adminClient().rpc(
    "consume_shop_request_limit",
    {
      p_key: `${action}:${digest}`,
      p_maximum: maximum,
      p_seconds: 60,
    },
  );
  if (error)
    throw new ApiError(
      503,
      "Checkout is temporarily unavailable. Please try again shortly.",
    );
  if (!data)
    throw new ApiError(
      429,
      "Too many attempts. Please wait a minute and try again.",
    );
}
export async function shopRequestBody(
  request: Request,
  maximum = 12000,
): Promise<unknown> {
  // Same-origin browser writes only. Server webhooks use their signature route.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, "Open checkout on the EA Academy website.");
  const raw = await readLimitedBody(request, maximum);
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new ApiError(400, "Send a valid request.");
  }
}
export function shopJson(data: unknown) {
  return Response.json(
    { data },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
