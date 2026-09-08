"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAcademy } from "@/components/academy-provider";
import { getSupabase } from "@/lib/supabase";

type QueuedAction = {
  id: string;
  action: "progress.complete" | "submission.save";
  payload: Record<string, unknown>;
  queuedAt: string;
};
const key = (uid: string) => `ea:learning-queue:${uid}`;
export function readQueue(uid: string): QueuedAction[] {
  try {
    return JSON.parse(localStorage.getItem(key(uid)) || "[]");
  } catch {
    return [];
  }
}
export function queueAction(
  uid: string,
  action: QueuedAction["action"],
  payload: Record<string, unknown>,
  id: string,
) {
  const queue = readQueue(uid).filter((item) => item.id !== id);
  queue.push({ id, action, payload, queuedAt: new Date().toISOString() });
  localStorage.setItem(key(uid), JSON.stringify(queue));
  window.dispatchEvent(new Event("ea:queue-change"));
}
export function LearningSync() {
  const { user } = useAcademy();
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) {
      setPending(0);
      return;
    }
    let syncing = false;
    let cancelled = false;
    const sync = async () => {
      setPending(readQueue(user.id).length);
      if (syncing || !navigator.onLine) return;
      syncing = true;
      setError("");
      try {
        for (const item of readQueue(user.id)) {
          const { data } = (await getSupabase()?.auth.getUser()) || {
            data: { user: null },
          };
          if (cancelled || data.user?.id !== user.id) break;
          try {
            await api(item.action, item.payload);
            // Preserve newer edits queued while the request was in flight.
            localStorage.setItem(
              key(user.id),
              JSON.stringify(
                readQueue(user.id).filter(
                  (current) =>
                    !(
                      current.id === item.id &&
                      current.queuedAt === item.queuedAt
                    ),
                ),
              ),
            );
            setPending(readQueue(user.id).length);
            window.dispatchEvent(new Event("ea:queue-synced"));
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Offline work could not sync.",
            );
            window.dispatchEvent(
              new CustomEvent("ea:queue-error", {
                detail:
                  error instanceof Error
                    ? error.message
                    : "Offline work could not sync. It remains saved on this device.",
              }),
            );
            break;
          }
        }
      } finally {
        syncing = false;
      }
    };
    void sync();
    window.addEventListener("online", sync);
    window.addEventListener("ea:queue-change", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("online", sync);
      window.removeEventListener("ea:queue-change", sync);
    };
  }, [user]);
  return pending > 0 ? (
    <div className="alert" role="status">
      {pending} saved {pending === 1 ? "change is" : "changes are"} waiting to
      sync.{" "}
      {error ||
        "Your work is stored on this device and will sync when connected."}
      {error && (
        <button
          className="btn btn-secondary btn-small"
          onClick={() => window.dispatchEvent(new Event("ea:queue-change"))}
        >
          Retry sync
        </button>
      )}
    </div>
  ) : null;
}
