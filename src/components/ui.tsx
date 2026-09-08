import Link from "next/link";
import { ArrowUpRight, BookOpen, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
export function Brand({
  light = false,
  name = "EA ACADEMY",
}: {
  light?: boolean;
  name?: string;
}) {
  return (
    <Link
      href="/"
      className={`brand ${light ? "brand-light" : ""}`}
      aria-label="EA Academy home"
    >
      <span className="brand-symbol">
        ea<span>↗</span>
      </span>
      <span>
        {name}
        <small>LEARN. BUILD. BECOME.</small>
      </span>
    </Link>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <BookOpen size={25} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={24} /> Loading your workspace…
    </div>
  );
}
export function SetupNotice() {
  return (
    <div className="setup-notice">
      <span className="eyebrow">GETTING READY</span>
      <h2>Your academy is almost connected.</h2>
      <p>
        Account access will be available once the academy’s Supabase
        configuration is connected. You can explore the career tracks in the
        meantime.
      </p>
      <Link href="/tracks" className="btn btn-primary">
        Explore the tracks <ArrowUpRight size={17} />
      </Link>
    </div>
  );
}
export function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}
