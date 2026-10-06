import "server-only";
import { createHash } from "node:crypto";
import type { ShopCourseModule } from "@/lib/types";

export interface BunnyVideoInfo {
  libraryId: string;
  videoId: string;
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
 * returns the original URL gracefully to ensure full backward compatibility.
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
    // Token authentication is not enabled or key is not set; return clean URL
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
    // Normalize to standard iframe embed host and path if using legacy play path
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
