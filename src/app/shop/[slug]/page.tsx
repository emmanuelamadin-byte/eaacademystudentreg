import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicShopItem } from "@/server/academy";
import { ShopProductDetailPage } from "@/features/shop-public";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const item = await getPublicShopItem(slug);
    return {
      title: `${item.title} | EA Academy Shop`,
      description: item.subtitle || item.description?.slice(0, 160),
      openGraph: {
        title: item.title,
        description: item.subtitle,
        images: item.thumbnailUrl ? [item.thumbnailUrl] : [],
      },
    };
  } catch {
    return {
      title: "Product Not Found | EA Academy Shop",
    };
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const item = await getPublicShopItem(slug);
    return <ShopProductDetailPage item={item} />;
  } catch {
    notFound();
  }
}
