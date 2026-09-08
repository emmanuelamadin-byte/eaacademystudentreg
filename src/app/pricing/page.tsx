import type { Metadata } from "next";
import { Pricing } from "@/features/billing";

export const metadata: Metadata = {
  title: "Free Membership & Premium All-Access Pass",
  description:
    "Start learning digital skills 100% free with starter lessons, self-guided practice, and community discussions. Upgrade to Premium for ₦3,000/month for all-track access and mentor reviews.",
  alternates: {
    canonical: "/pricing",
  },
};

export default function Page() {
  return <Pricing />;
}
