import type { Metadata } from "next";
import { Donations } from "@/features/billing";

export const metadata: Metadata = {
  title: "Support a Student — Digital Skills Scholarship Fund",
  description:
    "Help expand access to digital education. Sponsor scholarships for ambitious learners to master AI tools, modern digital skills, and business growth.",
  alternates: {
    canonical: "/donate",
  },
};

export default function Page() {
  return <Donations />;
}
