import type { Metadata } from "next";
import { Suspense } from "react";
import AuthPage from "@/features/auth";
import { Loading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Register for Free — Start Learning Practical Digital & AI Skills",
  description:
    "Create your free EA Academy student account. Choose your primary career track, access starter lessons and assignments, and join our active community.",
  alternates: {
    canonical: "/signup",
  },
};

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <AuthPage mode="signup" />
    </Suspense>
  );
}
