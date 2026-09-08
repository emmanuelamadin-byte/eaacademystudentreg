import type { Metadata } from "next";
import { Landing } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Free Platform to Learn AI & Digital Skills — AI, Media & Business",
  description:
    "Looking for a free platform to learn AI and digital skills? EA Academy offers practical, project-based career tracks in artificial intelligence, modern digital workflows, creative media, and business growth. Start learning for free today.",
  alternates: {
    canonical: "/",
  },
};

export default function Page() {
  return <Landing />;
}
