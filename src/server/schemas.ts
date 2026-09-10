import { z } from "zod";
import { extractVideoUrl } from "../lib/video";
import { TRACK_IDS } from "./policy";
export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/);
const optionalId = z.preprocess(
  (value) => (value === "" ? undefined : value),
  id.optional(),
);
export const track = z.enum(TRACK_IDS);
export const audience = z.union([track, z.literal("all")]);
export const short = z.string().trim().min(1).max(200);
export const body = z.string().trim().min(1).max(30000);
export const url = z
  .string()
  .url()
  .max(2000)
  .refine((s) => /^https:\/\//i.test(s), "Use an HTTPS URL.");
export const optionalUrl = z.union([url, z.literal("")]).optional();
export const videoUrlInput = z.preprocess(
  (val) => (typeof val === "string" ? extractVideoUrl(val) : val),
  url,
);
export const optionalVideoUrlInput = z.preprocess(
  (val) => (typeof val === "string" ? extractVideoUrl(val) : val),
  optionalUrl,
);
export const date = z
  .string()
  .max(40)
  .refine((s) => Number.isFinite(Date.parse(s)), "Choose a valid date.");
export const timeZone = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone.");
export const birthday = z
  .object({
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  })
  .refine(({ month, day }) => {
    const date = new Date(Date.UTC(2000, month - 1, day));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }, "Choose a valid birthday.");
export const moduleSchema = z.object({
  id: optionalId,
  classId: track,
  title: short,
  description: z.string().max(5000),
  order: z.number().int().min(0).max(10000),
  published: z.boolean(),
  free: z.boolean(),
});
export const lessonSchema = z.object({
  id: optionalId,
  moduleId: id,
  classId: track,
  title: short,
  duration: z.string().max(40),
  videoUrl: optionalVideoUrlInput.default(""),
  content: z.string().max(100000),
  initialCode: z.string().max(50000).optional(),
  solutionCode: z.string().max(50000).optional(),
  order: z.number().int().min(0).max(10000),
  published: z.boolean(),
  free: z.boolean(),
  resources: z
    .array(z.object({ title: short, url }))
    .max(30)
    .optional(),
});
export const classPostSchema = z.object({
  classId: track,
  moduleId: optionalId,
  assignmentId: optionalId,
  title: short,
  content: z.string().trim().min(1).max(100000),
  videoUrl: videoUrlInput,
  duration: z.string().trim().max(40).default("Self-paced"),
  free: z.boolean().default(false),
  resources: z
    .array(z.object({ title: short, url }))
    .max(30)
    .default([]),
});
export const classUpdateSchema = z.object({
  id,
  post: classPostSchema,
});
export const assignmentSchema = z.object({
  id: optionalId,
  classId: track,
  title: short,
  description: body,
  dueDate: date,
  totalPoints: z.literal(100).default(100),
  milestones: z
    .array(z.object({ title: short, dueDate: date }))
    .max(30)
    .optional(),
  published: z.boolean().default(false),
  starter: z.boolean().default(false),
});
export const submissionSchema = z.object({
  id: optionalId,
  assignmentId: id,
  repoUrl: optionalUrl,
  liveUrl: optionalUrl,
  writeUp: z.string().max(50000),
  attachments: z.array(z.string().max(2000)).max(10).default([]),
  status: z.enum(["draft", "submitted"]),
});
export const sessionSchema = z
  .object({
    id: optionalId,
    title: short,
    description: z.string().max(5000),
    classId: audience,
    startsAt: date,
    endsAt: date,
    url,
    recordingUrl: optionalUrl.default(""),
    host: short,
  })
  .refine(
    (v) => Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "End time must follow start time.",
  );
export const settingsSchema = z.object({
  academyName: short.optional(),
  supportEmail: z.email().optional(),
  enrollmentOpen: z.boolean().optional(),
  scholarshipGoal: z.number().min(0).max(1000000000).optional(),
  scholarshipCost: z.number().positive().max(10000000).optional(),
  announcement: z.string().max(2000).optional(),
  whatsappGroupUrl: z
    .union([
      z
        .string()
        .url()
        .max(500)
        .refine(
          (value) => /^https:\/\/chat\.whatsapp\.com\//i.test(value),
          "Use a WhatsApp group invite link beginning with https://chat.whatsapp.com/.",
        ),
      z.literal(""),
    ])
    .optional(),
});

export const shopItemSlug = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens (e.g. ai-masterclass).");

export const shopCourseLessonResourceSchema = z.object({
  title: short,
  url,
  size: z.string().trim().max(40).optional(),
});

export const shopCourseLessonSchema = z.object({
  id: id,
  title: short,
  duration: z.string().trim().max(40).default("10:00"),
  videoUrl: optionalVideoUrlInput.default(""),
  content: z.string().max(100000).default(""),
  resources: z.array(shopCourseLessonResourceSchema).max(30).default([]),
  isFreePreview: z.boolean().default(false),
  order: z.number().int().min(0).max(10000).default(0),
});

export const shopCourseModuleSchema = z.object({
  id: id,
  title: short,
  description: z.string().max(5000).default(""),
  order: z.number().int().min(0).max(10000).default(0),
  lessons: z.array(shopCourseLessonSchema).max(100).default([]),
});

export const shopItemSchema = z.object({
  id: optionalId,
  slug: shopItemSlug,
  type: z.enum(["course", "digital_product"]),
  title: short,
  subtitle: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(50000),
  price: z.number().int().min(100).max(10000000),
  compareAtPrice: z.number().int().min(100).max(10000000).optional().nullable(),
  category: short,
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  badge: z.string().trim().max(40).optional().nullable(),
  thumbnailUrl: url,
  previewVideoUrl: optionalVideoUrlInput.default(""),
  whatYouWillLearn: z.array(short).max(30).default([]),
  requirements: z.array(short).max(20).default([]),
  targetAudience: z.array(short).max(20).default([]),
  published: z.boolean().default(false),
  featured: z.boolean().default(false),
  // Course specific fields
  level: z.enum(["All Levels", "Beginner", "Intermediate", "Advanced"]).default("All Levels"),
  totalDuration: z.string().trim().max(50).optional().nullable(),
  certificateEnabled: z.boolean().default(true),
  curriculum: z.array(shopCourseModuleSchema).max(50).default([]),
  // Digital Product specific fields
  fileUrl: optionalUrl.default(""),
  fileSize: z.string().trim().max(40).optional().nullable(),
  fileFormat: z.string().trim().max(50).optional().nullable(),
  version: z.string().trim().max(30).optional().nullable(),
  includes: z.array(short).max(30).default([]),
});

export const shopProgressUpdateSchema = z.object({
  courseId: id,
  lessonId: id,
  completed: z.boolean().default(true),
});
