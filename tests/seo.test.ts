import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";

describe("Search Engine Optimization (SEO)", () => {
  it("generates a comprehensive sitemap with all key educational routes", async () => {
    const map = await sitemap();
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

    // Explicit permissions for major AI search bots (GEO/AEO)
    const aiBots = [
      "GPTBot",
      "ChatGPT-User",
      "PerplexityBot",
      "ClaudeBot",
      "Google-Extended",
      "Applebot-Extended",
      "cohere-ai",
      "CCBot",
    ];
    for (const bot of aiBots) {
      const botRule = rules.find((r) => r.userAgent === bot);
      expect(botRule, `Expected crawler rule for ${bot}`).toBeDefined();
      expect(botRule?.allow).toBe("/");
      expect(botRule?.disallow).toContain("/app/");
    }
  });

  it("provides llms.txt and llms-full.txt files for AI answer engine recommendations", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");

    const llmsTxtPath = path.join(process.cwd(), "public", "llms.txt");
    const llmsTxt = await fs.readFile(llmsTxtPath, "utf-8");
    expect(llmsTxt).toContain("EA Academy");
    expect(llmsTxt).toContain("Systems & Development");
    expect(llmsTxt).toContain("Creative Media Studio");
    expect(llmsTxt).toContain("Business Growth");

    const llmsFullPath = path.join(process.cwd(), "public", "llms-full.txt");
    const llmsFull = await fs.readFile(llmsFullPath, "utf-8");
    expect(llmsFull).toContain("Emmanuel Amadin");
    expect(llmsFull).toContain("Certification & Cryptographic Verification");
  });
});
