import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://student.cleanbrandagency.com";

export default function robots(): MetadataRoute.Robots {
  const commonDisallows = ["/app/", "/api/"];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: commonDisallows,
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: commonDisallows,
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: commonDisallows,
      },
      // AI Crawlers and Search Engines (ChatGPT, Perplexity, Claude, Gemini, Copilot)
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: commonDisallows,
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: commonDisallows,
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: commonDisallows,
      },
      {
        userAgent: "ClaudeBot",
        allow: "/",
        disallow: commonDisallows,
      },
      {
        userAgent: "anthropic-ai",
        allow: "/",
        disallow: commonDisallows,
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: commonDisallows,
      },
      {
        userAgent: "Applebot-Extended",
        allow: "/",
        disallow: commonDisallows,
      },
      {
        userAgent: "cohere-ai",
        allow: "/",
        disallow: commonDisallows,
      },
      {
        userAgent: "CCBot",
        allow: "/",
        disallow: commonDisallows,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
