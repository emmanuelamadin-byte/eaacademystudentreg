import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/supabase";
import { getPublicShopItem } from "@/server/academy";
import { purchaseFirstEnabled } from "@/lib/commerce-flags";
import { ShopCheckout } from "@/features/shop-checkout";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Secure checkout",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  alternates: { canonical: null },
};
export default async function Page({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  if (!purchaseFirstEnabled) notFound();
  const { itemId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(itemId)) notFound();
  const product = await db().collection("shopItems").doc(itemId).get();
  if (!product.data()?.published) notFound();
  const item = await getPublicShopItem(String(product.data()!.slug));
  return (
    <Suspense fallback={<p role="status">Loading checkout…</p>}>
      <ShopCheckout item={item} />
    </Suspense>
  );
}
