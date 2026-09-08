"use client";

import { useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import {
  Clock,
  FileText,
  Upload,
  Send,
  CheckCircle2,
  Download,
  Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAcademy } from "@/components/academy-provider";
import { accessToken, api } from "@/lib/api";
import { useRecords } from "@/lib/hooks";
import {
  TRACKS,
  isPremium,
  type Assignment,
  type AssignmentSubmission,
} from "@/lib/types";
import { queueAction, readQueue } from "./offline";

type Draft = {
  repoUrl: string;
  liveUrl: string;
  writeUp: string;
  attachments: string[];
  savedAt?: string;
  revision?: number;
};
const blank: Draft = { repoUrl: "", liveUrl: "", writeUp: "", attachments: [] };
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
export default function Assignments({ id }: { id?: string }) {
  const { user, authUser } = useAcademy();
  const assignments = useRecords<Assignment>("assignments", [
    ["published", "==", true],
  ]);
  const submissions = useRecords<AssignmentSubmission>(
    "submissions",
    [["studentId", "==", user?.id || ""]],
    !!user,
  );
  const available = assignments.data.filter(
    (item) =>
      isPremium(user) ||
      (item.classId === user?.enrolledClassId && item.starter === true),
  );
  const [selected, setSelected] = useState(id || "");
  const assignment =
    available.find((item) => item.id === selected) || available[0];
  const submission = submissions.data.find(
    (item) => item.assignmentId === assignment?.id,
  );
  const draftKey = `ea:draft:${user?.id}:${assignment?.id}`;
  const [draft, setDraft] = useState<Draft>(blank);
  const [loadedKey, setLoadedKey] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [queued, setQueued] = useState(false);
  const [preview, setPreview] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!user || !assignment || submissions.loading) return;
    let saved: Draft | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(draftKey) || "null");
    } catch {}
    setDraft(
      saved || {
        repoUrl: submission?.repoUrl || "",
        liveUrl: submission?.liveUrl || "",
        writeUp: submission?.writeUp || "",
        attachments: submission?.attachments || [],
      },
    );
    setLoadedKey(draftKey);
    setFeedback("");
    setQueued(
      readQueue(user.id).some(
        (item) => item.id === `submission:${assignment.id}`,
      ),
    );
  }, [draftKey, user, assignment, submission, submissions.loading]);
  useEffect(() => {
    if (loadedKey !== draftKey) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        setFeedback(
          "Your browser could not save this draft. Copy your work before leaving this page.",
        );
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, draftKey, loadedKey]);
  useEffect(() => {
    const synced = () => {
      if (user && assignment)
        setQueued(
          readQueue(user.id).some(
            (item) => item.id === `submission:${assignment.id}`,
          ),
        );
    };
    const failed = (event: Event) =>
      setFeedback((event as CustomEvent<string>).detail);
    window.addEventListener("ea:queue-synced", synced);
    window.addEventListener("ea:queue-error", failed);
    return () => {
      window.removeEventListener("ea:queue-synced", synced);
      window.removeEventListener("ea:queue-error", failed);
    };
  }, [user, assignment]);
  const edit = (patch: Partial<Draft>) =>
    setDraft((previous) => ({
      ...previous,
      ...patch,
      savedAt: new Date().toISOString(),
      revision: (previous.revision || 0) + 1,
    }));
  const upload = async (files: FileList | null) => {
    if (!files || !authUser) return;
    if (!navigator.onLine) {
      setFeedback(
        "Connect to upload attachments. Your written draft can still be saved offline.",
      );
      return;
    }
    setUploading(true);
    setFeedback("");
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await accessToken()}`,
          },
          body,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : "Attachment upload failed.",
          );
        setDraft((previous) => ({
          ...previous,
          attachments: [...previous.attachments, result.data.path],
          savedAt: new Date().toISOString(),
          revision: (previous.revision || 0) + 1,
        }));
      }
    } catch (error) {
      setFeedback(message(error));
    } finally {
      setUploading(false);
    }
  };
  const download = async (path: string) => {
    try {
      if (!authUser) return;
      const url = path.startsWith("/api/upload?")
        ? path
        : `/api/upload?path=${encodeURIComponent(path)}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${await accessToken()}` },
      });
      if (!response.ok) throw new Error("Attachment could not be downloaded.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = path.split("/").pop() || "attachment";
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setFeedback(message(error));
    }
  };
  const save = async (status: "draft" | "submitted") => {
    if (!user || !assignment) return;
    setFeedback("");
    setBusy(true);
    try {
      for (const value of [draft.repoUrl, draft.liveUrl])
        if (value) {
          const parsed = new URL(value);
          if (parsed.protocol !== "https:")
            throw new Error("Repository and deployment links must use HTTPS.");
        }
      if (status === "submitted" && !draft.writeUp.trim())
        throw new Error("Add a write-up before submitting your work.");
      const payload = {
        submission: {
          ...(submission?.id ? { id: submission.id } : {}),
          assignmentId: assignment.id,
          studentId: user.id,
          studentName: user.name,
          classId: assignment.classId,
          repoUrl: draft.repoUrl,
          liveUrl: draft.liveUrl,
          writeUp: draft.writeUp,
          attachments: draft.attachments,
          status,
        },
      };
      if (!navigator.onLine) {
        queueAction(
          user.id,
          "submission.save",
          payload,
          `submission:${assignment.id}`,
        );
        setQueued(true);
        setFeedback(
          "Saved on this device. Your work will sync when you reconnect. The server records your submission when the connection returns.",
        );
      } else {
        const result = await api<{
          reviewEligible: boolean;
          reviewsRemaining: number;
        }>("submission.save", payload);
        setFeedback(
          status === "submitted"
            ? result.reviewEligible
              ? `Your assignment is in the instructor review queue. ${result.reviewsRemaining} review request${result.reviewsRemaining === 1 ? "" : "s"} remaining this month.`
              : "Your starter assignment has been submitted as practice. Upgrade to Premium when you want instructor feedback."
            : "Draft saved to your academy account.",
        );
      }
    } catch (error) {
      setFeedback(message(error));
    } finally {
      setBusy(false);
    }
  };
  if (!user) return null;
  const remaining = assignment?.dueDate
    ? Date.parse(assignment.dueDate) - now
    : NaN;
  return (
    <div>
      <header className="page-header">
        <div>
          <p className="eyebrow">PUT KNOWLEDGE INTO PRACTICE</p>
          <h1>Your assignments</h1>
          <p className="muted">
            Build something meaningful. Get feedback that helps you move
            forward.
          </p>
        </div>
      </header>
      {assignments.error && <p className="alert">{assignments.error}</p>}
      {submissions.error && <p className="alert">{submissions.error}</p>}
      {assignments.loading ? (
        <div className="card">Loading assignments…</div>
      ) : !assignment ? (
        <div className="empty-state">
          <FileText size={32} />
          <h2>Your next challenge is on its way</h2>
          <p>
            Published assignments and capstone milestones will appear here when
            your instructor adds them.
          </p>
        </div>
      ) : (
        <div className="assignment-layout">
          <aside className="card assignment-sidebar">
            <p className="eyebrow">YOUR BRIEF</p>
            <label className="field">
              Assignment
              <select
                value={assignment.id}
                onChange={(event) => setSelected(event.target.value)}
              >
                {available.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <span className="badge">
              {TRACKS.find((track) => track.id === assignment.classId)?.short}
            </span>
            {assignment.starter && <span className="badge">Free starter</span>}
            <h2>{assignment.title}</h2>
            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {assignment.description}
              </ReactMarkdown>
            </div>
            <div className="deadline">
              <Clock size={18} />
              <div>
                <strong>
                  {Number.isNaN(remaining)
                    ? "No deadline"
                    : remaining < 0
                      ? "Deadline passed"
                      : remaining < 86400000
                        ? `${Math.max(1, Math.ceil(remaining / 3600000))} hours remaining`
                        : `${Math.ceil(remaining / 86400000)} days remaining`}
                </strong>
                <p className="muted">
                  {assignment.dueDate
                    ? new Date(assignment.dueDate).toLocaleString()
                    : "Work at your own pace"}
                </p>
              </div>
            </div>
            {assignment.milestones?.length ? (
              <div className="milestones">
                <h3>Project milestones</h3>
                {assignment.milestones.map((milestone, index) => (
                  <div key={`${milestone.title}-${index}`}>
                    <span>{index + 1}</span>
                    <p>
                      <strong>{milestone.title}</strong>
                      <small>
                        {new Date(milestone.dueDate).toLocaleDateString()}
                      </small>
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="muted">
              {isPremium(user)
                ? "Premium includes two instructor-reviewed submissions each month, rated on a 0–100 scale."
                : "This is a self-guided starter assignment. Instructor reviews are included with Premium."}
            </p>
          </aside>
          <section className="card submission-editor">
            <div className="learning-toolbar">
              <h2>Your submission</h2>
              <span className="badge">
                {queued
                  ? "Queued offline"
                  : submission?.status.replace("-", " ") || "draft"}
              </span>
            </div>
            {feedback && (
              <p className="alert" role="status">
                {feedback}
              </p>
            )}
            {submission?.status === "graded" && (
              <div className="graded-feedback">
                <CheckCircle2 size={22} />
                <div>
                  <h3>Instructor rating: {submission.grade} / 100</h3>
                  <div className="prose">
                    <ReactMarkdown>
                      {submission.feedback ||
                        "Your instructor has completed this review."}
                    </ReactMarkdown>
                  </div>
                  {submission.rubric?.map((row, index) => (
                    <p key={index}>
                      {row.criterion}: <strong>{row.score}</strong>
                    </p>
                  ))}
                  {submission.lineFeedback?.map((row, index) => (
                    <p key={index}>
                      <strong>Line {row.line}:</strong> {row.comment}
                    </p>
                  ))}
                </div>
              </div>
            )}
            <fieldset
              disabled={
                busy ||
                submission?.status === "graded" ||
                submission?.status === "under-review"
              }
            >
              <div className="grid-2">
                <label className="field">
                  GitHub repository URL
                  <input
                    type="url"
                    placeholder="https://github.com/you/project"
                    value={draft.repoUrl}
                    onChange={(event) => edit({ repoUrl: event.target.value })}
                  />
                </label>
                <label className="field">
                  Live deployment URL
                  <input
                    type="url"
                    placeholder="https://your-project.com"
                    value={draft.liveUrl}
                    onChange={(event) => edit({ liveUrl: event.target.value })}
                  />
                </label>
              </div>
              <div className="learning-toolbar">
                <label htmlFor="assignment-writeup">
                  <strong>Project write-up</strong>
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setPreview(!preview)}
                >
                  {preview ? "Edit Markdown" : "Preview"}
                </button>
              </div>
              {preview ? (
                <div className="writeup-preview prose">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {draft.writeUp || "Your write-up preview will appear here."}
                  </ReactMarkdown>
                </div>
              ) : (
                <textarea
                  id="assignment-writeup"
                  className="writeup-input"
                  value={draft.writeUp}
                  onChange={(event) => edit({ writeUp: event.target.value })}
                  placeholder="Explain your approach, what you built, and what you learned. Markdown supports headings, lists, links, and code blocks."
                />
              )}
              <p className="draft-meta">
                {draft.writeUp.length.toLocaleString()} characters ·{" "}
                {draft.savedAt
                  ? `Saved on this device at ${new Date(draft.savedAt).toLocaleTimeString()} · ${draft.revision || 0} edits`
                  : "Your draft saves automatically on this device"}
              </p>
              <label
                className="upload-zone"
                onDragOver={(event: DragEvent) => event.preventDefault()}
                onDrop={(event: DragEvent) => {
                  event.preventDefault();
                  if (
                    submission?.status !== "graded" &&
                    submission?.status !== "under-review"
                  )
                    void upload(event.dataTransfer.files);
                }}
              >
                <Upload size={24} />
                <strong>
                  {uploading
                    ? "Uploading attachments…"
                    : "Drop files here or browse"}
                </strong>
                <small>
                  PDF, JPG, PNG, WebP, DOC, or DOCX · up to 5 MB each
                </small>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  disabled={uploading}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    void upload(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
              {draft.attachments.map((path) => (
                <div className="attachment-row" key={path}>
                  <FileText size={16} />
                  <span>
                    {decodeURIComponent(path.split("/").pop() || "Attachment")}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    aria-label="Download attachment"
                    onClick={() => download(path)}
                  >
                    <Download size={16} />
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    aria-label="Remove attachment"
                    onClick={() =>
                      edit({
                        attachments: draft.attachments.filter(
                          (item) => item !== path,
                        ),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <div className="submission-actions">
                <button
                  className="btn btn-secondary"
                  disabled={uploading}
                  onClick={() => save("draft")}
                >
                  Save to account
                </button>
                <button
                  className="btn btn-primary"
                  disabled={uploading || !draft.writeUp.trim()}
                  onClick={() => save("submitted")}
                >
                  <Send size={16} />
                  {busy
                    ? "Saving…"
                    : submission?.status === "submitted"
                      ? "Update submission"
                      : isPremium(user)
                        ? "Submit for review"
                        : "Submit practice"}
                </button>
              </div>
            </fieldset>
            {["graded", "under-review"].includes(submission?.status || "") && (
              <p className="muted">
                This submission is locked while under review or after grading.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
