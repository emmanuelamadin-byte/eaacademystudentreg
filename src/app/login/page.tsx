import type { Metadata } from "next";
import { Suspense } from "react";
import AuthPage from "@/features/auth";
import { Loading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Student Login — Continue Learning at EA Academy",
  description:
    "Sign in to your EA Academy student workspace. Pick up your lessons, review submitted assignments, check instructor feedback, and access your community.",
  alternates: {
    canonical: "/login",
  },
};

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <AuthPage />
    </Suspense>
  );
}
