import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  verifyAutomationSecret,
  verifyBunnyWebhook,
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

  it("verifies Bunny Stream webhook authorization via secret header, query param, and library ID", () => {
    // 1. With secret configured
    process.env.BUNNY_STREAM_WEBHOOK_SECRET = "bunny-secret-xyz";
    process.env.BUNNY_STREAM_LIBRARY_ID = "123456";

    // Valid with x-bunny-secret header
    const reqWithHeader = new Request("https://example.com/api/webhooks/bunny", {
      headers: { "x-bunny-secret": "bunny-secret-xyz" },
    });
    expect(verifyBunnyWebhook(reqWithHeader, { VideoLibraryId: "123456" })).toBe(true);

    // Valid with ?secret= query parameter
    const reqWithQuery = new Request(
      "https://example.com/api/webhooks/bunny?secret=bunny-secret-xyz",
    );
    expect(verifyBunnyWebhook(reqWithQuery, { VideoLibraryId: "123456" })).toBe(true);

    // Invalid when secret doesn't match
    const reqWrongSecret = new Request("https://example.com/api/webhooks/bunny", {
      headers: { "x-bunny-secret": "wrong-secret" },
    });
    expect(verifyBunnyWebhook(reqWrongSecret, { VideoLibraryId: "123456" })).toBe(false);

    // Invalid when secret header or param is missing
    const reqNoSecret = new Request("https://example.com/api/webhooks/bunny");
    expect(verifyBunnyWebhook(reqNoSecret, { VideoLibraryId: "123456" })).toBe(false);

    // Invalid when library ID does not match
    expect(verifyBunnyWebhook(reqWithHeader, { VideoLibraryId: "999999" })).toBe(false);

    // 2. When no secret is configured, allows matching library ID
    delete process.env.BUNNY_STREAM_WEBHOOK_SECRET;
    expect(verifyBunnyWebhook(new Request("https://example.com/api/webhooks/bunny"), { VideoLibraryId: "123456" })).toBe(true);
    expect(verifyBunnyWebhook(new Request("https://example.com/api/webhooks/bunny"), { VideoLibraryId: "wrong-lib" })).toBe(false);
    expect(verifyBunnyWebhook(new Request("https://example.com/api/webhooks/bunny"), {})).toBe(false);

    // 3. Fail closed if neither secret nor library ID is configured
    delete process.env.BUNNY_STREAM_LIBRARY_ID;
    expect(verifyBunnyWebhook(new Request("https://example.com/api/webhooks/bunny"), { VideoLibraryId: "123456" })).toBe(false);
  });
});

