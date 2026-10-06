/**
 * URL sanitization helpers to prevent script injection (e.g. javascript: URI XSS)
 * and malicious protocol execution.
 */

export function safeUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(
      value,
      typeof window !== "undefined"
        ? window.location.origin
        : "https://student.cleanbrandagency.com",
    );
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function safeResourceUrl(value?: string): string {
  if (!value) return "#";
  const trimmed = value.trim();
  if (!trimmed) return "#";

  // Disallow protocol-relative URLs (//attacker.com)
  if (trimmed.startsWith("//")) return "#";

  // Allow safe internal relative paths
  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  // Allow safe uploads storage paths
  if (trimmed.startsWith("uploads/") && !trimmed.includes("..")) {
    return `/api/upload?path=${encodeURIComponent(trimmed)}`;
  }

  try {
    const parsed = new URL(trimmed);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "#";
  } catch {
    return "#";
  }
}

export function safeWhatsAppUrl(value?: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase();
    if (["chat.whatsapp.com", "wa.me", "api.whatsapp.com"].includes(host)) {
      return url.href;
    }
    return "";
  } catch {
    return "";
  }
}
