"use client";

import { useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import {
  Clock,
  FileText,
  Upload,
  Send,
  CheckCircle2,
  Download,
  Trash2,
  Lock,
  ArrowRight,
  Sparkles,
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
  const [aiReview, setAiReview] = useState("");
  const [aiReviewing, setAiReviewing] = useState(false);
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
    if (!user || !isPremium(user)) {
      setFeedback(
        "Attachment uploads and assignment submissions are exclusively for Premium members.",
      );
      return;
    }
    if (!navigator.onLine) {
      setFeedback(
        "Connect to upload attachments. Your written draft can still be saved offline.",
      );
      return;
    }
    const fileList = Array.from(files);
    if (!fileList.length) return;

    const ALLOWED_EXTENSIONS = [
      ".pdf",
      ".docx",
      ".doc",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
    ];
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const MAX_ATTACHMENTS = 5;

    if (draft.attachments.length >= MAX_ATTACHMENTS) {
      setFeedback(
        `You have already reached the maximum of ${MAX_ATTACHMENTS} attachments for this assignment.`,
      );
      return;
    }

    if (draft.attachments.length + fileList.length > MAX_ATTACHMENTS) {
      setFeedback(
        `You can upload at most ${MAX_ATTACHMENTS} attachments per assignment. You currently have ${draft.attachments.length}, so you can only add ${MAX_ATTACHMENTS - draft.attachments.length} more.`,
      );
      return;
    }

    for (const file of fileList) {
      const ext = ("." + file.name.split(".").pop()).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setFeedback(
          `"${file.name}" is not an allowed file type. Allowed formats: PDF, Word (DOC, DOCX), or Image (PNG, JPG, WebP).`,
        );
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setFeedback(
          `"${file.name}" exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
        );
        return;
      }
      if (file.size < 16) {
        setFeedback(`"${file.name}" appears to be empty or corrupted.`);
        return;
      }
    }

    setUploading(true);
    setFeedback("");
    try {
      for (const file of fileList) {
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
  const requestAiReview = async () => {
    if (!user || !assignment) return;
    if (!isPremium(user)) {
      setFeedback(
        "AI pre-submission reviews are exclusively for Premium members.",
      );
      return;
    }
    if (!draft.writeUp.trim() && !draft.repoUrl) {
      setFeedback(
        "Add your project write-up or repository URL before requesting an AI review.",
      );
      return;
    }
    setAiReviewing(true);
    setAiReview("");
    setFeedback("");
    try {
      const result = await api<{ text: string }>("ai.ask", {
        mode: "review",
        assignmentId: assignment.id,
        trackId: assignment.classId,
        code: draft.repoUrl ? `Repository: ${draft.repoUrl}\nLive: ${draft.liveUrl || "N/A"}` : undefined,
        prompt: `Please review my assignment submission draft:\n\n${draft.writeUp}\n\nProvide constructive feedback, identify potential gaps/improvements, and give an advisory score out of 100 before I submit to my instructor.`,
      });
      setAiReview(result.text);
    } catch (error) {
      setFeedback(message(error));
    } finally {
      setAiReviewing(false);
    }
  };
  const save = async (status: "draft" | "submitted") => {
    if (!user || !assignment) return;
    if (!isPremium(user)) {
      setFeedback(
        "Assignment submission is exclusively for Premium students. Please upgrade to Premium to submit your work.",
      );
      return;
    }
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
                : "Assignment submission and personalized instructor reviews are exclusively available to Premium students."}
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
            {!isPremium(user) && (
              <div className="community-callout" style={{ margin: "1rem 0" }}>
                <Lock size={20} style={{ color: "#d97706", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "block", marginBottom: "2px" }}>
                    Premium Exclusive
                  </strong>
                  <p className="muted" style={{ margin: 0, fontSize: "14px" }}>
                    Submitting assignments and receiving instructor reviews require an active Premium membership.
                  </p>
                </div>
                <Link href="/app/billing" className="btn btn-primary btn-small">
                  Upgrade <ArrowRight size={14} />
                </Link>
              </div>
            )}
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
                <div style={{ display: "flex", gap: "0.85rem", alignItems: "center" }}>
                  {isPremium(user) && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={aiReviewing || (!draft.writeUp.trim() && !draft.repoUrl)}
                      onClick={requestAiReview}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        color: "#d97706",
                        fontWeight: 600,
                      }}
                      title="Request instant AI feedback on your draft before submitting"
                    >
                      <Sparkles size={15} className={aiReviewing ? "spin" : ""} />
                      {aiReviewing ? "Analyzing draft…" : "AI Pre-Review"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setPreview(!preview)}
                  >
                    {preview ? "Edit Markdown" : "Preview"}
                  </button>
                </div>
              </div>
              {aiReview && (
                <div
                  style={{
                    margin: "0.75rem 0 1.25rem 0",
                    padding: "1.25rem",
                    borderRadius: "12px",
                    background: "rgba(217, 119, 6, 0.06)",
                    border: "1px solid rgba(217, 119, 6, 0.25)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Sparkles size={18} style={{ color: "#d97706" }} />
                      <strong style={{ color: "#92400e" }}>EA AI Advisory Review</strong>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setAiReview("")}
                      style={{ fontSize: "12px" }}
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="prose" style={{ fontSize: "0.95rem" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {aiReview}
                    </ReactMarkdown>
                  </div>
                  <small
                    style={{
                      display: "block",
                      marginTop: "0.75rem",
                      color: "#b45309",
                      opacity: 0.8,
                    }}
                  >
                    Note: This evaluation is advisory. Final grading will be conducted by your assigned track instructor.
                  </small>
                </div>
              )}
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
                  maxLength={10000}
                  value={draft.writeUp}
                  onChange={(event) => edit({ writeUp: event.target.value })}
                  placeholder="Explain your approach, what you built, and what you learned. Markdown supports headings, lists, links, and code blocks."
                />
              )}
              <p className="draft-meta">
                {draft.writeUp.length.toLocaleString()} / 10,000 characters ·{" "}
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
                    : !isPremium(user)
                      ? "Attachments require Premium"
                      : draft.attachments.length >= 5
                        ? "Maximum 5 attachments reached"
                        : "Drop files here or browse"}
                </strong>
                <small>
                  PDF, JPG, PNG, WebP, DOC, or DOCX · up to 5 MB each (max 5 files · {draft.attachments.length}/5)
                </small>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  disabled={uploading || !isPremium(user) || draft.attachments.length >= 5}
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
              {!isPremium(user) ? (
                <div className="submission-actions">
                  <Link href="/app/billing" className="btn btn-primary">
                    <Lock size={16} />
                    Upgrade to Premium to Submit
                  </Link>
                </div>
              ) : (
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
                        : "Submit for review"}
                  </button>
                </div>
              )}
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
