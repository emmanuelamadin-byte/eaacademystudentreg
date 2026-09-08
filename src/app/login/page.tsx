import { Suspense } from "react";
import AuthPage from "@/features/auth";
import { Loading } from "@/components/ui";
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <AuthPage />
    </Suspense>
  );
}
