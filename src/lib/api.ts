import { getSupabase } from "./supabase";

export async function accessToken() {
  const { data } = (await getSupabase()?.auth.getSession()) || { data: null };
  return data?.session?.access_token;
}

export async function api<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const token = await accessToken();
  const response = await fetch("/api/academy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await response.json().catch(() => ({
    error: "The server returned an unexpected response. Please try again.",
  }));
  if (!response.ok)
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : body.error?.message || "Unable to complete this request.",
    );
  return body.data as T;
}
export async function uploadFile(
  file: File,
): Promise<{ url: string; path: string; name: string }> {
  const token = await accessToken();
  if (!token) throw new Error("Sign in to upload a file.");
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Upload failed.");
  return result.data;
}
export async function downloadAttachment(url: string) {
  if (url.startsWith("uploads/"))
    url = `/api/upload?path=${encodeURIComponent(url)}`;
  if (!url.startsWith("/api/upload?"))
    throw new Error("This attachment URL is not supported.");
  const token = await accessToken();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Unable to download this attachment.");
  const objectUrl = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download =
    new URL(url, location.origin).searchParams.get("path")?.split("/").pop() ||
    "attachment";
  a.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
