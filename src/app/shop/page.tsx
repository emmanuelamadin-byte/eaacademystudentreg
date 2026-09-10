import type { Metadata } from "next";
import { ShopCatalogPage } from "@/features/shop-public";

export const metadata: Metadata = {
  title: "Shop Professional Courses & Digital Learning Resources | EA Academy",
  description:
    "Explore standalone professional courses, downloadable guides, production toolkits, and software materials at EA Academy. Lifetime access and industry-ready certificates.",
  alternates: {
    canonical: "/shop",
  },
};

export default function Page() {
  return <ShopCatalogPage />;
}
