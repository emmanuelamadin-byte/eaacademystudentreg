import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  verifyAutomationSecret,
  verifyMetaSignature,
  verifyResendWebhook,
} from "../src/server/webhook-security";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("communication webhook security", () => {
  it("verifies Meta payload signatures and rejects changed payloads", () => {
    process.env.WHATSAPP_APP_SECRET = "meta-secret";
    const payload = '{"entry":[]}';
    const signature = `sha256=${createHmac("sha256", "meta-secret").update(payload).digest("hex")}`;
    expect(verifyMetaSignature(payload, signature)).toBe(true);
    expect(verifyMetaSignature(`${payload}x`, signature)).toBe(false);
  });

  it("verifies current Resend webhook signatures and timestamp freshness", () => {
    const secret = Buffer.from("resend-secret");
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${secret.toString("base64")}`;
    const payload = '{"type":"email.delivered"}';
    const timestamp = "1770000000";
    const id = "msg_test";
    const signature = createHmac("sha256", secret)
      .update(`${id}.${timestamp}.${payload}`)
      .digest("base64");
    const headers = new Headers({
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    });
    expect(
      verifyResendWebhook(payload, headers, Number(timestamp) * 1000),
    ).toBe(true);
    expect(
      verifyResendWebhook(payload, headers, Number(timestamp) * 1000 + 301000),
    ).toBe(false);
  });

  it("requires the exact automation bearer secret", () => {
    process.env.AUTOMATION_SECRET = "scheduled-secret";
    expect(
      verifyAutomationSecret(
        new Request("https://example.com", {
          headers: { authorization: "Bearer scheduled-secret" },
        }),
      ),
    ).toBe(true);
    expect(
      verifyAutomationSecret(
        new Request("https://example.com", {
          headers: { authorization: "Bearer wrong" },
        }),
      ),
    ).toBe(false);
  });
});
