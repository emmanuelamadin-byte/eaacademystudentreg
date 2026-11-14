import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicLandingPage } from "@/server/landing-pages";
import { ApiError } from "@/server/policy";
import { LandingPageView } from "@/components/landing-page-view";
import { ShopProductSchema } from "@/components/seo-structured-data";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { document, item } = await getPublicLandingPage(slug);
    return {
      title: document.seoTitle || item.title,
      description: document.seoDescription || item.subtitle,
      alternates: { canonical: `/offer/${slug}` },
      robots: { index: false, follow: true },
      openGraph: {
        title: document.seoTitle || item.title,
        description: document.seoDescription || item.subtitle,
        url: `/offer/${slug}`,
        images: document.socialImage ? [document.socialImage] : [],
      },
      twitter: {
        card: "summary_large_image",
        title: document.seoTitle || item.title,
        description: document.seoDescription || item.subtitle,
        images: document.socialImage ? [document.socialImage] : [],
      },
    };
  } catch {
    return {
      title: "Offer unavailable",
      robots: { index: false, follow: false },
    };
  }
}
export default async function Page({ params }: Props) {
  const { slug } = await params;
  let page;
  try {
    page = await getPublicLandingPage(slug);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) notFound();
    throw cause;
  }
  return (
    <>
      <ShopProductSchema item={page.item} />
      <LandingPageView
        document={page.document}
        item={page.item}
        campaignId={page.id}
      />
    </>
  );
}
