import type { MetadataRoute } from "next";
import { listPublicShopItems } from "@/server/academy";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://student.cleanbrandagency.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const routes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/tracks`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/shop`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/donate`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/signup`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/login`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
  ];

  try {
    const shopItems = await listPublicShopItems();
    for (const item of shopItems) {
      if (item?.slug && item.published !== false) {
        routes.push({
          url: `${SITE_URL}/shop/${item.slug}`,
          lastModified: item.updatedAt ? new Date(item.updatedAt) : lastModified,
          changeFrequency: "weekly" as const,
          priority: 0.85,
        });
      }
    }
  } catch {
    // Graceful fallback for database edge cases
  }

  return routes;
}
