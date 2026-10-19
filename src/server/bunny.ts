import "server-only";
import { createHash } from "node:crypto";
import type { ShopCourseModule } from "@/lib/types";
import { ApiError } from "./policy";
import { db } from "./supabase";

export interface BunnyVideoInfo {
  libraryId: string;
  videoId: string;
}

export interface BunnyConfig {
  apiKey: string;
  libraryId: string;
  tokenKey: string;
  webhookSecret: string;
  cdnHostname: string;
  isConfigured: boolean;
}

export interface BunnyVideoDetails {
  videoId: string;
  libraryId: string;
  title: string;
  status: number;
  statusLabel: "created" | "uploaded" | "processing" | "transcoding" | "ready" | "error";
  isReady: boolean;
  lengthSeconds: number;
  durationFormatted: string;
  encodeProgress: number;
  storageSize?: number;
  views?: number;
  thumbnailCount?: number;
  availableResolutions?: string;
  embedUrl: string;
  signedEmbedUrl: string;
  hlsUrl?: string;
  thumbnailUrl?: string;
  previewWebpUrl?: string;
  dateUploaded?: string;
  raw?: unknown;
}

export interface BunnyDirectUploadCredentials {
  libraryId: string;
  videoId: string;
  uploadEndpoint: string;
  directPutUrl: string;
  authorizationSignature: string;
  authorizationExpire: number;
  embedUrl: string;
  signedEmbedUrl: string;
}

export interface BunnyWebhookPayload {
  VideoLibraryId: number | string;
  VideoGuid: string;
  Status: number;
  Title?: string;
  TotalLength?: number;
  ThumbnailFileName?: string;
  Views?: number;
  [key: string]: unknown;
}

/**
 * Reads Bunny Stream configuration from environment variables.
 */
export function getBunnyConfig(): BunnyConfig {
  const apiKey = (process.env.BUNNY_STREAM_API_KEY || "").trim();
  const libraryId = (process.env.BUNNY_STREAM_LIBRARY_ID || "").trim();
  const tokenKey = (process.env.BUNNY_STREAM_TOKEN_AUTH_KEY || "").trim();
  const webhookSecret = (process.env.BUNNY_STREAM_WEBHOOK_SECRET || "").trim();
  const cdnHostname = (process.env.BUNNY_STREAM_CDN_HOSTNAME || "").trim();

  return {
    apiKey,
    libraryId,
    tokenKey,
    webhookSecret,
    cdnHostname,
    isConfigured: Boolean(apiKey && libraryId),
  };
}

/**
 * Converts seconds into a user-friendly duration string: "MM:SS" or "H:MM:SS".
 */
export function formatBunnyDuration(totalSeconds: number): string {
  const secondsInt = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (secondsInt === 0) return "0:00";

  const hours = Math.floor(secondsInt / 3600);
  const minutes = Math.floor((secondsInt % 3600) / 60);
  const seconds = secondsInt % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Extracts Bunny Stream library ID and video GUID from a URL or iframe snippet.
 * Supports iframe.mediadelivery.net, player.mediadelivery.net, and video.bunnycdn.com.
 */
export function parseBunnyVideoInfo(rawInput: string): BunnyVideoInfo | null {
  if (!rawInput || typeof rawInput !== "string") return null;
  const trimmed = rawInput.trim();

  // If iframe snippet was provided, extract the src URL
  const iframeMatch = trimmed.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  const target = iframeMatch ? iframeMatch[1] : trimmed;

  try {
    const parsed = new URL(target.startsWith("http") ? target : `https://${target}`);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("mediadelivery.net") && !host.includes("bunnycdn.com")) {
      return null;
    }

    // Path pattern: /(embed|play)/{libraryId}/{videoId}
    const match = parsed.pathname.match(/\/(?:embed|play)\/([a-zA-Z0-9]+)\/([a-zA-Z0-9_-]+)/i);
    if (match && match[1] && match[2]) {
      return {
        libraryId: match[1],
        videoId: match[2],
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Strips temporary session tokens and expiration timestamps from a Bunny URL
 * to store only canonical, clean URLs in the database.
 */
export function cleanBunnyUrl(rawInput: string): string {
  if (!rawInput || typeof rawInput !== "string") return "";
  const info = parseBunnyVideoInfo(rawInput);
  if (!info) return rawInput.trim();

  try {
    const parsed = new URL(rawInput.trim().startsWith("http") ? rawInput.trim() : `https://${rawInput.trim()}`);
    parsed.searchParams.delete("token");
    parsed.searchParams.delete("expires");
    return parsed.toString();
  } catch {
    return rawInput.trim();
  }
}

export interface BunnySignOptions {
  tokenKey?: string;
  expiresInSeconds?: number;
}

/**
 * Generates a signed, time-limited Bunny Stream embed URL using SHA256 Token Authentication.
 * Formula: SHA256_HEX(token_security_key + video_id + expiration_timestamp)
 *
 * If no BUNNY_STREAM_TOKEN_AUTH_KEY is configured in the environment,
 * returns the clean URL gracefully for full backward compatibility.
 */
export function signBunnyEmbedUrl(
  rawUrl: string,
  options: BunnySignOptions = {},
): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const info = parseBunnyVideoInfo(rawUrl);
  if (!info) return rawUrl;

  const key = (options.tokenKey ?? process.env.BUNNY_STREAM_TOKEN_AUTH_KEY ?? "").trim();
  if (!key) {
    return cleanBunnyUrl(rawUrl);
  }

  // Default expiration: 4 hours (14,400 seconds)
  const expiresIn = options.expiresInSeconds && options.expiresInSeconds > 0
    ? options.expiresInSeconds
    : 14400;
  const expires = Math.floor(Date.now() / 1000) + expiresIn;

  const hashInput = `${key}${info.videoId}${expires}`;
  const token = createHash("sha256").update(hashInput).digest("hex");

  try {
    const parsed = new URL(rawUrl.trim().startsWith("http") ? rawUrl.trim() : `https://${rawUrl.trim()}`);
    if (parsed.pathname.startsWith("/play/")) {
      parsed.pathname = parsed.pathname.replace("/play/", "/embed/");
    }
    parsed.searchParams.set("token", token);
    parsed.searchParams.set("expires", String(expires));
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Signs any Bunny Stream lesson URLs in a curriculum structure.
 */
export function signCurriculumBunnyUrls(
  curriculum: ShopCourseModule[] | undefined,
  options: BunnySignOptions = {},
): ShopCourseModule[] {
  if (!Array.isArray(curriculum)) return [];
  return curriculum.map((mod) => ({
    ...mod,
    lessons: (mod.lessons || []).map((les) => ({
      ...les,
      videoUrl: les.videoUrl ? signBunnyEmbedUrl(les.videoUrl, options) : "",
    })),
  }));
}

/**
 * Creates a new video object in Bunny Stream.
 * Returns the video GUID and embed URLs.
 */
export async function createBunnyVideo(
  title: string,
  options: { collectionId?: string; libraryId?: string } = {},
): Promise<{
  videoId: string;
  libraryId: string;
  title: string;
  embedUrl: string;
  signedEmbedUrl: string;
  raw: unknown;
}> {
  const config = getBunnyConfig();
  const libraryId = (options.libraryId || config.libraryId).trim();
  if (!config.apiKey || !libraryId) {
    throw new ApiError(503, "Bunny Stream credentials (API Key and Library ID) are not configured.");
  }

  const res = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos`, {
    method: "POST",
    headers: {
      AccessKey: config.apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      title: title.trim() || "Untitled Video",
      collectionId: options.collectionId || undefined,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ApiError(res.status, `Bunny Stream failed to create video${detail ? `: ${detail}` : "."}`);
  }

  const data = (await res.json()) as { guid: string; title?: string };
  const videoId = data.guid;
  const embedUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`;

  return {
    videoId,
    libraryId,
    title: data.title || title,
    embedUrl,
    signedEmbedUrl: signBunnyEmbedUrl(embedUrl),
    raw: data,
  };
}

/**
 * Generates direct upload authorization credentials for the browser
 * to upload directly to Bunny Stream via TUS or Direct PUT.
 * Signature formula: SHA256(library_id + api_key + expiration_time + video_id)
 */
export function getBunnyDirectUploadSignature(
  videoId: string,
  libraryId?: string,
  expiresInSeconds = 3600,
): BunnyDirectUploadCredentials {
  const config = getBunnyConfig();
  const targetLibraryId = (libraryId || config.libraryId).trim();
  if (!config.apiKey || !targetLibraryId) {
    throw new ApiError(503, "Bunny Stream API Key and Library ID are required for direct upload.");
  }

  const expiration = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const hashInput = `${targetLibraryId}${config.apiKey}${expiration}${videoId}`;
  const signature = createHash("sha256").update(hashInput).digest("hex");

  const embedUrl = `https://iframe.mediadelivery.net/embed/${targetLibraryId}/${videoId}`;

  return {
    libraryId: targetLibraryId,
    videoId,
    uploadEndpoint: "https://video.bunnycdn.com/tusupload",
    directPutUrl: `https://video.bunnycdn.com/library/${encodeURIComponent(targetLibraryId)}/videos/${encodeURIComponent(videoId)}`,
    authorizationSignature: signature,
    authorizationExpire: expiration,
    embedUrl,
    signedEmbedUrl: signBunnyEmbedUrl(embedUrl),
  };
}

/**
 * Instructs Bunny Stream to fetch and ingest a video from an external URL
 * (e.g., Loom, Google Drive, YouTube, Vimeo, direct MP4).
 */
export async function fetchBunnyVideo(
  sourceUrl: string,
  title: string,
  options: { collectionId?: string; libraryId?: string } = {},
): Promise<{
  success: boolean;
  videoId?: string;
  libraryId: string;
  embedUrl: string;
  signedEmbedUrl: string;
  raw: unknown;
}> {
  const config = getBunnyConfig();
  const libraryId = (options.libraryId || config.libraryId).trim();
  if (!config.apiKey || !libraryId) {
    throw new ApiError(503, "Bunny Stream credentials are not configured.");
  }

  const res = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/fetch`, {
    method: "POST",
    headers: {
      AccessKey: config.apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      url: sourceUrl.trim(),
      title: title.trim() || "Imported Video",
      collectionId: options.collectionId || undefined,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ApiError(res.status, `Bunny Stream failed to import video${detail ? `: ${detail}` : "."}`);
  }

  const data = (await res.json()) as { id?: string; guid?: string; success?: boolean };
  const videoId = data.id || data.guid;
  const embedUrl = videoId ? `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}` : "";

  return {
    success: true,
    videoId,
    libraryId,
    embedUrl,
    signedEmbedUrl: embedUrl ? signBunnyEmbedUrl(embedUrl) : "",
    raw: data,
  };
}

/**
 * Retrieves video metadata, status, encoding progress, and duration from Bunny Stream.
 */
export async function getBunnyVideo(
  videoId: string,
  libraryId?: string,
): Promise<BunnyVideoDetails> {
  const config = getBunnyConfig();
  const targetLibraryId = (libraryId || config.libraryId).trim();
  if (!config.apiKey || !targetLibraryId) {
    throw new ApiError(503, "Bunny Stream credentials are not configured.");
  }

  const res = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(targetLibraryId)}/videos/${encodeURIComponent(videoId)}`, {
    headers: {
      AccessKey: config.apiKey,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ApiError(res.status, `Bunny Stream failed to retrieve video details${detail ? `: ${detail}` : "."}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const totalLength = Number(data.length || 0);
  const statusNumber = Number(data.status);
  // Status: 0 = Created, 1 = Uploaded, 2 = Processing, 3 = Transcoding, 4 = Finished, 5 = Error
  const statusLabel =
    statusNumber === 4 ? "ready" :
    statusNumber === 5 ? "error" :
    statusNumber === 3 ? "transcoding" :
    statusNumber === 2 ? "processing" :
    statusNumber === 1 ? "uploaded" : "created";

  const embedUrl = `https://iframe.mediadelivery.net/embed/${targetLibraryId}/${videoId}`;
  const cdnHost = config.cdnHostname || `video.bunnycdn.com`;

  return {
    videoId: String(data.guid || videoId),
    libraryId: targetLibraryId,
    title: String(data.title || "Untitled"),
    status: statusNumber,
    statusLabel,
    isReady: statusNumber === 4,
    lengthSeconds: totalLength,
    durationFormatted: formatBunnyDuration(totalLength),
    encodeProgress: Number(data.encodeProgress || 0),
    storageSize: Number(data.storageSize || 0),
    views: Number(data.views || 0),
    thumbnailCount: Number(data.thumbnailCount || 0),
    availableResolutions: String(data.availableResolutions || ""),
    embedUrl,
    signedEmbedUrl: signBunnyEmbedUrl(embedUrl),
    hlsUrl: `https://${cdnHost}/${videoId}/playlist.m3u8`,
    thumbnailUrl: `https://${cdnHost}/${videoId}/thumbnail.jpg`,
    previewWebpUrl: `https://${cdnHost}/${videoId}/preview.webp`,
    dateUploaded: String(data.dateUploaded || ""),
    raw: data,
  };
}

/**
 * Lists videos in the Bunny Stream library with pagination and search.
 */
export async function listBunnyVideos(
  params: {
    page?: number;
    perPage?: number;
    search?: string;
    collection?: string;
    libraryId?: string;
  } = {},
): Promise<{
  totalItems: number;
  currentPage: number;
  itemsPerPage: number;
  items: BunnyVideoDetails[];
}> {
  const config = getBunnyConfig();
  const targetLibraryId = (params.libraryId || config.libraryId).trim();
  if (!config.apiKey || !targetLibraryId) {
    throw new ApiError(503, "Bunny Stream credentials are not configured.");
  }

  const url = new URL(`https://video.bunnycdn.com/library/${encodeURIComponent(targetLibraryId)}/videos`);
  if (params.page) url.searchParams.set("page", String(params.page));
  if (params.perPage) url.searchParams.set("itemsPerPage", String(params.perPage));
  if (params.search) url.searchParams.set("search", params.search.trim());
  if (params.collection) url.searchParams.set("collection", params.collection.trim());
  url.searchParams.set("orderBy", "date");

  const res = await fetch(url.toString(), {
    headers: {
      AccessKey: config.apiKey,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ApiError(res.status, `Bunny Stream failed to list videos${detail ? `: ${detail}` : "."}`);
  }

  const data = (await res.json()) as {
    totalItems?: number;
    currentPage?: number;
    itemsPerPage?: number;
    items?: Array<Record<string, unknown>>;
  };

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: BunnyVideoDetails[] = rawItems.map((item) => {
    const guid = String(item.guid || "");
    const length = Number(item.length || 0);
    const status = Number(item.status);
    const embedUrl = `https://iframe.mediadelivery.net/embed/${targetLibraryId}/${guid}`;
    const statusLabel =
      status === 4 ? "ready" :
      status === 5 ? "error" :
      status === 3 ? "transcoding" :
      status === 2 ? "processing" :
      status === 1 ? "uploaded" : "created";

    return {
      videoId: guid,
      libraryId: targetLibraryId,
      title: String(item.title || "Untitled"),
      status,
      statusLabel,
      isReady: status === 4,
      lengthSeconds: length,
      durationFormatted: formatBunnyDuration(length),
      encodeProgress: Number(item.encodeProgress || 0),
      embedUrl,
      signedEmbedUrl: signBunnyEmbedUrl(embedUrl),
      dateUploaded: String(item.dateUploaded || ""),
      views: Number(item.views || 0),
    };
  });

  return {
    totalItems: Number(data.totalItems || items.length),
    currentPage: Number(data.currentPage || 1),
    itemsPerPage: Number(data.itemsPerPage || 50),
    items,
  };
}

/**
 * Deletes a video from Bunny Stream.
 */
export async function deleteBunnyVideo(
  videoId: string,
  libraryId?: string,
): Promise<{ success: boolean; videoId: string }> {
  const config = getBunnyConfig();
  const targetLibraryId = (libraryId || config.libraryId).trim();
  if (!config.apiKey || !targetLibraryId) {
    throw new ApiError(503, "Bunny Stream credentials are not configured.");
  }

  const res = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(targetLibraryId)}/videos/${encodeURIComponent(videoId)}`, {
    method: "DELETE",
    headers: {
      AccessKey: config.apiKey,
      accept: "application/json",
    },
  });

  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => "");
    throw new ApiError(res.status, `Bunny Stream failed to delete video${detail ? `: ${detail}` : "."}`);
  }

  return { success: true, videoId };
}

/**
 * Processes incoming webhook events from Bunny Stream.
 * When a video finishes transcoding (Status = 4), automatically updates
 * any corresponding lesson or course duration and metadata in the database.
 */
export async function processBunnyWebhook(payload: BunnyWebhookPayload): Promise<{
  received: boolean;
  videoGuid?: string;
  status?: number;
  isFinished?: boolean;
  durationFormatted?: string;
  updatedLessonsCount: number;
  updatedShopItemsCount: number;
}> {
  if (!payload || !payload.VideoGuid) {
    return {
      received: true,
      updatedLessonsCount: 0,
      updatedShopItemsCount: 0,
    };
  }

  const videoGuid = String(payload.VideoGuid).trim();
  const status = Number(payload.Status);
  const totalLength = Number(payload.TotalLength || 0);
  const durationFormatted = formatBunnyDuration(totalLength);
  const isFinished = status === 4;

  let updatedLessonsCount = 0;
  let updatedShopItemsCount = 0;

  if (isFinished && totalLength > 0) {
    try {
      // 1. Check classroom lessons
      const lessonSnapshot = await db().collection("lessons").get();
      for (const doc of lessonSnapshot.docs) {
        const lesson = doc.data();
        if (lesson?.videoUrl && typeof lesson.videoUrl === "string" && lesson.videoUrl.includes(videoGuid)) {
          await db().collection("lessons").doc(doc.id).update({
            duration: durationFormatted,
          });

          // Also update parent course module summary if present
          if (lesson.moduleId) {
            const modDoc = await db().collection("modules").doc(String(lesson.moduleId)).get();
            const modData = modDoc.data();
            if (Array.isArray(modData?.lessons)) {
              const updated = modData.lessons.map((les: Record<string, unknown>) =>
                les.id === doc.id ? { ...les, duration: durationFormatted } : les,
              );
              await db().collection("modules").doc(String(lesson.moduleId)).update({
                lessons: updated,
              });
            }
          }
          updatedLessonsCount++;
        }
      }

      // 2. Check shop courses
      const shopSnapshot = await db().collection("shopItems").get();
      for (const doc of shopSnapshot.docs) {
        const item = doc.data();
        let changed = false;
        if (Array.isArray(item?.curriculum)) {
          const updatedCurriculum = (item.curriculum as ShopCourseModule[]).map((mod) => ({
            ...mod,
            lessons: (mod.lessons || []).map((les) => {
              if (les.videoUrl && les.videoUrl.includes(videoGuid)) {
                changed = true;
                return { ...les, duration: durationFormatted };
              }
              return les;
            }),
          }));

          if (changed) {
            await db().collection("shopItems").doc(doc.id).update({
              curriculum: updatedCurriculum,
            });
            updatedShopItemsCount++;
          }
        }
      }
    } catch (err) {
      console.error("Error updating lessons from Bunny Stream webhook:", err);
    }
  }

  return {
    received: true,
    videoGuid,
    status,
    isFinished,
    durationFormatted,
    updatedLessonsCount,
    updatedShopItemsCount,
  };
}
