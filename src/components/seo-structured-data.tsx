import { TRACKS } from "@/lib/types";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://eaacademy.org";

export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: "Emmanuel Amadin Academy",
    alternateName: ["EA Academy", "Emmanuel Amadin Digital Academy"],
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    description:
      "A free platform to learn practical online digital skills in software development, creative media, and business growth.",
    sameAs: [
      "https://twitter.com/eaacademy",
      "https://linkedin.com/company/eaacademy",
      "https://youtube.com/@eaacademy",
    ],
    offers: {
      "@type": "Offer",
      category: "Free Online Digital Skills Education",
      price: "0",
      priceCurrency: "NGN",
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function WebSiteSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "EA Academy — Free Online Digital Skills Learning Platform",
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/tracks?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function CourseListSchema() {
  const courseItems = TRACKS.map((track, index) => ({
    "@type": "ListItem",
    position: index + 1,
    item: {
      "@type": "Course",
      name: track.name,
      description: track.description,
      provider: {
        "@type": "EducationalOrganization",
        name: "EA Academy",
        sameAs: SITE_URL,
      },
      isAccessibleForFree: true,
      hasCourseInstance: {
        "@type": "CourseInstance",
        courseMode: "Online",
        courseWorkload: "PT4H",
      },
      educationalCredentialAwarded: "Certificate of Completion",
      offers: [
        {
          "@type": "Offer",
          category: "Free Starter Tier",
          price: "0",
          priceCurrency: "NGN",
        },
        {
          "@type": "Offer",
          category: "Premium Full Access",
          price: "3000",
          priceCurrency: "NGN",
        },
      ],
      url: `${SITE_URL}/tracks#${track.id}`,
    },
  }));

  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Free Online Digital Skills Career Tracks",
    description:
      "Explore structured career tracks in technology, creative media, and business growth at EA Academy.",
    itemListElement: courseItems,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function FaqPageSchema({ faqs }: { faqs: FaqItem[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function BreadcrumbSchema({
  items,
}: {
  items: { name: string; url: string }[];
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${SITE_URL}${item.url}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
