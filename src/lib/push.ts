"use client";

import { api } from "./api";
import type { AcademyUser } from "./types";

export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BAanuzltjxVOP3zC4_Kway3VY4qczI-o_oQI0UAAw4kNhMoYG-qoUjdN6KtE83qP7bEvnJ7dhsMk8pKTwlpLzdc";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(
  user?: AcademyUser | null,
): Promise<{ success: boolean; permission: NotificationPermission; error?: string }> {
  if (!isPushSupported()) {
    return {
      success: false,
      permission: "denied",
      error: "Push notifications are not supported on this browser or device.",
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        success: false,
        permission,
        error: "Notification permission was not granted.",
      };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as unknown as BufferSource,
      });
    }

    if (user) {
      await api("push.subscribe", {
        subscription: subscription.toJSON(),
      });
    }

    return { success: true, permission: "granted" };
  } catch (err) {
    console.error("Failed to subscribe to push notifications:", err);
    return {
      success: false,
      permission: Notification.permission,
      error:
        err instanceof Error
          ? err.message
          : "Failed to subscribe to notifications.",
    };
  }
}

export async function unsubscribeFromPush(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!isPushSupported()) return { success: false };

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      try {
        await api("push.unsubscribe", { endpoint });
      } catch {
        // Ignore server error on unsubscribe
      }
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to unsubscribe.",
    };
  }
}
