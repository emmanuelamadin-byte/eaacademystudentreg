import { TRACKS, type AcademyUser } from "./types";

export function needsProfileBootstrap(profile: AcademyUser | null) {
  if (!profile) return true;
  if (profile.role !== "Student") return false;
  const validTrack = TRACKS.some(
    (track) => track.id === profile.enrolledClassId,
  );
  return !validTrack || !profile.phoneNumber;
}
