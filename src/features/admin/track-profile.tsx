"use client";
import { useState } from "react";
import { useRecord } from "@/lib/hooks";
import { api } from "@/lib/api";
import type { CareerPathClassId } from "@/lib/types";
import { ActionMessage, useAction } from "./shared";
export interface TrackProfile {
  id: string;
  instructorName: string;
  instructorBio: string;
  instructorAvatarUrl?: string;
}
export default function TrackProfileEditor({
  track,
}: {
  track: CareerPathClassId;
}) {
  const { data, loading, error } = useRecord<TrackProfile>(
    "trackProfiles",
    track,
  );
  if (loading) return <p className="muted">Loading track details…</p>;
  if (error) return <p className="alert">{error}</p>;
  return (
    <details className="card">
      <summary className="text-link">Public instructor profile</summary>
      <ProfileForm
        key={JSON.stringify(data) || track}
        track={track}
        initial={data}
      />
    </details>
  );
}
function ProfileForm({
  track,
  initial,
}: {
  track: CareerPathClassId;
  initial: TrackProfile | null;
}) {
  const [name, setName] = useState(initial?.instructorName || "");
  const [bio, setBio] = useState(initial?.instructorBio || "");
  const [avatar, setAvatar] = useState(initial?.instructorAvatarUrl || "");
  const action = useAction();
  return (
    <form
      className="workspace-form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(() =>
          api("track.save", {
            classId: track,
            instructorName: name,
            instructorBio: bio,
            instructorAvatarUrl: avatar,
          }),
        );
      }}
    >
      <p className="muted">
        Add the real instructor details you want displayed on this track’s
        public page. Leave blank until ready.
      </p>
      <label>
        Instructor name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
      </label>
      <label>
        Short biography
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={1500}
        />
      </label>
      <label>
        Profile image URL (optional)
        <input
          type="url"
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <ActionMessage action={action} />
      <button className="btn btn-secondary" disabled={action.busy}>
        {action.busy ? "Saving…" : "Save public profile"}
      </button>
    </form>
  );
}
