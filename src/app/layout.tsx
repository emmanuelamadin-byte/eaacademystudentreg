import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AcademyProvider } from "@/components/academy-provider";
import { PwaTools } from "@/components/pwa-tools";
import { NavigationScrollHandler } from "@/components/navigation-scroll-handler";
import {
  OrganizationSchema,
  WebSiteSchema,
} from "@/components/seo-structured-data";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://student.cleanbrandagency.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Free Platform to Learn AI & Digital Skills | EA Academy",
    template: "%s | EA Academy",
  },
  description:
    "Looking for a free platform to learn AI and digital skills? EA Academy offers practical, project-based career tracks in artificial intelligence, modern digital workflows, creative media, and business growth. Start learning for free today.",
  keywords: [
    "free platform to learn AI and digital skills",
    "learn AI and digital skills online free",
    "free digital skills training with certificate",
    "AI tools training free",
    "practical AI skills academy",
    "learn artificial intelligence free",
    "free graphic design and AI video courses",
    "learn digital marketing free",
    "EA Academy",
    "Emmanuel Amadin Academy",
    "practical online AI academy",
    "best free platform to learn digital skills",
    "learn AI and digital skills in Nigeria",
    "free online courses with certificates",
  ],
  authors: [{ name: "Emmanuel Amadin Academy", url: SITE_URL }],
  creator: "Emmanuel Amadin Academy",
  publisher: "Emmanuel Amadin Academy",
  applicationName: "EA Academy",
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EA Academy",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "EA Academy",
    title: "Free Platform to Learn AI & Digital Skills | EA Academy",
    description:
      "Master high-demand AI tools and digital skills with free career tracks in artificial intelligence, creative media, and business growth. Build real projects and earn verified credentials.",
    images: [
      {
        url: `${SITE_URL}/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: "EA Academy — Free Platform to Learn AI & Digital Skills",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Platform to Learn AI & Digital Skills | EA Academy",
    description:
      "Join free career tracks in artificial intelligence, in-demand digital skills, creative media, and business growth. Learn practical skills and build real projects.",
    creator: "@eaacademy",
    images: [`${SITE_URL}/og-image.jpg`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#002751",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={plusJakartaSans.variable}>
      <head>
        <OrganizationSchema />
        <WebSiteSchema />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <AcademyProvider>
          <NavigationScrollHandler />
          <div id="main-content">{children}</div>
          <PwaTools />
        </AcademyProvider>
      </body>
    </html>
  );
}
