import { describe, expect, it } from "vitest";
import { extractVideoUrl, getVideoEmbed } from "../src/lib/video";

describe("extractVideoUrl", () => {
  it("extracts URL from YouTube iframe embed snippet", () => {
    const iframe = `<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=abcdef" title="YouTube video player" frameborder="0" allowfullscreen></iframe>`;
    expect(extractVideoUrl(iframe)).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?si=abcdef",
    );
  });

  it("extracts URL from Vimeo iframe snippet with single quotes", () => {
    const iframe = `<iframe src='https://player.vimeo.com/video/76979871' width='640' height='360'></iframe>`;
    expect(extractVideoUrl(iframe)).toBe(
      "https://player.vimeo.com/video/76979871",
    );
  });

  it("handles clean URLs and trims whitespace", () => {
    expect(
      extractVideoUrl("  https://www.youtube.com/watch?v=dQw4w9WgXcQ  "),
    ).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("handles empty or blank string", () => {
    expect(extractVideoUrl("")).toBe("");
  });
});

describe("getVideoEmbed", () => {
  it("normalizes standard YouTube watch URL", () => {
    const result = getVideoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(result.isDirectVideo).toBe(false);
    expect(result.provider).toBe("youtube");
  });

  it("normalizes youtu.be short URL", () => {
    const result = getVideoEmbed("https://youtu.be/dQw4w9WgXcQ");
    expect(result.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(result.provider).toBe("youtube");
  });

  it("normalizes YouTube shorts URL", () => {
    const result = getVideoEmbed(
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    );
    expect(result.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(result.provider).toBe("youtube");
  });

  it("normalizes YouTube live URL", () => {
    const result = getVideoEmbed(
      "https://www.youtube.com/live/dQw4w9WgXcQ?feature=share",
    );
    expect(result.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(result.provider).toBe("youtube");
  });

  it("extracts from raw iframe string and normalizes to embed", () => {
    const iframe = `<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video player" frameborder="0" allowfullscreen></iframe>`;
    const result = getVideoEmbed(iframe);
    expect(result.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(result.provider).toBe("youtube");
  });

  it("normalizes Vimeo standard link", () => {
    const result = getVideoEmbed("https://vimeo.com/76979871");
    expect(result.embedUrl).toBe("https://player.vimeo.com/video/76979871");
    expect(result.provider).toBe("vimeo");
  });

  it("normalizes Loom share link", () => {
    const result = getVideoEmbed(
      "https://www.loom.com/share/e1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6",
    );
    expect(result.embedUrl).toBe(
      "https://www.loom.com/embed/e1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6",
    );
    expect(result.provider).toBe("loom");
  });

  it("normalizes Google Drive share link", () => {
    const result = getVideoEmbed(
      "https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0/view?usp=sharing",
    );
    expect(result.embedUrl).toBe(
      "https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0/preview",
    );
    expect(result.provider).toBe("googledrive");
  });

  it("supports Bunny Stream URLs", () => {
    const result = getVideoEmbed(
      "https://iframe.mediadelivery.net/embed/1234/5678-abcd",
    );
    expect(result.embedUrl).toBe(
      "https://iframe.mediadelivery.net/embed/1234/5678-abcd",
    );
    expect(result.provider).toBe("bunnystream");
  });

  it("supports Wistia links", () => {
    const result = getVideoEmbed("https://cleanbrand.wistia.com/medias/abc123xyz");
    expect(result.embedUrl).toBe(
      "https://fast.wistia.net/embed/iframe/abc123xyz",
    );
    expect(result.provider).toBe("wistia");
  });

  it("supports Dailymotion links", () => {
    const result = getVideoEmbed("https://www.dailymotion.com/video/x7tgad0");
    expect(result.embedUrl).toBe(
      "https://www.dailymotion.com/embed/video/x7tgad0",
    );
    expect(result.provider).toBe("dailymotion");
  });

  it("detects direct MP4 files for native HTML5 video player", () => {
    const result = getVideoEmbed("https://example.com/assets/lesson-01.mp4");
    expect(result.embedUrl).toBe("https://example.com/assets/lesson-01.mp4");
    expect(result.isDirectVideo).toBe(true);
    expect(result.provider).toBe("direct");
  });

  it("handles generic HTTPS embed URLs gracefully", () => {
    const result = getVideoEmbed("https://player.custom-lms.com/embed/4819");
    expect(result.embedUrl).toBe("https://player.custom-lms.com/embed/4819");
    expect(result.isDirectVideo).toBe(false);
    expect(result.provider).toBe("generic");
  });

  it("returns none for empty input", () => {
    const result = getVideoEmbed("");
    expect(result.embedUrl).toBe("");
    expect(result.provider).toBe("none");
  });
});
