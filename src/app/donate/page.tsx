import type { Metadata } from "next";
import { Donations } from "@/features/billing";

export const metadata: Metadata = {
  title: "Support a Student — Digital Skills Scholarship Fund",
  description:
    "Help expand access to digital education. Sponsor scholarships for ambitious learners to master software development, design, and business skills.",
  alternates: {
    canonical: "/donate",
  },
};

export default function Page() {
  return <Donations />;
}
