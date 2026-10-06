import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
vi.mock("server-only", () => ({}));
import {
  parseBunnyVideoInfo,
  cleanBunnyUrl,
  signBunnyEmbedUrl,
  signCurriculumBunnyUrls,
} from "../src/server/bunny";
import type { ShopCourseModule } from "../src/lib/types";

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
