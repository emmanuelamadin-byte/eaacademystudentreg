import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyMetaSignature(payload: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  return equal(expected, signature);
}

export function verifyResendWebhook(
  payload: string,
  headers: Headers,
  now = Date.now(),
) {
  const configured = process.env.RESEND_WEBHOOK_SECRET;
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!configured || !id || !timestamp || !signatures) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > 300)
    return false;
  const encodedSecret = configured.startsWith("whsec_")
    ? configured.slice(6)
    : configured;
  let secret: Buffer;
  try {
    secret = Buffer.from(encodedSecret, "base64");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
  return signatures.split(" ").some((signature) => {
    const [version, value] = signature.split(",");
    return version === "v1" && Boolean(value) && equal(expected, value);
  });
}

export function verifyAutomationSecret(request: Request) {
  const expected = process.env.AUTOMATION_SECRET;
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  return Boolean(expected && supplied && equal(expected, supplied));
}
