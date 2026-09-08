import Link from "next/link";
import { Brand } from "@/components/ui";
export default function NotFound() {
  return (
    <main className="error-page">
      <Brand />
      <span className="eyebrow">404 / A LITTLE OFF TRACK</span>
      <h1>Let’s find your way back.</h1>
      <p>This page is no longer here, or the address may be incorrect.</p>
      <Link href="/" className="btn btn-primary">
        Back to the academy
      </Link>
    </main>
  );
}
