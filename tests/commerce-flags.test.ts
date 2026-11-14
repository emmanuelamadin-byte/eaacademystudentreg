import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("commerce activation", () => {
  it("enables landing pages and purchase-first checkout without extra hosting settings", async () => {
    vi.stubEnv("NEXT_PUBLIC_PURCHASE_FIRST_ENABLED", undefined);
    vi.stubEnv("NEXT_PUBLIC_LANDING_PAGES_ENABLED", undefined);
    vi.resetModules();
    const flags = await import("../src/lib/commerce-flags");
    expect(flags.purchaseFirstEnabled).toBe(true);
    expect(flags.landingPagesEnabled).toBe(true);
  });
  it("supports explicit disable settings for each feature", async () => {
    vi.stubEnv("NEXT_PUBLIC_PURCHASE_FIRST_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_LANDING_PAGES_ENABLED", "false");
    vi.resetModules();
    const flags = await import("../src/lib/commerce-flags");
    expect(flags.purchaseFirstEnabled).toBe(false);
    expect(flags.landingPagesEnabled).toBe(false);
  });
});
