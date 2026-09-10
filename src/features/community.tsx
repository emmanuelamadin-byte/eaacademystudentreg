"use client";

import { useState } from "react";
import Link from "next/link";
import type { FormEvent } from "react";
import {
  CalendarDays,
  ChevronUp,
  MessageCircle,
  Plus,
  PanelsTopLeft,
} from "lucide-react";
import { useAcademy } from "@/components/academy-provider";
import { useRecord, useRecords } from "@/lib/hooks";
import { api } from "@/lib/api";
import { TRACKS, isPremium } from "@/lib/types";
import type {
  AcademyUser,
  CareerPathClassId,
  Discussion,
  Project,
  CommunityComment,
  LiveSession,
  PortfolioCritique,
} from "@/lib/types";
import {
  ActionMessage,
  Empty,
  ExternalLink,
  TrackSelect,
  dateLabel,
  trackName,
  useAction,
} from "./admin/shared";
import "./admin/admin.css";

export default function Community({
  section,
  id,
}: {
  section: string;
  id?: string;
}) {
  const { user } = useAcademy();
  if (!user)
    return (
      <Empty title="Your community is waiting">
        Sign in to join the conversation.
      </Empty>
    );
  const descriptions: Record<string, [string, string]> = {
    community: [
      "Better, together.",
      "Ask a question. Share a breakthrough. Find your people.",
    ],
    showcase: [
      "Built by our community.",
      "A home for the ideas, experiments, and projects you bring to life.",
    ],
    sessions: [
      "Learn in good company.",
      "Workshops, office hours, and conversations with people who do the work.",
    ],
  };
  const [title, description] = descriptions[section] ?? descriptions.community;
  return (
    <div className="community-workspace">
      <header className="page-header">
        <p className="eyebrow">THE COHORT LOUNGE</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </header>
      <nav className="tabs" aria-label="Community sections">
        <Link
          href="/app/community"
          aria-current={section === "community" ? "page" : undefined}
        >
          Discussions
        </Link>
        <Link
          href="/app/showcase"
          aria-current={section === "showcase" ? "page" : undefined}
        >
          Project showcase
        </Link>
        <Link
          href="/app/sessions"
          aria-current={section === "sessions" ? "page" : undefined}
        >
          Live sessions
        </Link>
      </nav>
      {section === "showcase" ? (
        <Showcase user={user} />
      ) : section === "sessions" ? (
        <Sessions user={user} />
      ) : (
        <Discussions user={user} initialId={id} />
      )}
    </div>
  );
}

function Discussions({
  user,
  initialId,
}: {
  user: AcademyUser;
  initialId?: string;
}) {
  const records = useRecords<Discussion>("discussions");
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState<CareerPathClassId | "all">("all");
  const [compose, setCompose] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(initialId ?? null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [postTrack, setPostTrack] = useState(user.enrolledClassId);
  const action = useAction();
  const items = records.data
    .filter(
      (item) =>
        (track === "all" || item.classId === track) &&
        `${item.title} ${item.body} ${item.authorName}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  async function submit(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      await api("discussion.create", { title, body, classId: postTrack });
      setTitle("");
      setBody("");
      setCompose(false);
    }, "Your discussion is live.");
  }
  return (
    <>
      <div className="workspace-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search discussions"
          placeholder="Search topics, questions, or people…"
        />
        <TrackSelect all value={track} onChange={setTrack} />
        <button
          className="btn btn-primary"
          onClick={() => setCompose(!compose)}
        >
          <Plus size={16} />
          Start a discussion
        </button>
      </div>
      <ActionMessage action={action} />
      {records.error && (
        <p role="alert" className="alert">
          {String(records.error)}
        </p>
      )}
      {compose && (
        <section className="card">
          <h2>Start a conversation</h2>
          <form className="workspace-form" onSubmit={submit}>
            <label>
              Track
              <TrackSelect
                value={postTrack}
                onChange={(value) => setPostTrack(value as CareerPathClassId)}
              />
            </label>
            <label>
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={160}
                placeholder="What’s on your mind?"
              />
            </label>
            <label>
              Your question or idea
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                required
                maxLength={10000}
                rows={6}
                placeholder="Share some context so your cohort can help."
              />
            </label>
            <div className="workspace-inline">
              <button className="btn btn-primary" disabled={action.busy}>
                {action.busy ? "Posting…" : "Post discussion"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setCompose(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="workspace-stack">
        {items.map((item) => (
          <article key={item.id} className="card discussion-card">
            <div className="workspace-toolbar">
              <span className="badge">{trackName(item.classId)}</span>
              <span className="muted">{dateLabel(item.createdAt)}</span>
            </div>
            <h3>
              <button
                className="workspace-muted-button"
                style={{
                  color: "inherit",
                  font: "inherit",
                  textAlign: "left",
                  padding: 0,
                }}
                onClick={() =>
                  setExpanded(expanded === item.id ? null : item.id)
                }
                aria-expanded={expanded === item.id}
              >
                {item.title}
              </button>
            </h3>
            <p className="workspace-note">
              {expanded === item.id
                ? item.body
                : item.body.length > 260
                  ? `${item.body.slice(0, 260)}…`
                  : item.body}
            </p>
            <div className="workspace-toolbar">
              <div className="discussion-meta">
                <span className="discussion-avatar">
                  {item.authorName.slice(0, 1).toUpperCase()}
                </span>
                <strong>{item.authorName}</strong>
              </div>
              <div className="workspace-inline">
                <button
                  className="workspace-muted-button workspace-inline"
                  onClick={() =>
                    setExpanded(expanded === item.id ? null : item.id)
                  }
                >
                  <MessageCircle size={16} />
                  {expanded === item.id ? "Close replies" : "Join conversation"}
                </button>
                {(user.role === "Admin" || user.id === item.authorId) && (
                  <button
                    className="workspace-muted-button workspace-danger"
                    disabled={action.busy}
                    onClick={() => {
                      if (window.confirm("Delete this discussion?"))
                        void action.run(
                          () =>
                            api("community.delete", {
                              collection: "discussions",
                              id: item.id,
                            }),
                          "Discussion deleted.",
                        );
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            {expanded === item.id && (
              <Comments parentId={item.id} user={user} />
            )}
          </article>
        ))}
      </section>
      {!items.length && (
        <Empty
          title={
            records.loading
              ? "Loading conversations…"
              : query
                ? "No matching conversations"
                : "Be the first to say hello"
          }
        >
          {query
            ? "Try a different search or track."
            : "Introduce yourself, share what you’re learning, or ask your first question."}
        </Empty>
      )}
    </>
  );
}

function Comments({ parentId, user }: { parentId: string; user: AcademyUser }) {
  const records = useRecords<CommunityComment>("comments", [
    ["parentId", "==", parentId],
  ]);
  const [body, setBody] = useState("");
  const action = useAction();
  return (
    <section className="discussion-comments" aria-label="Replies">
      {records.error && (
        <p role="alert" className="alert">
          {String(records.error)}
        </p>
      )}
      {[...records.data]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((comment) => (
          <article className="discussion-comment" key={comment.id}>
            <div className="workspace-toolbar">
              <div className="discussion-meta">
                <strong>{comment.authorName}</strong>
                <span>{dateLabel(comment.createdAt)}</span>
              </div>
              {(user.role === "Admin" || user.id === comment.authorId) && (
                <button
                  className="workspace-muted-button workspace-danger"
                  disabled={action.busy}
                  onClick={() => {
                    if (window.confirm("Delete this reply?"))
                      void action.run(
                        () =>
                          api("community.delete", {
                            collection: "comments",
                            id: comment.id,
                          }),
                        "Reply deleted.",
                      );
                  }}
                >
                  Delete
                </button>
              )}
            </div>
            <p className="workspace-note">{comment.body}</p>
          </article>
        ))}
      {!records.data.length && (
        <p className="muted">
          {records.loading
            ? "Loading replies…"
            : "No replies yet. Add your perspective."}
        </p>
      )}
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            await api("comment.create", { parentId, body });
            setBody("");
          }, "Reply posted.");
        }}
      >
        <label>
          Your reply
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            maxLength={5000}
            placeholder="Keep it thoughtful and constructive…"
          />
        </label>
        <ActionMessage action={action} />
        <div>
          <button
            className="btn btn-secondary btn-small"
            disabled={action.busy}
          >
            {action.busy ? "Posting…" : "Post reply"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Showcase({ user }: { user: AcademyUser }) {
  const records = useRecords<Project>("projects");
  const [track, setTrack] = useState<CareerPathClassId | "all">("all");
  const [sort, setSort] = useState("latest");
  const [query, setQuery] = useState("");
  const [compose, setCompose] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [projectTrack, setProjectTrack] = useState(user.enrolledClassId);
  const action = useAction();
  const items = records.data
    .filter(
      (item) =>
        (track === "all" || item.classId === track) &&
        `${item.title} ${item.description} ${item.authorName}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "popular"
        ? (b.votes ?? 0) - (a.votes ?? 0)
        : b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <>
      <div className="workspace-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a project…"
          aria-label="Search projects"
        />
        <TrackSelect value={track} onChange={setTrack} all />
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort projects"
        >
          <option value="latest">Latest projects</option>
          <option value="popular">Most appreciated</option>
        </select>
        <button
          className="btn btn-primary"
          onClick={() => setCompose(!compose)}
        >
          <Plus size={16} />
          Share your work
        </button>
      </div>
      <ActionMessage action={action} />
      {records.error && (
        <p className="alert" role="alert">
          {String(records.error)}
        </p>
      )}
      {compose && (
        <section className="card">
          <h2>Let your work speak</h2>
          <form
            className="workspace-form"
            onSubmit={(event) => {
              event.preventDefault();
              void action.run(async () => {
                await api("project.create", {
                  title,
                  description,
                  url,
                  classId: projectTrack,
                });
                setTitle("");
                setDescription("");
                setUrl("");
                setCompose(false);
              }, "Your project is in the showcase.");
            }}
          >
            <label>
              Project title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={160}
              />
            </label>
            <label>
              What did you build?
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
                maxLength={5000}
                placeholder="Share the idea, your approach, and what you learned."
              />
            </label>
            <div className="grid-2">
              <label>
                Project or portfolio link
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label>
                Track
                <TrackSelect
                  value={projectTrack}
                  onChange={(value) =>
                    setProjectTrack(value as CareerPathClassId)
                  }
                />
              </label>
            </div>
            <div className="workspace-inline">
              <button className="btn btn-primary" disabled={action.busy}>
                {action.busy ? "Publishing…" : "Publish project"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setCompose(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="grid-3">
        {items.map((item) => (
          <article className="card project-card" key={item.id}>
            <div
              className="project-preview"
              style={{
                background: TRACKS.find((track) => track.id === item.classId)
                  ?.color,
              }}
            >
              <PanelsTopLeft size={32} aria-hidden="true" />
            </div>
            <span className="badge">{trackName(item.classId)}</span>
            <h3>{item.title}</h3>
            <p className="muted">{item.description}</p>
            <ExternalLink href={item.url}>View project</ExternalLink>
            <div className="discussion-meta">
              <span className="discussion-avatar">
                {item.authorName.slice(0, 1).toUpperCase()}
              </span>
              <strong>{item.authorName}</strong>
            </div>
            <div className="workspace-toolbar">
              <button
                className="vote-button"
                disabled={action.busy}
                aria-label={`Appreciate ${item.title}`}
                onClick={() =>
                  void action.run(
                    () => api("project.vote", { id: item.id }),
                    "Your appreciation has been updated.",
                  )
                }
              >
                <ChevronUp size={16} />
                <strong>{item.votes ?? 0}</strong>
              </button>
              <button
                className="workspace-muted-button workspace-inline"
                onClick={() =>
                  setExpanded(expanded === item.id ? null : item.id)
                }
              >
                <MessageCircle size={16} /> Comments
              </button>
              {(user.role === "Admin" || user.id === item.authorId) && (
                <button
                  className="workspace-muted-button workspace-danger"
                  disabled={action.busy}
                  onClick={() => {
                    if (
                      window.confirm("Remove this project from the showcase?")
                    )
                      void action.run(
                        () =>
                          api("community.delete", {
                            collection: "projects",
                            id: item.id,
                          }),
                        "Project removed.",
                      );
                  }}
                >
                  Delete
                </button>
              )}
            </div>
            {(user.id === item.authorId ||
              user.role === "Admin" ||
              (user.role === "Instructor" &&
                (user.instructorTrackIds ?? []).includes(item.classId))) && (
              <ProjectCritiquePanel project={item} user={user} />
            )}
            {expanded === item.id && (
              <Comments parentId={item.id} user={user} />
            )}
          </article>
        ))}
      </section>
      {!items.length && (
        <Empty
          title={
            records.loading ? "Loading projects…" : "Great work belongs here"
          }
        >
          Share your first project and inspire the next person in your cohort.
        </Empty>
      )}
    </>
  );
}

function ProjectCritiquePanel({
  project,
  user,
}: {
  project: Project;
  user: AcademyUser;
}) {
  const critique = useRecord<PortfolioCritique>(
    "projectCritiques",
    project.id,
  );
  const [feedback, setFeedback] = useState("");
  const action = useAction();
  const owns = user.id === project.authorId;
  const staff =
    user.role === "Admin" ||
    (user.role === "Instructor" &&
      (user.instructorTrackIds ?? []).includes(project.classId));
  return (
    <div className="workspace-stack">
      {owns && !critique.loading && !critique.data &&
        (isPremium(user) ? (
          <button
            className="btn btn-secondary btn-small"
            disabled={action.busy}
            onClick={() =>
              void action.run(
                () => api("project.critique.request", { id: project.id }),
                "Your portfolio critique has been requested.",
              )
            }
          >
            Request monthly portfolio critique
          </button>
        ) : (
          <Link className="text-link" href="/app/billing">
            Premium includes a monthly portfolio critique →
          </Link>
        ))}
      {critique.data?.status === "requested" && owns && (
        <p className="muted">Your critique is waiting for an instructor.</p>
      )}
      {critique.data?.status === "completed" && owns && (
        <div className="workspace-note">
          <strong>Instructor portfolio critique</strong>
          <p>{critique.data.feedback}</p>
        </div>
      )}
      {staff && critique.data?.status === "requested" && (
        <form
          className="workspace-form"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(
              () =>
                api("project.critique.respond", {
                  id: project.id,
                  feedback,
                }),
              "Portfolio critique sent to the student.",
            );
          }}
        >
          <label>
            Portfolio critique for {critique.data.studentName}
            <textarea
              required
              maxLength={30000}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Highlight strengths, improvements, and the student's clearest next step."
            />
          </label>
          <button className="btn btn-primary btn-small" disabled={action.busy}>
            Send critique
          </button>
        </form>
      )}
      <ActionMessage action={action} />
      {critique.error && <p className="alert">{critique.error}</p>}
    </div>
  );
}

function Sessions({ user }: { user: AcademyUser }) {
  const records = useRecords<LiveSession>("sessions");
  const [track, setTrack] = useState<CareerPathClassId | "all">("all");
  const [view, setView] = useState("upcoming");
  const [editing, setEditing] = useState<LiveSession | null>(null);
  const action = useAction();
  const staff = user.role === "Admin" || user.role === "Instructor";
  const scopes =
    user.role === "Admin"
      ? TRACKS.map((track) => track.id)
      : (user.instructorTrackIds ?? []);
  const [now] = useState(() => Date.now());
  const items = records.data
    .filter(
      (item) =>
        (track === "all" || item.classId === track || item.classId === "all") &&
        (view === "past"
          ? Date.parse(item.endsAt) < now
          : Date.parse(item.endsAt) >= now),
    )
    .sort((a, b) =>
      view === "past"
        ? b.startsAt.localeCompare(a.startsAt)
        : a.startsAt.localeCompare(b.startsAt),
    );
  return (
    <>
      <div className="workspace-toolbar">
        <div className="workspace-inline">
          <TrackSelect value={track} onChange={setTrack} all />
          <select
            value={view}
            onChange={(event) => setView(event.target.value)}
            aria-label="Session period"
          >
            <option value="upcoming">Upcoming sessions</option>
            <option value="past">Past sessions</option>
          </select>
        </div>
        {staff && scopes.length > 0 && (
          <button
            className="btn btn-primary"
            onClick={() =>
              setEditing({
                id: "",
                title: "",
                description: "",
                classId: user.role === "Admin" ? "all" : scopes[0],
                startsAt: "",
                endsAt: "",
                 url: "",
                 recordingUrl: "",
                 host: user.name,
              })
            }
          >
            <Plus size={16} />
            Schedule a session
          </button>
        )}
      </div>
      <ActionMessage action={action} />
      {records.error && (
        <p role="alert" className="alert">
          {String(records.error)}
        </p>
      )}
      {editing && (
        <SessionEditor
          key={editing.id || "new"}
          initial={editing}
          user={user}
          close={() => setEditing(null)}
        />
      )}
      <section className="workspace-stack">
        {items.map((item) => {
          const starts = new Date(item.startsAt);
          const ends = new Date(item.endsAt);
          const isLive = starts.valueOf() <= now && ends.valueOf() >= now;
          const canEdit =
            user.role === "Admin" ||
            (user.role === "Instructor" &&
              scopes.includes(item.classId as CareerPathClassId));
          return (
            <article className="card session-item" key={item.id}>
              <div className="session-date">
                <span>
                  {starts.toLocaleDateString("en-NG", { month: "short" })}
                </span>
                <strong>{starts.getDate()}</strong>
                <span>
                  {starts.toLocaleDateString("en-NG", { weekday: "short" })}
                </span>
              </div>
              <div className="session-content">
                <div className="workspace-toolbar">
                  <span className="badge">{trackName(item.classId)}</span>
                  {isLive && <span className="workspace-status">Live now</span>}
                </div>
                <h3>{item.title}</h3>
                <p className="muted">
                  {starts.toLocaleTimeString("en-NG", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  –{" "}
                  {ends.toLocaleTimeString("en-NG", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  ({Intl.DateTimeFormat().resolvedOptions().timeZone}) · Hosted
                  by {item.host}
                </p>
                <p>{item.description}</p>
                <div className="workspace-inline">
                  <button
                    className="btn btn-primary btn-small"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        const result = await api<{ url: string }>(
                          view === "past"
                            ? "session.recording"
                            : "session.join",
                          { id: item.id },
                        );
                        const destination = new URL(result.url);
                        if (!["https:", "http:"].includes(destination.protocol))
                          throw new Error("Invalid meeting link.");
                        window.location.assign(destination.href);
                      }, "Opening your session…")
                    }
                  >
                    {view === "past" ? "Watch recording" : "Join session"}
                  </button>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => downloadCalendar(item)}
                  >
                    <CalendarDays size={15} />
                    Add to calendar
                  </button>
                  {canEdit && (
                    <>
                      <button
                        className="btn btn-secondary btn-small"
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(async () => {
                            const full = await api<LiveSession>("session.get", {
                              id: item.id,
                            });
                            setEditing(full);
                          }, "Session loaded.")
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="workspace-muted-button workspace-danger"
                        disabled={action.busy}
                        onClick={() => {
                          if (window.confirm("Delete this scheduled session?"))
                            void action.run(
                              () => api("session.delete", { id: item.id }),
                              "Session deleted.",
                            );
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>
      {!items.length && (
        <Empty
          title={
            records.loading
              ? "Loading sessions…"
              : view === "past"
                ? "No past sessions yet"
                : "The next conversation is on its way"
          }
        >
          {view === "past"
            ? "Completed sessions will be listed here."
            : "Upcoming workshops and office hours will appear here when scheduled."}
        </Empty>
      )}
    </>
  );
}

function SessionEditor({
  initial,
  user,
  close,
}: {
  initial: LiveSession;
  user: AcademyUser;
  close: () => void;
}) {
  const [session, setSession] = useState(initial);
  const action = useAction();
  const allowed =
    user.role === "Admin"
      ? TRACKS.map((track) => track.id)
      : (user.instructorTrackIds ?? []);
  return (
    <section className="card">
      <div className="workspace-toolbar">
        <h2>{initial.id ? "Edit session" : "Schedule a live session"}</h2>
        <button className="btn btn-secondary btn-small" onClick={close}>
          Close
        </button>
      </div>
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            const starts = new Date(session.startsAt);
            const ends = new Date(session.endsAt);
            if (ends <= starts)
              throw new Error("The session must end after it starts.");
            await api("session.save", {
              session: {
                ...session,
                startsAt: starts.toISOString(),
                endsAt: ends.toISOString(),
              },
            });
            close();
          });
        }}
      >
        <label>
          Session title
          <input
            required
            value={session.title}
            onChange={(event) =>
              setSession({ ...session, title: event.target.value })
            }
          />
        </label>
        <label>
          Description
          <textarea
            required
            value={session.description}
            onChange={(event) =>
              setSession({ ...session, description: event.target.value })
            }
          />
        </label>
        <div className="grid-2">
          <label>
            Starts (your local time)
            <input
              required
              type="datetime-local"
              value={toLocalDate(session.startsAt)}
              onChange={(event) =>
                setSession({ ...session, startsAt: event.target.value })
              }
            />
          </label>
          <label>
            Ends (your local time)
            <input
              required
              type="datetime-local"
              value={toLocalDate(session.endsAt)}
              onChange={(event) =>
                setSession({ ...session, endsAt: event.target.value })
              }
            />
          </label>
          <label>
            Audience
            <TrackSelect
              all={user.role === "Admin"}
              allowed={allowed}
              value={session.classId}
              onChange={(value) => setSession({ ...session, classId: value })}
            />
          </label>
          <label>
            Host
            <input
              required
              value={session.host}
              onChange={(event) =>
                setSession({ ...session, host: event.target.value })
              }
            />
          </label>
        </div>
        <label>
          Meeting URL
          <input
            type="url"
            required
            value={session.url}
            onChange={(event) =>
              setSession({ ...session, url: event.target.value })
            }
            placeholder="https://…"
          />
        </label>
        <label>
          Recording URL (optional)
          <input
            type="url"
            value={session.recordingUrl ?? ""}
            onChange={(event) =>
              setSession({ ...session, recordingUrl: event.target.value })
            }
            placeholder="https://…"
          />
          <small>Premium students can watch this from Past sessions.</small>
        </label>
        <ActionMessage action={action} />
        <div>
          <button className="btn btn-primary" disabled={action.busy}>
            {action.busy ? "Saving…" : "Save session"}
          </button>
        </div>
      </form>
    </section>
  );
}

function toLocalDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function downloadCalendar(session: LiveSession) {
  const escape = (value: string) =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  const stamp = (value: string) =>
    new Date(value)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EA Academy//Live Sessions//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${session.id}@ea-academy`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(session.startsAt)}`,
    `DTEND:${stamp(session.endsAt)}`,
    `SUMMARY:${escape(session.title)}`,
    `DESCRIPTION:${escape(`${session.description}\nHosted by ${session.host}\n${typeof window !== "undefined" ? window.location.origin : ""}/app/sessions`)}`,
    `URL:${window.location.origin}/app/sessions`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([calendar], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${session.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
