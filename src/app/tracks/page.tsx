import type { Metadata } from "next";
import { TracksPage } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Free Career Tracks & Practical Digital Skills Curriculum",
  description:
    "Explore free, structured career tracks in Systems & Development, Creative Media Studio, and Business Growth. Learn practical digital skills with hands-on projects and assignments.",
  alternates: {
    canonical: "/tracks",
  },
};

export default function Page() {
  return <TracksPage />;
}
