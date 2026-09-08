import type { Metadata } from "next";
import Welcome from "@/features/welcome";

export const metadata: Metadata = { title: "Welcome" };

export default function Page() {
  return <Welcome />;
}
