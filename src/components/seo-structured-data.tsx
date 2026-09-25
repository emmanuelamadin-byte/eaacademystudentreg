import { TRACKS, type ShopItem } from "@/lib/types";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://student.cleanbrandagency.com";

export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: "Emmanuel Amadin Academy",
    alternateName: ["EA Academy", "Emmanuel Amadin Digital Academy"],
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    image: `${SITE_URL}/og-image.jpg`,
    description:
      "A free, project-based platform to learn practical online AI tools, modern digital workflows, creative media, video editing, and business growth.",
    sameAs: [
      "https://twitter.com/eaacademy",
      "https://linkedin.com/company/eaacademy",
      "https://youtube.com/@eaacademy",
    ],
    knowsAbout: [
      "Artificial Intelligence",
      "AI Tools & Prompt Engineering",
      "Video Editing",
      "Adobe Premiere Pro",
      "CapCut",
      "Motion Graphics",
      "Graphic Design",
      "Brand Identity Design",
      "Digital Marketing",
      "Social Media Growth",
      "Freelancing & Client Acquisition",
      "Business Growth",
    ],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "EA Academy Educational Programs",
      itemListElement: [
        {
          "@type": "Offer",
          name: "Free Career Tracks Starter Tier",
          description:
            "Free access to introductory modules, starter assignments, progress tracking, and community practice in AI, creative media, and business growth.",
          price: "0",
          priceCurrency: "NGN",
          availability: "https://schema.org/InStock",
        },
        {
          "@type": "Offer",
          name: "Premium All-Access Pass",
          description:
            "Full access to all career tracks, unlimited lesson videos, instructor code and portfolio reviews, AI mentor tutor, and verified digital certificates.",
          price: "3000",
          priceCurrency: "NGN",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: "3000",
            priceCurrency: "NGN",
            unitText: "MONTH",
          },
          availability: "https://schema.org/InStock",
        },
      ],
    },
    audience: {
      "@type": "EducationalAudience",
      educationalRole: "student",
      audienceType:
        "Aspiring tech professionals, creators, freelancers, and students",
    },
    areaServed: ["Global", "Nigeria", "Africa"],
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

export function ShopProductSchema({ item }: { item: ShopItem }) {
  const isCourse = item.type === "course";
  const image = item.thumbnailUrl
    ? item.thumbnailUrl.startsWith("http")
      ? item.thumbnailUrl
      : `${SITE_URL}${item.thumbnailUrl}`
    : `${SITE_URL}/og-image.jpg`;

  const schema = isCourse
    ? {
        "@context": "https://schema.org",
        "@type": "Course",
        name: item.title,
        description: item.subtitle || item.description,
        provider: {
          "@type": "EducationalOrganization",
          name: "EA Academy",
          sameAs: SITE_URL,
        },
        image,
        isAccessibleForFree: item.price === 0,
        offers: {
          "@type": "Offer",
          price: String(item.price),
          priceCurrency: "NGN",
          availability: "https://schema.org/InStock",
          url: `${SITE_URL}/shop/${item.slug}`,
        },
        hasCourseInstance: {
          "@type": "CourseInstance",
          courseMode: "Online",
        },
        educationalCredentialAwarded: "Certificate of Completion",
      }
    : {
        "@context": "https://schema.org",
        "@type": "Product",
        name: item.title,
        description: item.subtitle || item.description,
        image,
        brand: {
          "@type": "Brand",
          name: "EA Academy",
        },
        offers: {
          "@type": "Offer",
          price: String(item.price),
          priceCurrency: "NGN",
          availability: "https://schema.org/InStock",
          url: `${SITE_URL}/shop/${item.slug}`,
        },
      };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
