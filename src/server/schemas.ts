import { z } from "zod";
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
  videoUrl: optionalUrl.default(""),
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
  videoUrl: url,
  duration: z.string().trim().max(40).default("Self-paced"),
  free: z.boolean().default(false),
  resources: z
    .array(z.object({ title: short, url }))
    .max(30)
    .default([]),
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
