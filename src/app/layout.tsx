import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AcademyProvider } from "@/components/academy-provider";
import { PwaTools } from "@/components/pwa-tools";
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
  process.env.NEXT_PUBLIC_SITE_URL || "https://eaacademy.org";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Free Platform to Learn Online Digital Skills | EA Academy",
    template: "%s | EA Academy",
  },
  description:
    "Looking for a free platform to learn online digital skills? EA Academy offers practical, project-based career tracks in software engineering, creative media, and business growth. Start learning for free today.",
  keywords: [
    "free platform to learn online digital skill",
    "free platform to learn online digital skills",
    "learn digital skills online free",
    "free digital skills training with certificate",
    "free online tech courses with certificate",
    "free coding platform online",
    "learn software development free",
    "free graphic design courses online",
    "learn digital marketing free",
    "EA Academy",
    "Emmanuel Amadin Academy",
    "practical online tech academy",
    "best free platform to learn tech skills",
    "learn digital skills in Nigeria",
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
  icons: { icon: "/icon.svg", apple: "/icons/icon-192.png" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "EA Academy",
    title: "Free Platform to Learn Online Digital Skills | EA Academy",
    description:
      "Master high-demand digital skills with free career tracks in software engineering, creative design, and digital commerce. Build real projects and earn verified credentials.",
    images: [
      {
        url: `${SITE_URL}/icons/icon-512.png`,
        width: 512,
        height: 512,
        alt: "EA Academy — Free Online Digital Skills Learning Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Platform to Learn Online Digital Skills | EA Academy",
    description:
      "Join free career tracks in software engineering, creative design, and digital business. Learn practical skills and submit assignments.",
    creator: "@eaacademy",
    images: [`${SITE_URL}/icons/icon-512.png`],
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
          <div id="main-content">{children}</div>
          <PwaTools />
        </AcademyProvider>
      </body>
    </html>
  );
}
