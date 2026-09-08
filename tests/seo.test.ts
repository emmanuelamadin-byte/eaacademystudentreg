import { describe, expect, it } from "vitest";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";

describe("Search Engine Optimization (SEO)", () => {
  it("generates a comprehensive sitemap with all key educational routes", () => {
    const map = sitemap();
    expect(map.length).toBeGreaterThanOrEqual(8);

    const urls = map.map((entry) => entry.url);
    expect(urls.some((u) => u.endsWith("/") || u.match(/cleanbrandagency\.com$/))).toBe(true);
    expect(urls.some((u) => u.includes("/tracks"))).toBe(true);
    expect(urls.some((u) => u.includes("/pricing"))).toBe(true);
    expect(urls.some((u) => u.includes("/donate"))).toBe(true);
    expect(urls.some((u) => u.includes("/signup"))).toBe(true);
    expect(urls.some((u) => u.includes("/login"))).toBe(true);

    for (const entry of map) {
      expect(entry.url).toMatch(/^https?:\/\//);
      expect(entry.lastModified).toBeInstanceOf(Date);
      expect(entry.priority).toBeGreaterThanOrEqual(0.1);
      expect(entry.priority).toBeLessThanOrEqual(1.0);
    }
  });

  it("generates robots.txt rules that allow public crawlers and protect private workspace", () => {
    const config = robots();
    expect(config.sitemap).toMatch(/sitemap\.xml$/);

    const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
    expect(rules.length).toBeGreaterThan(0);

    const generalRule = rules.find((r) => r.userAgent === "*");
    expect(generalRule).toBeDefined();
    expect(generalRule?.allow).toBe("/");
    expect(generalRule?.disallow).toContain("/app/");
    expect(generalRule?.disallow).toContain("/api/");
  });
});
