import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthToken } from "../src/server/supabase";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  paystack: vi.fn(),
  item: {
    published: true,
    price: 7500,
    title: "Photo guide",
    type: "digital_product",
    slug: "photo-guide",
  } as Record<string, unknown>,
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/commerce-flags", () => ({
  purchaseFirstEnabled: true,
  landingPagesEnabled: true,
}));
vi.mock("../src/server/supabase", () => ({
  adminClient: () => ({ rpc: state.rpc, from: state.from }),
  db: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ data: () => state.item, exists: true }),
      }),
    }),
  }),
}));
vi.mock("../src/server/payments", () => ({ paystack: state.paystack }));
vi.mock("../src/server/communications", () => ({
  sendShopPurchaseConfirmationEmail: vi.fn().mockResolvedValue({ sent: true }),
}));
vi.mock("../src/server/tiktok", () => ({
  sendTikTokServerEvent: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("../src/server/meta", () => ({
  sendMetaServerEvent: vi.fn().mockResolvedValue({ ok: true }),
}));
import {
  applyShopPayment,
  claimPaidShopPurchases,
  initializeShopCheckout,
  isVerifiedGoogle,
  getShopPaymentStatus,
} from "../src/server/shop-payments";
import { shopRequestLimit, shopRequestBody } from "../src/server/shop-request";
const token: AuthToken = {
  uid: "buyer",
  sub: "buyer",
  email: "buyer@gmail.com",
  provider: "google",
  email_verified: true,
};
const reference = "ea_12345678901234567890123456789012";
function query(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const key of ["select", "eq", "update"]) chain[key] = () => chain;
  chain.single = async () => ({ data: result, error: null });
  chain.maybeSingle = async () => ({ data: result, error: null });
  return chain;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://academy.test");
  vi.stubEnv("SHOP_CHECKOUT_PAUSED", "false");
  state.item = {
    published: true,
    price: 7500,
    title: "Photo guide",
    type: "digital_product",
    slug: "photo-guide",
  };
  state.rpc.mockResolvedValue({ data: 1, error: null });
});
describe("guest shop checkout", () => {
  it("requires renewed review when the price changes before payment", async () => {
    await expect(
      initializeShopCheckout({
        itemId: "photo-guide",
        expectedPrice: 5000,
        name: "Buyer",
        email: "buyer@gmail.com",
      }),
    ).rejects.toThrow(/price changed/);
    expect(state.paystack).not.toHaveBeenCalled();
  });
  it("fails closed when the durable limiter is unavailable and hashes addresses", async () => {
    const request = new Request("https://academy.test/api/shop/checkout", {
      headers: { "x-forwarded-for": "203.0.113.40" },
    });
    state.rpc.mockResolvedValue({ data: false, error: null });
    await expect(shopRequestLimit(request, "checkout", 6)).rejects.toThrow(
      /Too many/,
    );
    expect(state.rpc).toHaveBeenCalledWith(
      "consume_shop_request_limit",
      expect.objectContaining({
        p_key: expect.stringMatching(/^checkout:[a-f0-9]{64}$/),
      }),
    );
    state.rpc.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });
    await expect(shopRequestLimit(request, "checkout", 6)).rejects.toThrow(
      /temporarily unavailable/,
    );
    await expect(
      shopRequestBody(
        new Request("https://academy.test/api/shop/checkout", {
          method: "POST",
          headers: { Origin: "https://another-site.test" },
          body: "{}",
        }),
      ),
    ).rejects.toThrow(/EA Academy website/);
  });
  it("pauses new checkout while preserving confirmed-payment recovery without disclosing buyer data", async () => {
    vi.stubEnv("SHOP_CHECKOUT_PAUSED", "true");
    await expect(
      initializeShopCheckout({
        itemId: "photo-guide",
        expectedPrice: 7500,
        name: "Buyer",
        email: "buyer@gmail.com",
      }),
    ).rejects.toThrow(/temporarily unavailable/);
    state.from.mockReturnValue(
      query({
        reference,
        status: "success",
        item_id: "photo-guide",
        item_title: "Photo guide",
        item_type: "digital_product",
        email: "private@gmail.com",
        student_id: "private-user",
      }),
    );
    state.rpc.mockResolvedValue({ data: false, error: null });
    const result = await getShopPaymentStatus(reference);
    expect(result).toEqual({
      reference,
      status: "success",
      itemId: "photo-guide",
      itemTitle: "Photo guide",
      itemType: "digital_product",
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(state.paystack).not.toHaveBeenCalled();
  });
  it("uses the store amount and records an email-bound intent before initializing Paystack", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    state.from.mockReturnValue({
      insert,
      update: () => ({ eq: async () => ({ error: null }) }),
    });
    state.paystack.mockResolvedValue({
      authorization_url: "https://checkout.paystack.com/example",
    });
    await initializeShopCheckout({
      itemId: "photo-guide",
      expectedPrice: 7500,
      name: "Buyer",
      email: "Buyer@gmail.com",
      amount: 1,
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: null,
        email: "buyer@gmail.com",
        amount_kobo: 750000,
        guest: true,
      }),
    );
    expect(state.paystack).toHaveBeenCalledWith(
      "/transaction/initialize",
      "POST",
      expect.objectContaining({
        amount: 750000,
        email: "buyer@gmail.com",
        callback_url: expect.stringContaining(
          "/checkout/complete?reference=ea_",
        ),
      }),
    );
    expect(insert.mock.invocationCallOrder[0]).toBeLessThan(
      state.paystack.mock.invocationCallOrder[0],
    );
  });
  it("lets the route defer ad tracking until after the checkout response", async () => {
    const { sendTikTokServerEvent } = await import("../src/server/tiktok");
    const insert = vi.fn().mockResolvedValue({ error: null });
    state.from.mockReturnValue({
      insert,
      update: () => ({ eq: async () => ({ error: null }) }),
    });
    state.paystack.mockResolvedValue({
      authorization_url: "https://checkout.paystack.com/example",
    });
    const jobs: Array<() => Promise<void>> = [];
    const result = await initializeShopCheckout(
      {
        itemId: "photo-guide",
        expectedPrice: 7500,
        name: "Buyer",
        email: "buyer@gmail.com",
      },
      undefined,
      (job) => jobs.push(job),
    );
    expect(result.authorizationUrl).toBe(
      "https://checkout.paystack.com/example",
    );
    expect(sendTikTokServerEvent).not.toHaveBeenCalled();
    await jobs[0]();
    expect(sendTikTokServerEvent).toHaveBeenCalledOnce();
  });
  it("rejects unpublished products and authenticated email substitution", async () => {
    state.item.published = false;
    await expect(
      initializeShopCheckout({
        itemId: "photo-guide",
        expectedPrice: 7500,
        name: "Buyer",
        email: "buyer@gmail.com",
      }),
    ).rejects.toThrow(/not available/);
    state.item.published = true;
    await expect(
      initializeShopCheckout(
        {
          itemId: "photo-guide",
          expectedPrice: 7500,
          name: "Buyer",
          email: "someone@gmail.com",
        },
        token,
      ),
    ).rejects.toThrow(/signed-in Google email/);
    expect(state.paystack).not.toHaveBeenCalled();
  });
  it("does not bind or claim a purchase using an unverified identity or only a reference", async () => {
    expect(isVerifiedGoogle({ ...token, email_verified: false })).toBe(false);
    await expect(
      claimPaidShopPurchases({ ...token, provider: "email" }, reference),
    ).rejects.toThrow(/verified Google/);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("requires the matching paid email and leaves ownership unchanged for another account", async () => {
    state.from.mockReturnValue(
      query({ email: "other@gmail.com", status: "success", student_id: null }),
    );
    await expect(claimPaidShopPurchases(token, reference)).rejects.toThrow(
      /different Google email/,
    );
    expect(state.rpc).not.toHaveBeenCalled();
    state.from.mockReturnValue(
      query({ email: "BUYER@gmail.com", status: "success", student_id: null }),
    );
    await expect(claimPaidShopPurchases(token, reference)).resolves.toEqual({
      claimed: 1,
    });
    expect(state.rpc).toHaveBeenCalledWith(
      "claim_shop_purchases",
      expect.objectContaining({
        p_user_id: "buyer",
        p_email: "buyer@gmail.com",
      }),
    );
  });
  it("uses atomic fulfillment and does not emit purchase events again on replay", async () => {
    const { sendMetaServerEvent } = await import("../src/server/meta");
    state.from.mockReturnValue(
      query({
        email: "buyer@gmail.com",
        item_id: "photo-guide",
        item_title: "Photo guide",
        student_id: null,
      }),
    );
    state.rpc.mockResolvedValue({ data: false, error: null });
    await applyShopPayment({
      reference,
      status: "success",
      amount: 750000,
      currency: "NGN",
      paid_at: "2026-11-14T08:00:00Z",
      customer: { email: "buyer@gmail.com", customer_code: "CUS_example" },
    });
    expect(state.rpc).toHaveBeenCalledWith(
      "fulfill_shop_payment",
      expect.objectContaining({ p_reference: reference, p_amount: 750000 }),
    );
    expect(sendMetaServerEvent).not.toHaveBeenCalled();
  });
});
