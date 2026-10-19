import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { ShopCourseModule } from "../src/lib/types";

const state = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../src/server/supabase", () => {
  const reference = (path: string) => ({
    path,
    id: path.split("/").pop(),
    get: async () => ({
      id: path.split("/").pop(),
      exists: state.documents.has(path),
      data: () => state.documents.get(path),
    }),
    update: async (value: Record<string, unknown>) => {
      state.documents.set(path, { ...state.documents.get(path), ...value });
    },
  });

  const collection = (name: string) => ({
    doc: (id: string) => reference(`${name}/${id}`),
    get: async () => ({
      docs: [...state.documents.entries()]
        .filter(([path]) => path.startsWith(`${name}/`))
        .map(([path, value]) => ({
          id: path.split("/").pop(),
          exists: true,
          data: () => value,
        })),
    }),
  });

  return {
    db: () => ({ collection }),
    store: { collection },
  };
});

import {
  parseBunnyVideoInfo,
  cleanBunnyUrl,
  signBunnyEmbedUrl,
  signCurriculumBunnyUrls,
  formatBunnyDuration,
  getBunnyDirectUploadSignature,
  createBunnyVideo,
  fetchBunnyVideo,
  getBunnyVideo,
  listBunnyVideos,
  deleteBunnyVideo,
  processBunnyWebhook,
} from "../src/server/bunny";

beforeEach(() => {
  state.documents.clear();
  vi.stubEnv("BUNNY_STREAM_API_KEY", "test-bunny-api-key");
  vi.stubEnv("BUNNY_STREAM_LIBRARY_ID", "12345");
  vi.stubEnv("BUNNY_STREAM_TOKEN_AUTH_KEY", "test-token-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("bunny stream token authentication & url utilities", () => {
  it("parses library ID and video GUID from various Bunny embed formats", () => {
    expect(
      parseBunnyVideoInfo(
        "https://iframe.mediadelivery.net/embed/123456/a1b2c3d4-e5f6-7890",
      ),
    ).toEqual({
      libraryId: "123456",
      videoId: "a1b2c3d4-e5f6-7890",
    });

    expect(
      parseBunnyVideoInfo(
        "https://video.bunnycdn.com/play/789/video_999-xyz",
      ),
    ).toEqual({
      libraryId: "789",
      videoId: "video_999-xyz",
    });

    expect(
      parseBunnyVideoInfo(
        '<iframe src="https://iframe.mediadelivery.net/embed/123456/a1b2c3d4-e5f6-7890?autoplay=true" width="100%"></iframe>',
      ),
    ).toEqual({
      libraryId: "123456",
      videoId: "a1b2c3d4-e5f6-7890",
    });

    expect(parseBunnyVideoInfo("https://youtube.com/watch?v=123")).toBeNull();
    expect(parseBunnyVideoInfo("https://vimeo.com/123456")).toBeNull();
    expect(parseBunnyVideoInfo("")).toBeNull();
  });

  it("strips temporary tokens and expiration timestamps to keep canonical URLs clean", () => {
    const signed =
      "https://iframe.mediadelivery.net/embed/123456/video-id-1?token=abcdef123456&expires=1700000000&autoplay=true";
    const cleaned = cleanBunnyUrl(signed);
    expect(cleaned).toContain("/embed/123456/video-id-1");
    expect(cleaned).not.toContain("token=");
    expect(cleaned).not.toContain("expires=");
    expect(cleaned).toContain("autoplay=true");

    expect(cleanBunnyUrl("https://youtube.com/watch?v=123")).toBe(
      "https://youtube.com/watch?v=123",
    );
  });

  it("returns clean URL unmodified when no token security key is configured", () => {
    const raw = "https://iframe.mediadelivery.net/embed/123456/my-video";
    const signed = signBunnyEmbedUrl(raw, { tokenKey: "" });
    expect(signed).toBe("https://iframe.mediadelivery.net/embed/123456/my-video");
  });

  it("generates a mathematically verified SHA256 signed embed URL when key is provided", () => {
    const raw = "https://iframe.mediadelivery.net/embed/123456/test-video-uuid";
    const key = "super-secret-bunny-key";
    const expiresIn = 3600;

    const before = Math.floor(Date.now() / 1000) + expiresIn;
    const signed = signBunnyEmbedUrl(raw, {
      tokenKey: key,
      expiresInSeconds: expiresIn,
    });
    const after = Math.floor(Date.now() / 1000) + expiresIn;

    const parsed = new URL(signed);
    expect(parsed.hostname).toBe("iframe.mediadelivery.net");
    expect(parsed.pathname).toBe("/embed/123456/test-video-uuid");

    const token = parsed.searchParams.get("token");
    const expiresStr = parsed.searchParams.get("expires");

    expect(token).toBeDefined();
    expect(expiresStr).toBeDefined();

    const expires = Number(expiresStr);
    expect(expires).toBeGreaterThanOrEqual(before);
    expect(expires).toBeLessThanOrEqual(after);

    // Verify SHA256 formula: SHA256_HEX(token_security_key + video_id + expiration_timestamp)
    const expectedHash = createHash("sha256")
      .update(`${key}test-video-uuid${expires}`)
      .digest("hex");
    expect(token).toBe(expectedHash);
  });

  it("normalizes legacy /play/ path to /embed/ upon signing", () => {
    const raw = "https://video.bunnycdn.com/play/100/my-clip";
    const signed = signBunnyEmbedUrl(raw, { tokenKey: "key123" });
    const parsed = new URL(signed);
    expect(parsed.pathname).toBe("/embed/100/my-clip");
    expect(parsed.searchParams.has("token")).toBe(true);
  });

  it("signs all Bunny video URLs inside a course curriculum structure", () => {
    const curriculum: ShopCourseModule[] = [
      {
        id: "m1",
        title: "Module 1",
        order: 1,
        lessons: [
          {
            id: "l1",
            title: "Lesson 1",
            duration: "10:00",
            videoUrl:
              "https://iframe.mediadelivery.net/embed/555/lesson-1-guid",
            content: "Notes 1",
            resources: [],
            isFreePreview: true,
            order: 1,
          },
          {
            id: "l2",
            title: "Lesson 2",
            duration: "15:00",
            videoUrl: "https://www.youtube.com/watch?v=youtube-id",
            content: "Notes 2",
            resources: [],
            isFreePreview: false,
            order: 2,
          },
        ],
      },
    ];

    const signedCurriculum = signCurriculumBunnyUrls(curriculum, {
      tokenKey: "key-xyz",
    });

    const l1Video = signedCurriculum[0].lessons[0].videoUrl;
    const l2Video = signedCurriculum[0].lessons[1].videoUrl;

    expect(l1Video).toContain("token=");
    expect(l1Video).toContain("expires=");
    expect(l2Video).toBe("https://www.youtube.com/watch?v=youtube-id");
  });
});

describe("bunny stream duration formatting", () => {
  it("formats zero and small seconds correctly into mm:ss", () => {
    expect(formatBunnyDuration(0)).toBe("0:00");
    expect(formatBunnyDuration(45)).toBe("0:45");
    expect(formatBunnyDuration(75)).toBe("1:15");
    expect(formatBunnyDuration(605)).toBe("10:05");
  });

  it("formats hours, minutes, and seconds correctly into hh:mm:ss", () => {
    expect(formatBunnyDuration(3600)).toBe("1:00:00");
    expect(formatBunnyDuration(3665)).toBe("1:01:05");
    expect(formatBunnyDuration(7325)).toBe("2:02:05");
  });

  it("handles negative and non-numeric inputs gracefully", () => {
    expect(formatBunnyDuration(-10)).toBe("0:00");
    expect(formatBunnyDuration(NaN)).toBe("0:00");
  });
});

describe("bunny direct upload signature generation", () => {
  it("generates correct SHA256 authorization signature for direct browser upload", () => {
    const videoId = "video-uuid-12345";
    const creds = getBunnyDirectUploadSignature(videoId, "12345", 3600);

    expect(creds.libraryId).toBe("12345");
    expect(creds.videoId).toBe(videoId);
    expect(creds.directPutUrl).toBe("https://video.bunnycdn.com/library/12345/videos/video-uuid-12345");
    expect(creds.uploadEndpoint).toBe("https://video.bunnycdn.com/tusupload");

    const expectedHash = createHash("sha256")
      .update(`12345test-bunny-api-key${creds.authorizationExpire}${videoId}`)
      .digest("hex");
    expect(creds.authorizationSignature).toBe(expectedHash);
  });

  it("throws ApiError if Bunny Stream credentials are not configured", () => {
    vi.stubEnv("BUNNY_STREAM_API_KEY", "");
    expect(() => getBunnyDirectUploadSignature("video-id")).toThrow(/required for direct upload/);
  });
});

describe("bunny stream API interactions", () => {
  it("creates a new video object in Bunny Stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://video.bunnycdn.com/library/12345/videos");
        expect(init?.method).toBe("POST");
        expect((init?.headers as Record<string, string>)?.AccessKey).toBe("test-bunny-api-key");
        return Response.json({
          guid: "new-guid-abc",
          title: "Introduction to Next.js",
        });
      }),
    );

    const result = await createBunnyVideo("Introduction to Next.js");
    expect(result.videoId).toBe("new-guid-abc");
    expect(result.libraryId).toBe("12345");
    expect(result.embedUrl).toBe("https://iframe.mediadelivery.net/embed/12345/new-guid-abc");
    expect(result.signedEmbedUrl).toContain("token=");
  });

  it("fetches / ingests a video from a remote URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://video.bunnycdn.com/library/12345/videos/fetch");
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body));
        expect(body.url).toBe("https://example.com/lecture.mp4");
        expect(body.title).toBe("Ingested Lecture");
        return Response.json({
          id: "ingested-guid-999",
          success: true,
        });
      }),
    );

    const result = await fetchBunnyVideo("https://example.com/lecture.mp4", "Ingested Lecture");
    expect(result.videoId).toBe("ingested-guid-999");
    expect(result.embedUrl).toBe("https://iframe.mediadelivery.net/embed/12345/ingested-guid-999");
  });

  it("retrieves video details and maps transcoding status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toBe("https://video.bunnycdn.com/library/12345/videos/status-guid-111");
        return Response.json({
          guid: "status-guid-111",
          title: "Masterclass Video",
          status: 4,
          length: 450,
          encodeProgress: 100,
          views: 42,
          storageSize: 104857600,
        });
      }),
    );

    const video = await getBunnyVideo("status-guid-111");
    expect(video.videoId).toBe("status-guid-111");
    expect(video.title).toBe("Masterclass Video");
    expect(video.status).toBe(4);
    expect(video.statusLabel).toBe("ready");
    expect(video.isReady).toBe(true);
    expect(video.durationFormatted).toBe("7:30");
    expect(video.signedEmbedUrl).toContain("token=");
    expect(video.hlsUrl).toContain("status-guid-111/playlist.m3u8");
  });

  it("lists videos with search filter and pagination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const parsed = new URL(url);
        expect(parsed.searchParams.get("search")).toBe("typescript");
        expect(parsed.searchParams.get("page")).toBe("1");
        return Response.json({
          totalItems: 1,
          currentPage: 1,
          itemsPerPage: 10,
          items: [
            {
              guid: "ts-video-1",
              title: "TypeScript Deep Dive",
              status: 4,
              length: 1200,
              views: 15,
            },
          ],
        });
      }),
    );

    const result = await listBunnyVideos({ search: "typescript", page: 1, perPage: 10 });
    expect(result.totalItems).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].videoId).toBe("ts-video-1");
    expect(result.items[0].durationFormatted).toBe("20:00");
    expect(result.items[0].statusLabel).toBe("ready");
  });

  it("deletes a video from Bunny Stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://video.bunnycdn.com/library/12345/videos/del-guid-555");
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 200 });
      }),
    );

    const result = await deleteBunnyVideo("del-guid-555");
    expect(result.success).toBe(true);
    expect(result.videoId).toBe("del-guid-555");
  });
});

describe("bunny stream webhook processing & automatic duration syncing", () => {
  it("updates lesson duration and course curriculum when video finishes transcoding (status 4)", async () => {
    const targetGuid = "finished-video-uuid-888";

    // Setup classroom lesson doc
    state.documents.set("lessons/lesson-101", {
      id: "lesson-101",
      title: "Docker Fundamentals",
      videoUrl: `https://iframe.mediadelivery.net/embed/12345/${targetGuid}`,
      duration: "0:00",
      moduleId: "mod-docker",
    });

    // Setup parent module doc
    state.documents.set("modules/mod-docker", {
      id: "mod-docker",
      title: "DevOps Track",
      lessons: [
        {
          id: "lesson-101",
          title: "Docker Fundamentals",
          duration: "0:00",
        },
      ],
    });

    // Setup shop item doc
    state.documents.set("shopItems/shop-course-1", {
      id: "shop-course-1",
      title: "Fullstack Masterclass",
      curriculum: [
        {
          id: "m1",
          title: "Module 1",
          order: 1,
          lessons: [
            {
              id: "sl-1",
              title: "Intro",
              duration: "0:00",
              videoUrl: `https://iframe.mediadelivery.net/embed/12345/${targetGuid}`,
            },
          ],
        },
      ],
    });

    const result = await processBunnyWebhook({
      VideoLibraryId: 12345,
      VideoGuid: targetGuid,
      Status: 4, // Transcoded / Finished
      TotalLength: 945, // 15 mins 45 secs
    });

    expect(result.received).toBe(true);
    expect(result.isFinished).toBe(true);
    expect(result.durationFormatted).toBe("15:45");
    expect(result.updatedLessonsCount).toBe(1);
    expect(result.updatedShopItemsCount).toBe(1);

    // Verify classroom lesson was updated
    const updatedLesson = state.documents.get("lessons/lesson-101");
    expect(updatedLesson?.duration).toBe("15:45");

    // Verify module summary was updated
    const updatedModule = state.documents.get("modules/mod-docker");
    const moduleLessons = updatedModule?.lessons as Array<{ id: string; duration: string }>;
    expect(moduleLessons[0].duration).toBe("15:45");

    // Verify shop item curriculum was updated
    const updatedShop = state.documents.get("shopItems/shop-course-1");
    const curriculum = updatedShop?.curriculum as ShopCourseModule[];
    expect(curriculum[0].lessons[0].duration).toBe("15:45");
  });

  it("does not update records when status is still processing or transcoding (status != 4)", async () => {
    const targetGuid = "pending-video-uuid-222";

    state.documents.set("lessons/lesson-pending", {
      id: "lesson-pending",
      title: "Kubernetes Deep Dive",
      videoUrl: `https://iframe.mediadelivery.net/embed/12345/${targetGuid}`,
      duration: "0:00",
    });

    const result = await processBunnyWebhook({
      VideoLibraryId: 12345,
      VideoGuid: targetGuid,
      Status: 3, // Transcoding in progress
      TotalLength: 600,
    });

    expect(result.isFinished).toBe(false);
    expect(result.updatedLessonsCount).toBe(0);
    expect(result.updatedShopItemsCount).toBe(0);

    const lesson = state.documents.get("lessons/lesson-pending");
    expect(lesson?.duration).toBe("0:00");
  });

  it("handles empty or invalid webhook payloads gracefully", async () => {
    const result = await processBunnyWebhook({} as never);
    expect(result.received).toBe(true);
    expect(result.updatedLessonsCount).toBe(0);
    expect(result.updatedShopItemsCount).toBe(0);
  });
});
