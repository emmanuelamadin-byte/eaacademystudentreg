"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ClipboardCheck,
  Plus,
  Users,
  Wallet,
} from "lucide-react";
import { useAcademy } from "@/components/academy-provider";
import { useRecord, useRecords } from "@/lib/hooks";
import { accessToken, api } from "@/lib/api";
import { TRACKS, PREMIUM_PRICE } from "@/lib/types";
import type {
  AcademyUser,
  Assignment,
  AssignmentSubmission,
  CourseModule,
  Lesson,
  PlatformSettings,
  Payment,
  Progress,
  CareerPathClassId,
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
import TrackProfileEditor from "./admin/track-profile";

export default function Admin({ section }: { section: string; id?: string }) {
  const { user } = useAcademy();
  const staff = user?.role === "Admin" || user?.role === "Instructor";
  if (
    !staff ||
    (user.role !== "Admin" && !["courses", "submissions"].includes(section))
  )
    return (
      <Empty title="Staff access required">
        This workspace is available to authorized academy staff.
      </Empty>
    );
  const titles: Record<string, [string, string]> = {
    admin: [
      "Academy overview",
      "A clear view of your academy, your students, and their progress.",
    ],
    users: [
      "People & permissions",
      "Support your students and appoint instructors to the right tracks.",
    ],
    courses: [
      "Course studio",
      "Turn your experience into lessons worth learning.",
    ],
    submissions: [
      "Review workspace",
      "Thoughtful feedback. Clear next steps. Better work.",
    ],
    notifications: [
      "Announcements",
      "Keep your academy informed and moving together.",
    ],
    settings: [
      "Academy settings",
      "Manage the details that keep your academy running.",
    ],
  };
  const [title, description] = titles[section] ?? titles.admin;
  return (
    <div className="admin-workspace">
      <header className="page-header">
        <p className="eyebrow">
          {user.role === "Admin" ? "ADMINISTRATION" : "INSTRUCTOR WORKSPACE"}
        </p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </header>
      {section === "users" ? (
        <UsersPanel />
      ) : section === "courses" ? (
        <CoursesPanel user={user} />
      ) : section === "submissions" ? (
        <SubmissionsPanel user={user} />
      ) : section === "notifications" ? (
        <NotificationsPanel />
      ) : section === "settings" ? (
        <SettingsPanel />
      ) : (
        <Overview />
      )}
    </div>
  );
}

function Overview() {
  const [now] = useState(() => Date.now());
  const users = useRecords<AcademyUser>("users");
  const submissions = useRecords<AssignmentSubmission>("submissions");
  const payments = useRecords<Payment>("payments");
  const progress = useRecords<Progress>("progress");
  const modules = useRecords<CourseModule>("modules");
  const students = users.data.filter((item) => item.role === "Student");
  const activeStudents = students.filter(
    (item) =>
      item.lastActiveAt && Date.parse(item.lastActiveAt) > now - 30 * 86400000,
  ).length;
  const pending = submissions.data.filter(
    (item) => item.status === "submitted" || item.status === "under-review",
  );
  const successful = payments.data.filter((item) => item.status === "success");
  const revenue = successful.reduce((sum, item) => sum + item.amount, 0);
  const publishedLessons = modules.data
    .filter((item) => item.published)
    .flatMap((item) =>
      (item.lessons ?? []).map((lesson) => ({
        ...lesson,
        classId: item.classId,
        free: item.free && lesson.free,
      })),
    );
  const average = students.length
    ? Math.round(
        students.reduce((sum, student) => {
          const premium =
            student.premiumGranted ||
            (student.membershipPlan === "Premium" &&
              !!student.premiumUntil &&
              Date.parse(student.premiumUntil) > now);
          const eligible = publishedLessons.filter(
            (lesson) =>
              premium ||
              (lesson.classId === student.enrolledClassId && lesson.free),
          );
          const completed = new Set(
            progress.data
              .filter(
                (item) =>
                  item.studentId === student.id &&
                  eligible.some((lesson) => lesson.id === item.lessonId),
              )
              .map((item) => item.lessonId),
          );
          return (
            sum +
            (eligible.length ? (completed.size / eligible.length) * 100 : 0)
          );
        }, 0) / students.length,
      )
    : 0;
  const loading =
    users.loading ||
    payments.loading ||
    submissions.loading ||
    progress.loading ||
    modules.loading;
  const error =
    users.error ||
    payments.error ||
    submissions.error ||
    progress.error ||
    modules.error;
  return (
    <>
      {error && (
        <p role="alert" className="alert">
          {String(error)}
        </p>
      )}
      <div className="grid-3">
        {[
          {
            label: "Active students (30 days)",
            value: activeStudents.toLocaleString(),
            icon: Users,
          },
          {
            label: "Awaiting review",
            value: pending.length.toLocaleString(),
            icon: ClipboardCheck,
          },
          {
            label: "Total received",
            value: `₦${revenue.toLocaleString()}`,
            icon: Wallet,
          },
        ].map((metric) => (
          <div className="card" key={metric.label}>
            <div className="workspace-toolbar">
              <span className="muted">{metric.label}</span>
              <metric.icon size={19} />
            </div>
            <p className="metric">{loading ? "—" : metric.value}</p>
            <span className="muted">
              {metric.label === "Total received"
                ? "Successful payments and donations"
                : "Live academy records"}
            </span>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <section className="card">
          <h2>Students by track</h2>
          <div className="workspace-stack">
            {TRACKS.map((track) => {
              const count = students.filter(
                (item) => item.enrolledClassId === track.id,
              ).length;
              return (
                <div key={track.id} className="workspace-chart-row">
                  <span>{track.short}</span>
                  <div className="workspace-chart-bar">
                    <span
                      style={{
                        width: `${students.length ? (count / students.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
          <hr className="workspace-divider" />
          <div className="workspace-toolbar">
            <span>Average lesson completion</span>
            <strong>{average}%</strong>
          </div>
          <p className="muted">
            Completed lessons as a share of lessons each student can access.
          </p>
        </section>
        <section className="card">
          <h2>Make room for the next step</h2>
          <p className="muted">
            Your academy starts with what you teach. Build your modules, publish
            the first lesson, and welcome your students.
          </p>
          <div className="workspace-stack">
            <Link className="btn btn-secondary" href="/app/courses">
              <BookOpen size={17} /> Open course studio <ArrowRight size={16} />
            </Link>
            <Link className="btn btn-secondary" href="/app/submissions">
              <ClipboardCheck size={17} /> Review student work{" "}
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </div>
      <section className="card">
        <h2>Revenue breakdown</h2>
        <div className="grid-2">
          {(["premium", "donation"] as const).map((kind) => (
            <div key={kind}>
              <p className="muted">
                {kind === "premium"
                  ? "Premium memberships"
                  : "Scholarship donations"}
              </p>
              <p className="metric">
                ₦
                {successful
                  .filter((item) => item.kind === kind)
                  .reduce((sum, item) => sum + item.amount, 0)
                  .toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function UsersPanel() {
  const records = useRecords<AcademyUser>("users");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AcademyUser | null>(null);
  const filtered = records.data.filter((user) =>
    `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, pages - 1);
  return (
    <>
      <div className="workspace-toolbar">
        <input
          aria-label="Search people"
          placeholder="Search by name or email…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
        <span className="muted">{filtered.length} people</span>
      </div>
      {records.error && (
        <p role="alert" className="alert">
          {String(records.error)}
        </p>
      )}
      {selected && (
        <UserEditor
          key={selected.id}
          user={selected}
          close={() => setSelected(null)}
        />
      )}
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Primary track</th>
              <th>Membership</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(current * 10, current * 10 + 10).map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </td>
                <td>{user.role}</td>
                <td>{trackName(user.enrolledClassId)}</td>
                <td>
                  {user.premiumGranted
                    ? "Granted Premium"
                    : user.membershipPlan}
                </td>
                <td>
                  {user.role === "Admin" ? (
                    <span className="badge">Owner</span>
                  ) : (
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => setSelected(user)}
                    >
                      Manage
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <Empty
            title={records.loading ? "Loading people…" : "No people found"}
          >
            Students will appear here when they create their accounts.
          </Empty>
        )}
      </section>
      <div className="workspace-pagination">
        <button
          className="btn btn-secondary btn-small"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          Previous
        </button>
        <span className="muted">
          Page {current + 1} of {pages}
        </span>
        <button
          className="btn btn-secondary btn-small"
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}

function UserEditor({ user, close }: { user: AcademyUser; close: () => void }) {
  const [role, setRole] = useState<"Student" | "Instructor">(
    user.role === "Instructor" ? "Instructor" : "Student",
  );
  const [track, setTrack] = useState(user.enrolledClassId);
  const [premium, setPremium] = useState(user.premiumGranted ?? false);
  const [scopes, setScopes] = useState<CareerPathClassId[]>(
    user.instructorTrackIds ?? [],
  );
  const action = useAction();
  return (
    <section className="card">
      <div className="workspace-toolbar">
        <h2>Manage {user.name}</h2>
        <button className="btn btn-secondary btn-small" onClick={close}>
          Close
        </button>
      </div>
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(() =>
            api("users.update", {
              id: user.id,
              role,
              enrolledClassId: track,
              premiumGranted: premium,
              instructorTrackIds: role === "Instructor" ? scopes : [],
            }),
          );
        }}
      >
        <div className="grid-2">
          <label>
            Role
            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "Student" | "Instructor")
              }
            >
              <option>Student</option>
              <option>Instructor</option>
            </select>
          </label>
          <label>
            Primary track
            <TrackSelect
              value={track}
              onChange={(value) => setTrack(value as CareerPathClassId)}
            />
          </label>
        </div>
        <p className="muted">
          Only the academy owner can correct a primary track. Students cannot
          change their own selection.
        </p>
        {role === "Instructor" && (
          <fieldset>
            <legend>Assigned teaching tracks</legend>
            {TRACKS.map((item) => (
              <label className="check-label" key={item.id}>
                <input
                  type="checkbox"
                  checked={scopes.includes(item.id)}
                  onChange={(event) =>
                    setScopes(
                      event.target.checked
                        ? [...scopes, item.id]
                        : scopes.filter((id) => id !== item.id),
                    )
                  }
                />
                {item.name}
              </label>
            ))}
          </fieldset>
        )}
        <label className="check-label">
          <input
            type="checkbox"
            checked={premium}
            onChange={(event) => setPremium(event.target.checked)}
          />
          Grant complimentary Premium access
        </label>
        <ActionMessage action={action} />
        <div>
          <button
            className="btn btn-primary"
            disabled={action.busy || (role === "Instructor" && !scopes.length)}
          >
            {action.busy ? "Saving…" : "Save permissions"}
          </button>
        </div>
      </form>
    </section>
  );
}

function CoursesPanel({ user }: { user: AcademyUser }) {
  const allowed =
    user.role === "Admin"
      ? TRACKS.map((track) => track.id)
      : (user.instructorTrackIds ?? []);
  const [track, setTrack] = useState<CareerPathClassId>(
    allowed[0] ?? "system-dev",
  );
  const modules = useRecords<CourseModule>(
    "modules",
    [["classId", "==", track]],
    allowed.includes(track),
  );
  const assignments = useRecords<Assignment>(
    "assignments",
    [["classId", "==", track]],
    allowed.includes(track),
  );
  const lessons = useRecords<Lesson>(
    "lessons",
    [["classId", "==", track]],
    allowed.includes(track),
  );
  const [moduleEdit, setModuleEdit] = useState<CourseModule | null>(null);
  const [lessonEdit, setLessonEdit] = useState<Lesson | null>(null);
  const [assignmentEdit, setAssignmentEdit] = useState<Assignment | null>(null);
  const [ai, setAi] = useState("");
  const [prompt, setPrompt] = useState("");
  const action = useAction();
  if (!allowed.length)
    return (
      <Empty title="No tracks assigned yet">
        The academy owner will assign your teaching tracks.
      </Empty>
    );
  const ordered = modules.data
    .map((module) => ({
      ...module,
      lessons: lessons.data.filter((lesson) => lesson.moduleId === module.id),
    }))
    .sort((a, b) => a.order - b.order);
  const newModule = () => {
    setLessonEdit(null);
    setAssignmentEdit(null);
    setModuleEdit({
      id: "",
      classId: track,
      title: "",
      description: "",
      order: Math.max(0, ...ordered.map((module) => module.order)) + 1,
      published: false,
      free: false,
    });
  };
  async function editLesson(id: string) {
    await action.run(async () => {
      const lesson = await api<Lesson>("lesson.get", { id });
      setLessonEdit(lesson);
      setModuleEdit(null);
      setAssignmentEdit(null);
    }, "Lesson loaded.");
  }
  return (
    <>
      <div className="workspace-toolbar">
        <TrackSelect
          value={track}
          allowed={allowed}
          onChange={(value) => {
            setTrack(value as CareerPathClassId);
            setModuleEdit(null);
            setLessonEdit(null);
            setAssignmentEdit(null);
          }}
        />
        <div className="workspace-inline">
          <button
            className="btn btn-secondary"
            onClick={() => {
              setModuleEdit(null);
              setLessonEdit(null);
              setAssignmentEdit({
                id: "",
                classId: track,
                title: "",
                description: "",
                dueDate: "",
                totalPoints: 100,
                published: false,
                starter: false,
                milestones: [],
              });
            }}
          >
            New assignment
          </button>
          <button className="btn btn-primary" onClick={newModule}>
            <Plus size={16} /> New module
          </button>
        </div>
      </div>
      <ActionMessage action={action} />
      {(modules.error || assignments.error || lessons.error) && (
        <p className="alert" role="alert">
          {String(modules.error || assignments.error || lessons.error)}
        </p>
      )}
      <TrackProfileEditor key={track} track={track} />
      {moduleEdit && (
        <ModuleEditor
          key={moduleEdit.id || `new-${track}`}
          value={moduleEdit}
          close={() => setModuleEdit(null)}
        />
      )}
      {lessonEdit && (
        <LessonEditor
          key={lessonEdit.id || `new-${lessonEdit.moduleId}`}
          value={lessonEdit}
          close={() => setLessonEdit(null)}
        />
      )}
      {assignmentEdit && (
        <AssignmentEditor
          key={assignmentEdit.id || `new-${track}`}
          value={assignmentEdit}
          close={() => setAssignmentEdit(null)}
        />
      )}
      <section className="workspace-stack">
        {ordered.map((module) => (
          <article className="workspace-panel" key={module.id}>
            <div className="module-heading">
              <div>
                <p className="eyebrow">
                  MODULE {module.order} · {module.free ? "FREE" : "PREMIUM"}
                </p>
                <h3>{module.title}</h3>
                <p className="muted">{module.description}</p>
              </div>
              <div className="workspace-inline">
                <span className="workspace-status">
                  {module.published ? "Published" : "Draft"}
                </span>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    setLessonEdit(null);
                    setAssignmentEdit(null);
                    setModuleEdit(module);
                  }}
                >
                  Edit module
                </button>
              </div>
            </div>
            <ol className="module-lessons">
              {[...(module.lessons ?? [])]
                .sort((a, b) => a.order - b.order)
                .map((lesson) => (
                  <li key={lesson.id}>
                    <span>
                      <strong>{lesson.order}.</strong> {lesson.title}{" "}
                      <span className="muted">· {lesson.duration}</span>
                    </span>
                    <button
                      className="btn btn-secondary btn-small"
                      disabled={action.busy}
                      onClick={() => void editLesson(lesson.id)}
                    >
                      Edit lesson
                    </button>
                  </li>
                ))}
            </ol>
            <button
              className="btn btn-secondary btn-small"
              onClick={() => {
                setModuleEdit(null);
                setAssignmentEdit(null);
                setLessonEdit({
                  id: "",
                  moduleId: module.id,
                  classId: track,
                  title: "",
                  duration: "",
                  videoUrl: "",
                  content: "",
                  order:
                    Math.max(
                      0,
                      ...(module.lessons ?? []).map((lesson) => lesson.order),
                    ) + 1,
                  published: false,
                  free: module.free,
                });
              }}
            >
              <Plus size={15} /> Add lesson
            </button>
          </article>
        ))}
      </section>
      {!ordered.length && (
        <Empty
          title={
            modules.loading
              ? "Loading curriculum…"
              : "Your next great course starts here"
          }
        >
          Add your first module, then bring it to life with videos, notes, and
          exercises.
        </Empty>
      )}
      <section className="card">
        <h2>Assignments & capstones</h2>
        {assignments.data.length ? (
          <div className="workspace-stack">
            {assignments.data.map((assignment) => (
              <div key={assignment.id} className="workspace-toolbar">
                <div>
                  <strong>{assignment.title}</strong>
                  <p className="muted">
                    Due {dateLabel(assignment.dueDate)} ·{" "}
                    {assignment.published ? "Published" : "Draft"} ·{" "}
                    {assignment.starter ? "Free starter" : "Premium"} ·{" "}
                    {assignment.milestones?.length ?? 0} milestones
                  </p>
                </div>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    setModuleEdit(null);
                    setLessonEdit(null);
                    setAssignmentEdit(assignment);
                  }}
                >
                  Edit assignment
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No assignments in this track yet.</p>
        )}
      </section>
      <section className="card">
        <h2>Curriculum assistant</h2>
        <p className="muted">
          Explore a structure for your next module. Review the suggestions, then
          create and publish your own lessons.
        </p>
        <form
          className="workspace-form"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              const result = await api<{ text: string }>("ai.ask", {
                mode: "curriculum",
                prompt: `Track: ${trackName(track)}. ${prompt}`,
              });
              setAi(result.text);
            }, "Curriculum suggestions are ready.");
          }}
        >
          <label>
            What would you like to teach?
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              required
              placeholder="Describe the topic, audience, and learning outcomes…"
            />
          </label>
          <div>
            <button className="btn btn-secondary" disabled={action.busy}>
              {action.busy ? "Working…" : "Suggest curriculum"}
            </button>
          </div>
          {ai && <div className="workspace-result">{ai}</div>}
        </form>
      </section>
    </>
  );
}

function EditorHeading({ title, close }: { title: string; close: () => void }) {
  return (
    <div className="workspace-toolbar">
      <h2>{title}</h2>
      <button
        className="btn btn-secondary btn-small"
        type="button"
        onClick={close}
      >
        Close editor
      </button>
    </div>
  );
}
function ModuleEditor({
  value,
  close,
}: {
  value: CourseModule;
  close: () => void;
}) {
  const [module, setModule] = useState(value);
  const action = useAction();
  return (
    <section className="card">
      <EditorHeading
        title={value.id ? "Edit module" : "Create a module"}
        close={close}
      />
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            await api("module.save", { module });
            close();
          });
        }}
      >
        <label>
          Module title
          <input
            required
            value={module.title}
            onChange={(event) =>
              setModule({ ...module, title: event.target.value })
            }
            maxLength={160}
          />
        </label>
        <label>
          Description
          <textarea
            value={module.description}
            onChange={(event) =>
              setModule({ ...module, description: event.target.value })
            }
            required
          />
        </label>
        <label>
          Position in track
          <input
            type="number"
            min="1"
            step="1"
            value={module.order}
            onChange={(event) =>
              setModule({ ...module, order: Number(event.target.value) })
            }
            required
          />
        </label>
        <div className="workspace-inline">
          <label className="check-label">
            <input
              type="checkbox"
              checked={module.free}
              onChange={(event) =>
                setModule({ ...module, free: event.target.checked })
              }
            />
            Free module
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={module.published}
              onChange={(event) =>
                setModule({ ...module, published: event.target.checked })
              }
            />
            Published
          </label>
        </div>
        <ActionMessage action={action} />
        <div className="workspace-toolbar">
          <button className="btn btn-primary" disabled={action.busy}>
            {action.busy ? "Saving…" : "Save module"}
          </button>
          {value.id && (
            <button
              className="workspace-muted-button workspace-danger"
              type="button"
              disabled={action.busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Delete this module? Remove its lessons first.",
                  )
                )
                  void action.run(async () => {
                    await api("module.delete", { id: value.id });
                    close();
                  });
              }}
            >
              Delete module
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function LessonEditor({ value, close }: { value: Lesson; close: () => void }) {
  const [lesson, setLesson] = useState(value);
  const action = useAction();
  const update = <K extends keyof Lesson>(key: K, val: Lesson[K]) =>
    setLesson({ ...lesson, [key]: val });
  return (
    <section className="card">
      <EditorHeading
        title={value.id ? "Edit lesson" : "Create a lesson"}
        close={close}
      />
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            await api("lesson.save", { lesson });
            close();
          });
        }}
      >
        <label>
          Lesson title
          <input
            required
            value={lesson.title}
            onChange={(event) => update("title", event.target.value)}
            maxLength={160}
          />
        </label>
        <div className="grid-2">
          <label>
            Duration
            <input
              value={lesson.duration}
              placeholder="18 min"
              onChange={(event) => update("duration", event.target.value)}
              required
            />
          </label>
          <label>
            Position in module
            <input
              type="number"
              min="1"
              step="1"
              value={lesson.order}
              onChange={(event) => update("order", Number(event.target.value))}
              required
            />
          </label>
        </div>
        <label>
          Video URL
          <input
            type="url"
            placeholder="https://…"
            value={lesson.videoUrl}
            onChange={(event) => update("videoUrl", event.target.value)}
          />
        </label>
        <label>
          Lesson notes (Markdown)
          <textarea
            className="code-input"
            value={lesson.content}
            onChange={(event) => update("content", event.target.value)}
            placeholder="# What you’ll learn"
            required
            rows={12}
          />
        </label>
        <div className="grid-2">
          <label>
            Starter JavaScript
            <textarea
              className="code-input"
              value={lesson.initialCode ?? ""}
              onChange={(event) => update("initialCode", event.target.value)}
            />
          </label>
          <label>
            Reference solution (staff only)
            <textarea
              className="code-input"
              value={lesson.solutionCode ?? ""}
              onChange={(event) => update("solutionCode", event.target.value)}
            />
          </label>
        </div>
        <fieldset>
          <legend>Resources & reading list</legend>
          {(lesson.resources ?? []).map((resource, index) => (
            <div key={index} className="workspace-stack">
              <div className="grid-2">
                <label>
                  Resource title
                  <input
                    value={resource.title}
                    required
                    onChange={(event) =>
                      update(
                        "resources",
                        lesson.resources?.map((item, idx) =>
                          idx === index
                            ? { ...item, title: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Download or reading URL
                  <input
                    type="url"
                    value={resource.url}
                    required
                    onChange={(event) =>
                      update(
                        "resources",
                        lesson.resources?.map((item, idx) =>
                          idx === index
                            ? { ...item, url: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <button
                className="workspace-muted-button"
                type="button"
                onClick={() =>
                  update(
                    "resources",
                    lesson.resources?.filter((_, idx) => idx !== index),
                  )
                }
              >
                Remove resource
              </button>
            </div>
          ))}
          <div>
            <button
              className="btn btn-secondary btn-small"
              type="button"
              onClick={() =>
                update("resources", [
                  ...(lesson.resources ?? []),
                  { title: "", url: "" },
                ])
              }
            >
              Add resource
            </button>
          </div>
        </fieldset>
        <div className="workspace-inline">
          <label className="check-label">
            <input
              type="checkbox"
              checked={lesson.free}
              onChange={(event) => update("free", event.target.checked)}
            />
            Free lesson
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={lesson.published}
              onChange={(event) => update("published", event.target.checked)}
            />
            Published
          </label>
        </div>
        <ActionMessage action={action} />
        <div className="workspace-toolbar">
          <button className="btn btn-primary" disabled={action.busy}>
            {action.busy ? "Saving…" : "Save lesson"}
          </button>
          {value.id && (
            <button
              className="workspace-muted-button workspace-danger"
              type="button"
              disabled={action.busy}
              onClick={() => {
                if (window.confirm("Delete this lesson permanently?"))
                  void action.run(async () => {
                    await api("lesson.delete", { id: value.id });
                    close();
                  });
              }}
            >
              Delete lesson
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function AssignmentEditor({
  value,
  close,
}: {
  value: Assignment;
  close: () => void;
}) {
  const [assignment, setAssignment] = useState(value);
  const action = useAction();
  return (
    <section className="card">
      <EditorHeading
        title={value.id ? "Edit assignment" : "Create an assignment"}
        close={close}
      />
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            await api("assignment.save", {
              assignment: {
                ...assignment,
                totalPoints: 100,
                dueDate: new Date(assignment.dueDate).toISOString(),
                milestones: assignment.milestones?.map((item) => ({
                  ...item,
                  dueDate: new Date(item.dueDate).toISOString(),
                })),
              },
            });
            close();
          });
        }}
      >
        <label>
          Title
          <input
            required
            value={assignment.title}
            onChange={(event) =>
              setAssignment({ ...assignment, title: event.target.value })
            }
          />
        </label>
        <label>
          Brief and assessment criteria
          <textarea
            required
            rows={8}
            value={assignment.description}
            onChange={(event) =>
              setAssignment({ ...assignment, description: event.target.value })
            }
          />
        </label>
        <label>
          Submission deadline
          <input
            type="datetime-local"
            required
            value={localDate(assignment.dueDate)}
            onChange={(event) =>
              setAssignment({ ...assignment, dueDate: event.target.value })
            }
          />
        </label>
        <fieldset>
          <legend>Capstone milestones</legend>
          {(assignment.milestones ?? []).map((milestone, index) => (
            <div key={index} className="workspace-stack">
              <div className="grid-2">
                <label>
                  Milestone
                  <input
                    required
                    value={milestone.title}
                    onChange={(event) =>
                      setAssignment({
                        ...assignment,
                        milestones: assignment.milestones?.map((item, idx) =>
                          idx === index
                            ? { ...item, title: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Deadline
                  <input
                    type="datetime-local"
                    required
                    value={localDate(milestone.dueDate)}
                    onChange={(event) =>
                      setAssignment({
                        ...assignment,
                        milestones: assignment.milestones?.map((item, idx) =>
                          idx === index
                            ? { ...item, dueDate: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="workspace-muted-button"
                onClick={() =>
                  setAssignment({
                    ...assignment,
                    milestones: assignment.milestones?.filter(
                      (_, idx) => idx !== index,
                    ),
                  })
                }
              >
                Remove milestone
              </button>
            </div>
          ))}
          <div>
            <button
              className="btn btn-secondary btn-small"
              type="button"
              onClick={() =>
                setAssignment({
                  ...assignment,
                  milestones: [
                    ...(assignment.milestones ?? []),
                    { title: "", dueDate: "" },
                  ],
                })
              }
            >
              Add milestone
            </button>
          </div>
        </fieldset>
        <label className="check-label">
          <input
            type="checkbox"
            checked={assignment.starter ?? false}
            onChange={(event) =>
              setAssignment({ ...assignment, starter: event.target.checked })
            }
          />
          Free starter assignment
        </label>
        <p className="muted">
          Free students can submit starter assignments for practice. Only
          Premium submissions enter the instructor review queue.
        </p>
        <label className="check-label">
          <input
            type="checkbox"
            checked={assignment.published ?? false}
            onChange={(event) =>
              setAssignment({ ...assignment, published: event.target.checked })
            }
          />
          Publish assignment
        </label>
        <ActionMessage action={action} />
        <div className="workspace-toolbar">
          <button className="btn btn-primary" disabled={action.busy}>
            {action.busy ? "Saving…" : "Save assignment"}
          </button>
          {value.id && (
            <button
              className="workspace-muted-button workspace-danger"
              type="button"
              disabled={action.busy}
              onClick={() => {
                if (window.confirm("Delete this assignment?"))
                  void action.run(async () => {
                    await api("assignment.delete", { id: value.id });
                    close();
                  });
              }}
            >
              Delete assignment
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
export function localDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function SubmissionsPanel({ user }: { user: AcademyUser }) {
  const allowed =
    user.role === "Admin"
      ? TRACKS.map((track) => track.id)
      : (user.instructorTrackIds ?? []);
  const records = useRecords<AssignmentSubmission>(
    "submissions",
    user.role === "Admin"
      ? []
      : [["classId", "in", allowed.length ? allowed : ["unassigned"]]],
    allowed.length > 0,
  );
  const [track, setTrack] = useState<CareerPathClassId | "all">("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AssignmentSubmission | null>(null);
  const filtered = records.data
    .filter(
      (item) =>
        item.status !== "draft" &&
        item.reviewEligible === true &&
        (track === "all" || item.classId === track) &&
        (status === "all" || item.status === status) &&
        `${item.studentName} ${item.assignmentId}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return (
    <>
      <div className="workspace-toolbar">
        <input
          aria-label="Search submissions"
          placeholder="Search student or assignment ID…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <TrackSelect value={track} onChange={setTrack} all allowed={allowed} />
        <select
          aria-label="Submission status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="under-review">Under review</option>
          <option value="graded">Graded</option>
        </select>
      </div>
      {records.error && (
        <p role="alert" className="alert">
          {String(records.error)}
        </p>
      )}
      {selected && (
        <ReviewEditor
          key={selected.id}
          submission={selected}
          close={() => setSelected(null)}
        />
      )}
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Track</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Rating</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.studentName}</strong>
                  <small>{item.assignmentId}</small>
                </td>
                <td>{trackName(item.classId)}</td>
                <td>{dateLabel(item.submittedAt)}</td>
                <td>
                  <span className="workspace-status">
                    {item.status.replace("-", " ")}
                  </span>
                </td>
                <td>{item.grade === undefined ? "—" : `${item.grade}/100`}</td>
                <td>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setSelected(item)}
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <Empty
            title={
              records.loading
                ? "Loading submissions…"
                : "Your review queue is clear"
            }
          >
            Submitted student work will appear here.
          </Empty>
        )}
      </section>
    </>
  );
}

function ReviewEditor({
  submission,
  close,
}: {
  submission: AssignmentSubmission;
  close: () => void;
}) {
  const assignment = useRecord<Assignment>(
    "assignments",
    submission.assignmentId,
  );
  const { authUser } = useAcademy();
  const [grade, setGrade] = useState(submission.grade ?? 0);
  const [feedback, setFeedback] = useState(submission.feedback ?? "");
  const [rubric, setRubric] = useState(submission.rubric ?? []);
  const [lines, setLines] = useState(submission.lineFeedback ?? []);
  const [ai, setAi] = useState("");
  const action = useAction();
  async function downloadAttachment(url: string) {
    await action.run(async () => {
      const token = authUser ? await accessToken() : undefined;
      if (!token) throw new Error("Please sign in again.");
      const attachmentUrl = url.startsWith("uploads/")
        ? "/api/upload?path=" + encodeURIComponent(url)
        : url;
      const parsed = new URL(attachmentUrl, window.location.origin);
      if (
        parsed.origin !== window.location.origin ||
        parsed.pathname !== "/api/upload"
      )
        throw new Error("This attachment does not use academy storage.");
      const response = await fetch(attachmentUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Unable to download attachment.");
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download =
        parsed.searchParams.get("path")?.split("/").pop() ?? "attachment";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }, "Attachment downloaded.");
  }
  return (
    <section className="card">
      <EditorHeading
        title={`Review: ${submission.studentName}`}
        close={close}
      />
      <h3>{assignment.data?.title ?? "Assignment submission"}</h3>
      <p className="muted">
        {trackName(submission.classId)} · Submitted{" "}
        {dateLabel(submission.submittedAt)}
      </p>
      <div className="workspace-inline">
        <ExternalLink href={submission.repoUrl}>Repository</ExternalLink>
        <ExternalLink href={submission.liveUrl}>Live project</ExternalLink>
        {submission.attachments?.map((url, index) => (
          <button
            key={url}
            type="button"
            className="btn btn-secondary btn-small"
            disabled={action.busy}
            onClick={() => void downloadAttachment(url)}
          >
            Attachment {index + 1}
          </button>
        ))}
      </div>
      <div className="workspace-note">{submission.writeUp}</div>
      <hr className="workspace-divider" />
      <div className="workspace-inline">
        <button
          className="btn btn-secondary btn-small"
          disabled={action.busy || submission.status === "graded"}
          onClick={() =>
            void action.run(
              () => api("submission.review", { id: submission.id }),
              "Marked as under review.",
            )
          }
        >
          Mark under review
        </button>
        <button
          className="btn btn-secondary btn-small"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              const result = await api<{ text: string }>("ai.ask", {
                mode: "review",
                prompt: `Suggest constructive feedback and a provisional 0–100 rating. An instructor will make the final decision. Assignment: ${assignment.data?.description ?? submission.assignmentId}`,
                code: submission.writeUp.slice(0, 30000),
              });
              setAi(result.text);
            }, "AI suggestion ready for your review.")
          }
        >
          Request AI suggestion
        </button>
      </div>
      {ai && (
        <div className="workspace-stack">
          <p className="muted">
            AI advice only. Verify the work and choose your own final rating.
          </p>
          <div className="workspace-result">{ai}</div>
        </div>
      )}
      <hr className="workspace-divider" />
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(
            () =>
              api("submission.grade", {
                id: submission.id,
                grade,
                feedback,
                rubric,
                lineFeedback: lines,
              }),
            "Rating and feedback published to the student.",
          );
        }}
      >
        <label>
          Final rating (0–100)
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            required
            value={grade}
            onChange={(event) => setGrade(Number(event.target.value))}
          />
        </label>
        <label>
          Written feedback
          <textarea
            required
            rows={6}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="What worked well? What should the student improve next?"
          />
        </label>
        <fieldset>
          <legend>Custom rubric</legend>
          {rubric.map((item, index) => (
            <div className="workspace-inline" key={index}>
              <label>
                Criterion
                <input
                  required
                  value={item.criterion}
                  onChange={(event) =>
                    setRubric(
                      rubric.map((row, idx) =>
                        idx === index
                          ? { ...row, criterion: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Score (0–100)
                <input
                  required
                  type="number"
                  min="0"
                  max="100"
                  value={item.score}
                  onChange={(event) =>
                    setRubric(
                      rubric.map((row, idx) =>
                        idx === index
                          ? { ...row, score: Number(event.target.value) }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="workspace-muted-button"
                onClick={() =>
                  setRubric(rubric.filter((_, idx) => idx !== index))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <div>
            <button
              className="btn btn-secondary btn-small"
              type="button"
              onClick={() =>
                setRubric([...rubric, { criterion: "", score: 0 }])
              }
            >
              Add criterion
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>Line-by-line feedback</legend>
          {lines.map((item, index) => (
            <div key={index} className="workspace-inline">
              <label>
                Line
                <input
                  required
                  type="number"
                  min="1"
                  value={item.line}
                  onChange={(event) =>
                    setLines(
                      lines.map((row, idx) =>
                        idx === index
                          ? { ...row, line: Number(event.target.value) }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Comment
                <input
                  required
                  value={item.comment}
                  onChange={(event) =>
                    setLines(
                      lines.map((row, idx) =>
                        idx === index
                          ? { ...row, comment: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="workspace-muted-button"
                onClick={() =>
                  setLines(lines.filter((_, idx) => idx !== index))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <div>
            <button
              className="btn btn-secondary btn-small"
              type="button"
              onClick={() => setLines([...lines, { line: 1, comment: "" }])}
            >
              Add line feedback
            </button>
          </div>
        </fieldset>
        <ActionMessage action={action} />
        <div>
          <button className="btn btn-primary" disabled={action.busy}>
            <Check size={16} />
            {action.busy ? "Publishing…" : "Publish rating & feedback"}
          </button>
        </div>
      </form>
    </section>
  );
}

function NotificationsPanel() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<
    "all" | "track" | "free" | "premium"
  >("all");
  const [track, setTrack] = useState<CareerPathClassId>("system-dev");
  const [channels, setChannels] = useState(["in-app"]);
  const [actionScreen, setActionScreen] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [whatsappTemplate, setWhatsappTemplate] = useState("");
  const [history, setHistory] = useState<
    {
      id: string;
      title: string;
      audience: string;
      channels: string[];
      status: string;
      scheduledFor: string;
      recipientCount: number;
      sentCount: number;
      failedCount: number;
      createdAt: string;
    }[]
  >([]);
  const [configuration, setConfiguration] = useState({
    email: false,
    whatsapp: false,
    automation: false,
  });
  const [loadingHistory, setLoadingHistory] = useState(true);
  const action = useAction();
  const refresh = async () => {
    const result = await api<{
      broadcasts: typeof history;
      configuration: typeof configuration;
    }>("broadcast.list");
    setHistory(result.broadcasts);
    setConfiguration(result.configuration);
    setLoadingHistory(false);
  };
  useEffect(() => {
    void refresh().catch(() => setLoadingHistory(false));
    // This panel has no changing inputs; it loads once when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleChannel = (channel: string, checked: boolean) =>
    setChannels((current) =>
      checked
        ? [...new Set([...current, channel])]
        : current.filter((item) => item !== channel),
    );
  return (
    <>
      <section className="card">
        <div className="workspace-toolbar">
          <div>
            <h2>Broadcast a message</h2>
            <p className="workspace-note">
              One message can appear in-app and be delivered by email or
              WhatsApp.
            </p>
          </div>
          <div className="broadcast-health" aria-label="Channel status">
            <span className={configuration.email ? "ready" : "waiting"}>
              Email {configuration.email ? "ready" : "needs keys"}
            </span>
            <span className={configuration.whatsapp ? "ready" : "waiting"}>
              WhatsApp {configuration.whatsapp ? "ready" : "needs keys"}
            </span>
          </div>
        </div>
        <form
          className="workspace-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!channels.length) return;
            void action.run(
              async () => {
                await api("broadcast.send", {
                  title,
                  message,
                  audience,
                  ...(audience === "track" ? { trackId: track } : {}),
                  channels,
                  ...(actionScreen ? { actionPath: actionScreen } : {}),
                  ...(scheduledFor
                    ? { scheduledFor: new Date(scheduledFor).toISOString() }
                    : {}),
                  ...(whatsappTemplate ? { whatsappTemplate } : {}),
                });
                setTitle("");
                setMessage("");
                setActionScreen("");
                setScheduledFor("");
                await refresh();
              },
              configuration.email || configuration.whatsapp
                ? "Broadcast queued and available channels are being delivered."
                : "Broadcast saved safely. External delivery will begin after the keys are configured.",
            );
          }}
        >
          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={160}
              placeholder="Give your announcement a clear title"
            />
          </label>
          <label>
            Message
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
              maxLength={5000}
              rows={5}
            />
          </label>
          <div className="grid-2">
            <label>
              Audience
              <select
                value={audience}
                onChange={(event) => {
                  const next = event.target.value as
                    "all" | "track" | "free" | "premium";
                  setAudience(next);
                  if (["free", "premium"].includes(next))
                    setChannels((current) => {
                      const external = current.filter(
                        (channel) => channel !== "in-app",
                      );
                      return external.length ? external : ["email"];
                    });
                }}
              >
                <option value="all">All students</option>
                <option value="track">One career path</option>
                <option value="free">Free students</option>
                <option value="premium">Premium students</option>
              </select>
            </label>
            {audience === "track" ? (
              <label>
                Career path
                <TrackSelect
                  value={track}
                  onChange={(value) => setTrack(value as CareerPathClassId)}
                />
              </label>
            ) : (
              <label>
                Schedule (optional)
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                />
              </label>
            )}
          </div>
          {audience === "track" && (
            <label>
              Schedule (optional)
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
              />
            </label>
          )}
          <fieldset>
            <legend>Delivery channels</legend>
            {[
              ["in-app", "In-app notification"],
              ["email", "Email"],
              ["whatsapp", "WhatsApp"],
            ].map(([value, label]) => (
              <label className="check-label" key={value}>
                <input
                  type="checkbox"
                  checked={channels.includes(value)}
                  disabled={
                    value === "in-app" && ["free", "premium"].includes(audience)
                  }
                  onChange={(event) =>
                    toggleChannel(value, event.target.checked)
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          {channels.includes("whatsapp") && (
            <label>
              Approved WhatsApp template name
              <input
                value={whatsappTemplate}
                onChange={(event) => setWhatsappTemplate(event.target.value)}
                pattern="[a-z0-9_]+"
                placeholder="Uses WHATSAPP_BROADCAST_TEMPLATE when empty"
              />
              <small>
                The template body must accept title as variable 1 and message as
                variable 2.
              </small>
            </label>
          )}
          <label>
            Link to academy page (optional)
            <select
              value={actionScreen}
              onChange={(event) => setActionScreen(event.target.value)}
            >
              <option value="">No link</option>
              <option value="/app/tracks">Curriculum</option>
              <option value="/app/assignments">Assignments</option>
              <option value="/app/sessions">Live sessions</option>
              <option value="/app/community">Community</option>
            </select>
          </label>
          {(title || message) && (
            <aside className="broadcast-preview" aria-label="Message preview">
              <small>MESSAGE PREVIEW</small>
              <strong>{title || "Your announcement title"}</strong>
              <p>{message || "Your message will appear here."}</p>
              <span>{channels.join(" · ")}</span>
            </aside>
          )}
          <ActionMessage action={action} />
          <div>
            <button
              className="btn btn-primary"
              disabled={action.busy || !channels.length}
            >
              {action.busy
                ? "Creating broadcast…"
                : scheduledFor
                  ? "Schedule broadcast"
                  : "Send broadcast"}
            </button>
          </div>
        </form>
      </section>
      <section className="card">
        <div className="workspace-toolbar">
          <h2>Broadcast history</h2>
          <button
            className="btn btn-secondary btn-small"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await api("broadcast.process");
                await refresh();
              }, "The queued delivery worker has finished.")
            }
          >
            Process queued messages
          </button>
        </div>
        <div className="workspace-stack">
          {history.map((item) => (
            <article className="workspace-panel" key={item.id}>
              <div className="workspace-toolbar">
                <h3>{item.title}</h3>
                <span className="workspace-status">{item.status}</span>
              </div>
              <p className="muted">
                {item.audience} · {item.channels.join(", ")} ·{" "}
                {dateLabel(item.scheduledFor)}
              </p>
              <p className="workspace-note">
                {item.recipientCount} recipients · {item.sentCount} external
                messages sent · {item.failedCount} failed
              </p>
            </article>
          ))}
        </div>
        {!history.length && (
          <Empty
            title={loadingHistory ? "Loading broadcasts…" : "No broadcasts yet"}
          >
            Your first email, WhatsApp or in-app broadcast will appear here.
          </Empty>
        )}
      </section>
    </>
  );
}

function SettingsPanel() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<PlatformSettings>("settings.get")
      .then(setSettings)
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Unable to load settings.",
        ),
      );
  }, []);
  return !settings && !error ? (
    <p className="muted">Loading settings…</p>
  ) : error ? (
    <p className="alert" role="alert">
      {error}
    </p>
  ) : (
    <SettingsForm
      key={JSON.stringify(settings)}
      initial={
        settings ?? {
          academyName: "EA Academy",
          enrollmentOpen: true,
          scholarshipCost: PREMIUM_PRICE,
        }
      }
    />
  );
}
function SettingsForm({ initial }: { initial: PlatformSettings }) {
  const [settings, setSettings] = useState(initial);
  const action = useAction();
  return (
    <>
      <section className="card">
        <form
          className="workspace-form"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(() =>
              api("settings.save", {
                settings: {
                  ...settings,
                  supportEmail: settings.supportEmail || undefined,
                },
              }),
            );
          }}
        >
          <h2>General details</h2>
          <label>
            Academy name
            <input
              required
              value={settings.academyName ?? ""}
              onChange={(event) =>
                setSettings({ ...settings, academyName: event.target.value })
              }
            />
          </label>
          <label>
            Support email
            <input
              type="email"
              value={settings.supportEmail ?? ""}
              onChange={(event) =>
                setSettings({ ...settings, supportEmail: event.target.value })
              }
            />
          </label>
          <label>
            Public announcement
            <textarea
              value={settings.announcement ?? ""}
              onChange={(event) =>
                setSettings({ ...settings, announcement: event.target.value })
              }
            />
          </label>
          <label>
            WhatsApp group invite link
            <input
              type="url"
              placeholder="https://chat.whatsapp.com/..."
              value={settings.whatsappGroupUrl ?? ""}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  whatsappGroupUrl: event.target.value,
                })
              }
            />
            <small>Shown privately to students after registration.</small>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={settings.enrollmentOpen ?? true}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  enrollmentOpen: event.target.checked,
                })
              }
            />
            Accept new student enrollments
          </label>
          <hr className="workspace-divider" />
          <h2>Scholarship fund</h2>
          <div className="grid-2">
            <label>
              Fundraising goal (₦)
              <input
                type="number"
                min="0"
                step="1"
                value={settings.scholarshipGoal ?? ""}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    scholarshipGoal: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Cost per sponsored student (₦)
              <input
                type="number"
                min="1"
                step="1"
                value={settings.scholarshipCost ?? PREMIUM_PRICE}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    scholarshipCost: Number(event.target.value),
                  })
                }
                required
              />
            </label>
          </div>
          <ActionMessage action={action} />
          <div>
            <button className="btn btn-primary" disabled={action.busy}>
              {action.busy ? "Saving…" : "Save academy settings"}
            </button>
          </div>
        </form>
      </section>
      <section className="card">
        <h2>Membership & ownership</h2>
        <p>
          Premium membership:{" "}
          <strong>₦{PREMIUM_PRICE.toLocaleString()} per month</strong>
        </p>
        <p className="muted">
          Premium unlocks every career track. Billing is in naira.
        </p>
        <p>
          Sole academy owner: <strong>EmmanuelAmadin@gmail.com</strong>
        </p>
        <p className="muted">
          The owner can appoint instructors from People & permissions. Ownership
          is protected and cannot be reassigned here.
        </p>
      </section>
    </>
  );
}
