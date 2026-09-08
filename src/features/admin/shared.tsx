"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { TRACKS } from "@/lib/types";
import type { CareerPathClassId } from "@/lib/types";

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function run(
    work: () => Promise<unknown>,
    success = "Saved successfully.",
  ) {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await work();
      setMessage(success);
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save. Please try again.",
      );
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, failed, run };
}
export function ActionMessage({
  action,
}: {
  action: ReturnType<typeof useAction>;
}) {
  return action.message ? (
    <p
      className={`alert ${action.failed ? "alert-error" : ""}`}
      role={action.failed ? "alert" : "status"}
    >
      {action.message}
    </p>
  ) : null;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p className="muted">{children}</p>
    </div>
  );
}
export function TrackSelect({
  value,
  onChange,
  all = false,
  allowed,
}: {
  value: string;
  onChange: (value: CareerPathClassId | "all") => void;
  all?: boolean;
  allowed?: string[];
}) {
  return (
    <select
      aria-label="Career track"
      value={value}
      onChange={(event) =>
        onChange(event.target.value as CareerPathClassId | "all")
      }
    >
      {all && <option value="all">All tracks</option>}
      {TRACKS.filter((track) => !allowed || allowed.includes(track.id)).map(
        (track) => (
          <option key={track.id} value={track.id}>
            {track.name}
          </option>
        ),
      )}
    </select>
  );
}
export function trackName(id: string) {
  return TRACKS.find((track) => track.id === id)?.name ?? "All tracks";
}
export function dateLabel(value?: string) {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Date unavailable"
    : date.toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}
export function safeUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(
      value,
      typeof window !== "undefined"
        ? window.location.origin
        : "https://ea.academy",
    );
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function ExternalLink({
  href,
  children,
}: {
  href?: string;
  children: ReactNode;
}) {
  const url = safeUrl(href);
  return url ? (
    <a
      className="text-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children} ↗
    </a>
  ) : null;
}
