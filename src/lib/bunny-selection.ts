import type { ShopCourseModule } from "./types";

export interface SelectedBunnyMetadata {
  embedUrl: string;
  title?: string;
  durationFormatted?: string;
}

export function applyBunnyVideo<T extends { title: string; duration: string; videoUrl: string }>(
  lesson: T,
  video: SelectedBunnyMetadata,
): T {
  return {
    ...lesson,
    title: video.title?.trim() || lesson.title,
    videoUrl: video.embedUrl,
    duration: video.durationFormatted || lesson.duration,
  };
}

// Only replace a course's manual estimate when every lesson has a measured duration.
export function curriculumDuration(modules: ShopCourseModule[]): string | undefined {
  const lessons = modules.flatMap((module) => module.lessons || []);
  if (!lessons.length) return undefined;
  let seconds = 0;
  for (const lesson of lessons) {
    if (!/^\d+:\d{2}(?::\d{2})?$/.test(lesson.duration || "")) return undefined;
    const parts = lesson.duration.split(":").map(Number);
    if (parts.slice(1).some((part) => part >= 60)) return undefined;
    seconds += parts.reduce((total, part) => total * 60 + part, 0);
  }
  if (seconds <= 0) return undefined;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}
