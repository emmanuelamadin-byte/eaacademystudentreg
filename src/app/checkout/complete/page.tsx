import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { purchaseFirstEnabled } from "@/lib/commerce-flags";
import { ShopPurchaseRecovery } from "@/features/shop-checkout";
export const metadata: Metadata = {
  title: "Access your purchase",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  alternates: { canonical: null },
};
export default function Page() {
  if (!purchaseFirstEnabled) notFound();
  return (
    <Suspense fallback={<p role="status">Loading your purchase…</p>}>
      <ShopPurchaseRecovery />
    </Suspense>
  );
}
