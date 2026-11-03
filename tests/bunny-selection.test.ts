import { describe, expect, it } from "vitest";
import { applyBunnyVideo, curriculumDuration } from "../src/lib/bunny-selection";
import type { ShopCourseModule } from "../src/lib/types";

describe("Bunny metadata in course lessons", () => {
  it("replaces the lesson title, duration and video together while preserving lesson work", () => {
    const lesson = { title: "New Topic", videoUrl: "old", duration: "10:00", content: "My notes", resources: ["notes.pdf"] };
    expect(applyBunnyVideo(lesson, {
      title: "Intro to design", embedUrl: "https://iframe.mediadelivery.net/embed/123/video",
      durationFormatted: "8:24",
    })).toEqual({ ...lesson, title: "Intro to design", videoUrl: "https://iframe.mediadelivery.net/embed/123/video", duration: "8:24" });
  });

  it("preserves existing metadata if a selection has no title or duration", () => {
    const lesson = { title: "My lesson", videoUrl: "old", duration: "8:24" };
    expect(applyBunnyVideo(lesson, { embedUrl: "new" })).toEqual({ ...lesson, videoUrl: "new" });
  });

  const modules = (durations: string[]): ShopCourseModule[] => [{
    id: "chapter", title: "Chapter", order: 1,
    lessons: durations.map((duration, order) => ({ id: `lesson-${order}`, title: "Lesson", videoUrl: "video", duration, content: "", isFreePreview: false, order })),
  }];

  it("sums lesson lengths across minute and hour boundaries", () => {
    expect(curriculumDuration(modules(["58:40", "2:30", "1:00:00"])) ).toBe("2:01:10");
  });

  it("does not replace the course estimate when a lesson duration is missing or invalid", () => {
    for (const values of [[], ["8:24", ""], ["8:24", "5 minutes"], ["1:99"]]) {
      expect(curriculumDuration(modules(values))).toBeUndefined();
    }
  });
});
