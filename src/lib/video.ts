/**
 * Universal video embed utilities.
 * Supports extracting URLs from iframe snippets and normalizing video links
 * from YouTube, Vimeo, Loom, Google Drive, Bunny Stream, Wistia, Dailymotion,
 * direct video files (MP4, WebM, OGG), and generic HTTPS players.
 */

/**
 * Extracts a clean URL from a string that might be a raw URL or an <iframe> embed snippet.
 */
export function extractVideoUrl(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();

  // If the user pasted an HTML iframe snippet, e.g. <iframe ... src="https://..." ...></iframe>
  const iframeSrcMatch = trimmed.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframeSrcMatch && iframeSrcMatch[1]) {
    return iframeSrcMatch[1].trim();
  }

  // Otherwise, return trimmed string
  return trimmed;
}

export interface VideoEmbedResult {
  embedUrl: string;
  isDirectVideo: boolean;
  provider:
    | "youtube"
    | "vimeo"
    | "loom"
    | "googledrive"
    | "bunnystream"
    | "wistia"
    | "dailymotion"
    | "direct"
    | "generic"
    | "none";
}

const DIRECT_VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".ogg",
  ".mov",
  ".m4v",
  ".mkv",
];

/**
 * Normalizes video inputs (URLs or iframe embed code) into an embeddable URL or direct video stream.
 */
export function getVideoEmbed(rawInput: string): VideoEmbedResult {
  const extracted = extractVideoUrl(rawInput);
  if (!extracted) {
    return { embedUrl: "", isDirectVideo: false, provider: "none" };
  }

  // Check if it's a direct video link based on path extension
  try {
    const urlObj = new URL(extracted);
    const pathname = urlObj.pathname.toLowerCase();
    if (DIRECT_VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
      return {
        embedUrl: urlObj.href,
        isDirectVideo: true,
        provider: "direct",
      };
    }
  } catch {
    // If URL parsing fails at this stage, check extension before returning none
    const lower = extracted.toLowerCase();
    if (DIRECT_VIDEO_EXTENSIONS.some((ext) => lower.split("?")[0].endsWith(ext))) {
      return {
        embedUrl: extracted,
        isDirectVideo: true,
        provider: "direct",
      };
    }
    return { embedUrl: "", isDirectVideo: false, provider: "none" };
  }

  let parsed: URL;
  try {
    parsed = new URL(extracted);
  } catch {
    return { embedUrl: "", isDirectVideo: false, provider: "none" };
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  // 1. YouTube
  // Matches: youtube.com, www.youtube.com, m.youtube.com, music.youtube.com, youtu.be, youtube-nocookie.com
  if (
    host === "youtu.be" ||
    host.includes("youtube.com") ||
    host.includes("youtube-nocookie.com")
  ) {
    let videoId = "";
    if (host === "youtu.be") {
      // Path: /<id>
      videoId = path.slice(1).split("/")[0] || "";
    } else if (path.startsWith("/embed/")) {
      videoId = path.split("/")[2] || "";
    } else if (path.startsWith("/shorts/")) {
      videoId = path.split("/")[2] || "";
    } else if (path.startsWith("/live/")) {
      videoId = path.split("/")[2] || "";
    } else if (path.startsWith("/v/")) {
      videoId = path.split("/")[2] || "";
    } else {
      // e.g. /watch?v=VIDEO_ID
      videoId = parsed.searchParams.get("v") || "";
    }

    // Clean videoId (remove query or trailing hash if present)
    videoId = videoId.replace(/[^a-zA-Z0-9_-]/g, "");

    if (videoId) {
      // Optional start time (t= or start=)
      const startParam =
        parsed.searchParams.get("start") ||
        parsed.searchParams.get("t")?.replace("s", "") ||
        "";
      const query = startParam && /^\d+$/.test(startParam) ? `?start=${startParam}` : "";
      return {
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}${query}`,
        isDirectVideo: false,
        provider: "youtube",
      };
    }
  }

  // 2. Vimeo
  // Matches: vimeo.com/123456789, player.vimeo.com/video/123456789
  if (host.includes("vimeo.com")) {
    const vimeoMatch = path.match(/(?:\/video\/|\/)(\d+)/);
    if (vimeoMatch && vimeoMatch[1]) {
      return {
        embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
        isDirectVideo: false,
        provider: "vimeo",
      };
    }
  }

  // 3. Loom
  // Matches: loom.com/share/ID, loom.com/embed/ID
  if (host.includes("loom.com")) {
    const loomMatch = path.match(/(?:\/share\/|\/embed\/)([a-zA-Z0-9]+)/);
    if (loomMatch && loomMatch[1]) {
      return {
        embedUrl: `https://www.loom.com/embed/${loomMatch[1]}`,
        isDirectVideo: false,
        provider: "loom",
      };
    }
  }

  // 4. Google Drive
  // Matches: drive.google.com/file/d/ID/view, /preview, or /open?id=ID
  if (host.includes("drive.google.com")) {
    const driveMatch = path.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const driveId = driveMatch ? driveMatch[1] : parsed.searchParams.get("id");
    if (driveId) {
      return {
        embedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
        isDirectVideo: false,
        provider: "googledrive",
      };
    }
  }

  // 5. Bunny Stream / BunnyCDN
  // Host: iframe.mediadelivery.net or video.bunnycdn.com
  if (host.includes("mediadelivery.net") || host.includes("bunnycdn.com")) {
    return {
      embedUrl: parsed.href,
      isDirectVideo: false,
      provider: "bunnystream",
    };
  }

  // 6. Wistia
  // Matches: fast.wistia.net/embed/iframe/ID or *.wistia.com/medias/ID
  if (host.includes("wistia.net") || host.includes("wistia.com")) {
    const wistiaMatch = path.match(/(?:\/iframe\/|\/medias\/)([a-zA-Z0-9]+)/);
    if (wistiaMatch && wistiaMatch[1]) {
      return {
        embedUrl: `https://fast.wistia.net/embed/iframe/${wistiaMatch[1]}`,
        isDirectVideo: false,
        provider: "wistia",
      };
    }
    return {
      embedUrl: parsed.href,
      isDirectVideo: false,
      provider: "wistia",
    };
  }

  // 7. Dailymotion
  // Matches: dailymotion.com/video/ID, dai.ly/ID
  if (host.includes("dailymotion.com") || host === "dai.ly") {
    let dmId = "";
    if (host === "dai.ly") {
      dmId = path.slice(1).split("/")[0] || "";
    } else {
      const dmMatch = path.match(/\/video\/([a-zA-Z0-9]+)/);
      if (dmMatch) dmId = dmMatch[1];
    }
    if (dmId) {
      return {
        embedUrl: `https://www.dailymotion.com/embed/video/${dmId}`,
        isDirectVideo: false,
        provider: "dailymotion",
      };
    }
  }

  // 8. Generic HTTPS Fallback
  // If it is a valid HTTPS link, allow embedding inside iframe player so custom school players or video links work!
  if (parsed.protocol === "https:") {
    return {
      embedUrl: parsed.href,
      isDirectVideo: false,
      provider: "generic",
    };
  }

  return { embedUrl: "", isDirectVideo: false, provider: "none" };
}
