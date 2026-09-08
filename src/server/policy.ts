import type { AcademyUser, CareerPathClassId } from "../lib/types";

export const OWNER_EMAIL = "emmanuelamadin@gmail.com";
export const TRACK_IDS = [
  "system-dev",
  "creative-media",
  "business-growth",
] as const;
export const MONTHLY_REVIEW_LIMIT = 2;
export const MONTHLY_CRITIQUE_LIMIT = 1;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function hasPremium(user: AcademyUser, now = Date.now()) {
  return (
    user.role !== "Student" ||
    user.premiumGranted === true ||
    (user.membershipPlan === "Premium" &&
      !!user.premiumUntil &&
      Date.parse(user.premiumUntil) > now)
  );
}
export function managesTrack(user: AcademyUser, track: string) {
  return (
    user.role === "Admin" ||
    (user.role === "Instructor" &&
      (user.instructorTrackIds ?? []).includes(track as CareerPathClassId))
  );
}
export function requireAdmin(user: AcademyUser) {
  if (user.role !== "Admin" || user.email.toLowerCase() !== OWNER_EMAIL)
    throw new ApiError(403, "Only the academy administrator can do this.");
}
export function requireTrackStaff(user: AcademyUser, track: string) {
  if (!managesTrack(user, track))
    throw new ApiError(403, "You are not assigned to this track.");
}
export function canReadLesson(
  user: AcademyUser,
  lesson: { classId: string; published: boolean; free: boolean },
  module: { published: boolean; free: boolean },
) {
  return (
    managesTrack(user, lesson.classId) ||
    (lesson.published &&
      module.published &&
      (hasPremium(user) ||
        (lesson.classId === user.enrolledClassId && lesson.free && module.free)))
  );
}
export function initialRole(
  email: string | undefined,
  verified: boolean | undefined,
) {
  return verified && email?.toLowerCase() === OWNER_EMAIL
    ? ("Admin" as const)
    : ("Student" as const);
}
export function premiumAmountKobo() {
  return 300000;
}
export function utcMonthKey(at = new Date()) {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function extendPremiumUntil(
  current: string | undefined,
  paidAt: string,
) {
  const paid = new Date(paidAt);
  if (!Number.isFinite(paid.getTime()))
    throw new ApiError(400, "Invalid payment date.");
  const start = new Date(
    Math.max(Date.parse(current || "") || 0, paid.getTime()),
  );
  const day = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  ).getUTCDate();
  start.setUTCDate(Math.min(day, lastDay));
  return start.toISOString();
}
