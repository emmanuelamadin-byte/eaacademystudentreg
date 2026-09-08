"use client";
import { useEffect, useState } from "react";
import { useRecords } from "@/lib/hooks";
import { supabaseConfigured } from "@/lib/supabase";
import type { CareerPathClassId } from "@/lib/types";
import type { TrackProfile } from "@/features/admin/track-profile";
export function CatalogDetails({ track }: { track: CareerPathClassId }) {
  const { data } = useRecords<TrackProfile>("trackProfiles");
  const profile = data.find((item) => item.id === track);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!supabaseConfigured) return;
    let active = true;
    fetch("/api/catalog")
      .then(async (response) => {
        if (response.ok) {
          const body = await response.json();
          if (active) setCounts(body.data.studentCounts);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      {counts && (
        <p className="catalog-count">
          {counts[track] || 0} enrolled{" "}
          {(counts[track] || 0) === 1 ? "student" : "students"}
        </p>
      )}
      {profile?.instructorName && (
        <div className="catalog-instructor">
          {profile.instructorAvatarUrl ? (
            <img
              src={profile.instructorAvatarUrl}
              alt=""
              width={48}
              height={48}
            />
          ) : (
            <span className="avatar">{profile.instructorName[0]}</span>
          )}
          <div>
            <small>MEET YOUR INSTRUCTOR</small>
            <strong>{profile.instructorName}</strong>
            {profile.instructorBio && <p>{profile.instructorBio}</p>}
          </div>
        </div>
      )}
    </>
  );
}
