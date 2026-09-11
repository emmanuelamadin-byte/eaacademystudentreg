"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Download,
  FileText,
  Flame,
  GraduationCap,
  Lock,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  Send,
  Target,
  Trash2,
  Trophy,
  Award,
  Linkedin,
  Share2,
  Copy,
  ExternalLink,
  Store,
  ShoppingBag,
} from "lucide-react";
import { useAcademy } from "@/components/academy-provider";
import { api } from "@/lib/api";
import { useRecords } from "@/lib/hooks";
import { extractVideoUrl, getVideoEmbed } from "@/lib/video";
import {
  getCertificateTitle,
  getLinkedInCertUrl,
  getLinkedInShareUrl,
} from "@/lib/certificate";
import {
  TRACKS,
  isPremium,
  type Assignment,
  type AssignmentSubmission,
  type AcademyNotification,
  type CourseModule,
  type Lesson,
  type Progress,
  type Discussion,
  type CareerPathClassId,
  type ShopItem,
  type ShopPurchase,
} from "@/lib/types";
import type { StreakSummary } from "@/lib/streaks";
import { isBirthdayToday } from "@/lib/birthdays";
import Assignments from "./learning/assignments";
import { queueAction, readQueue } from "./learning/offline";
import "./learning/learning.css";
export { LearningSync } from "./learning/offline";

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
const safeUrl = (value: string) => {
  try {
    const clean = extractVideoUrl(value);
    const url = new URL(clean);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
};
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <BookOpen size={32} />
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}
function Header({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {children}
    </header>
  );
}

export default function Learning({
  section,
  id,
}: {
  section: string;
  id?: string;
}) {
  if (section === "lesson") return <LessonPlayer key={id} id={id} />;
  if (section === "classes") return <Classroom />;
  if (section === "assignments") return <Assignments id={id} />;
  if (section === "transcript") return <LearningRecord />;
  if (section === "tracks") return <TrackLibrary />;
  return <Dashboard />;
}

function Dashboard() {
  const { user } = useAcademy();
  const [streak, setStreak] = useState<StreakSummary | null>(null);
  const modules = useRecords<CourseModule>("modules", [
    ["published", "==", true],
  ]);
  const progress = useRecords<Progress>(
    "progress",
    [["studentId", "==", user?.id || ""]],
    !!user,
  );
  const assignments = useRecords<Assignment>("assignments", [
    ["published", "==", true],
  ]);
  const submissions = useRecords<AssignmentSubmission>(
    "submissions",
    [["studentId", "==", user?.id || ""]],
    !!user,
  );
  const announcements = useRecords<AcademyNotification>(
    "notifications",
    [["targetTrack", "in", ["all", user?.enrolledClassId || "system-dev"]]],
    !!user,
  );
  const shopItems = useRecords<ShopItem>("shopItems", [
    ["published", "==", true],
  ]);
  const myPurchases = useRecords<ShopPurchase>(
    "shopPurchases",
    [["studentId", "==", user?.id || ""]],
    !!user,
  );
  useEffect(() => {
    if (!user) return;
    let active = true;
    void api<StreakSummary>("streak.get")
      .then((value) => {
        if (active) setStreak(value);
      })
      .catch(() => {
        if (active) setStreak(null);
      });
    return () => {
      active = false;
    };
  }, [user]);
  if (!user) return null;
  const track =
    TRACKS.find((item) => item.id === user.enrolledClassId) || TRACKS[0];
  const trackModules = modules.data
    .filter((item) => item.classId === track.id)
    .sort((a, b) => a.order - b.order);
  const lessons = trackModules.flatMap((module) => module.lessons || []);
  const completed = new Set(progress.data.map((item) => item.lessonId));
  const done = lessons.filter((lesson) => completed.has(lesson.id)).length;
  const percentage = lessons.length
    ? Math.round((done / lessons.length) * 100)
    : 0;
  const next = lessons.find((lesson) => !completed.has(lesson.id));
  const graded = submissions.data.filter(
    (item) => item.status === "graded" && typeof item.grade === "number",
  );
  const average = graded.length
    ? Math.round(
        graded.reduce((sum, item) => sum + (item.grade || 0), 0) /
          graded.length,
      )
    : null;
  const pending = assignments.data
    .filter(
      (item) =>
        (isPremium(user) ||
          (item.classId === track.id && item.starter === true)) &&
        !submissions.data.some(
          (submission) =>
            submission.assignmentId === item.id &&
            submission.status !== "draft",
        ),
    )
    .sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate));
  const news = announcements.data
    .filter(
      (item) => item.targetTrack === "all" || item.targetTrack === track.id,
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 3);
  return (
    <div>
      <Header
        eyebrow="YOUR NEXT CHAPTER STARTS HERE"
        title={`Welcome back, ${user.name.split(" ")[0]}.`}
        description="A little progress today. A different future tomorrow."
      >
        <Link className="btn btn-secondary" href="/app/transcript">
          <FileText size={16} /> Learning record
        </Link>
      </Header>
      {!user.birthday && (
        <section className="birthday-reminder" role="status">
          <div>
            <strong>Add your birthday</strong>
            <p>
              Tell us the month and day so EA Academy can celebrate you. We do
              not ask for your birth year.
            </p>
          </div>
          <Link className="btn btn-primary" href="/app/account">
            Add birthday <ArrowRight size={16} />
          </Link>
        </section>
      )}
      {isBirthdayToday(user.birthday, user.timeZone || "UTC") && (
        <section className="birthday-greeting" role="status">
          <div>
            <strong>Happy birthday, {user.name.split(" ")[0]}!</strong>
            <p>
              Everyone at EA Academy is celebrating you today. Keep learning,
              building, and growing.
            </p>
          </div>
        </section>
      )}
      {(modules.error || progress.error) && (
        <p className="alert">{modules.error || progress.error}</p>
      )}
      <section className="learning-hero">
        <div>
          <span className="hero-pill">
            <span /> YOUR PRIMARY TRACK
          </span>
          <h2>{track.name}</h2>
          <p>{track.description}</p>
          <Link
            className="btn btn-light"
            href={next ? `/app/lesson/${next.id}` : "/app/tracks"}
          >
            {done ? "Continue learning" : "Explore your curriculum"}
            <ArrowRight size={17} />
          </Link>
        </div>
        <div
          className="progress-orbit"
          style={
            { "--progress": `${percentage * 3.6}deg` } as React.CSSProperties
          }
        >
          <div>
            <strong>
              {percentage}
              <small>%</small>
            </strong>
            <span>TRACK COMPLETE</span>
          </div>
        </div>
      </section>
      <div className="learning-stats">
        <div className="card">
          <span className="stat-icon">
            <CheckCircle2 size={20} />
          </span>
          <div>
            <p className="muted">Lessons completed</p>
            <strong>
              {done}
              <small> / {lessons.length}</small>
            </strong>
          </div>
        </div>
        <div className="card">
          <span className="stat-icon warm">
            <Target size={20} />
          </span>
          <div>
            <p className="muted">Assignments to explore</p>
            <strong>{pending.length}</strong>
          </div>
        </div>
        <div className="card">
          <span className="stat-icon green">
            <Trophy size={20} />
          </span>
          <div>
            <p className="muted">Average instructor rating</p>
            <strong>
              {average ?? "—"}
              {average !== null && <small> / 100</small>}
            </strong>
          </div>
        </div>
        <div className="card">
          <span className="stat-icon streak">
            <Flame size={20} />
          </span>
          <div>
            <p className="muted">Current learning streak</p>
            <strong>
              {streak?.currentStreak ?? 0}
              <small>
                {streak?.currentStreak === 1 ? " day" : " days"} · best{" "}
                {streak?.longestStreak ?? 0}
              </small>
            </strong>
            {streak?.week && (
              <div
                className="streak-mini-week"
                aria-label="This week's learning days"
              >
                {streak.week.map((d) => (
                  <span
                    key={d.date}
                    className={`streak-mini-day ${d.active ? "active" : ""}`}
                    title={`${d.day}: ${d.active ? "Learned" : "Rest"}`}
                  >
                    {d.day[0]}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SHOP SECTION */}
      <section className="dashboard-shop-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">DIGITAL PRODUCTS & MASTERCLASSES</span>
            <h2>Shop</h2>
          </div>
          <Link
            href="/shop"
            scroll={true}
            onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
            className="dashboard-shop-browse-link"
          >
            Explore all items <ArrowRight size={15} />
          </Link>
        </div>

        {shopItems.loading ? (
          <div className="dashboard-shop-loading">
            {[1, 2, 3].map((i) => (
              <div key={i} className="dashboard-shop-card-skeleton" />
            ))}
          </div>
        ) : shopItems.data.length > 0 ? (
          <div className="dashboard-shop-grid">
            {shopItems.data.slice(0, 3).map((item) => {
              const isCourse = item.type === "course";
              const isOwned = myPurchases.data.some((p) => p.itemId === item.id);
              return (
                <article key={item.id} className="dashboard-shop-card">
                  <Link
                    href={`/shop/${item.slug}`}
                    scroll={true}
                    onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
                    className="dashboard-shop-card-img"
                  >
                    {item.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.thumbnailUrl} alt={item.title} loading="lazy" />
                    ) : (
                      <div className="dashboard-shop-card-fallback">
                        {isCourse ? <BookOpen size={28} /> : <Download size={28} />}
                      </div>
                    )}
                    <span className={`dashboard-shop-type-tag ${isCourse ? "course" : "product"}`}>
                      {isCourse ? "Course" : "Digital Asset"}
                    </span>
                  </Link>
                  <div className="dashboard-shop-card-body">
                    <div className="dashboard-shop-card-category">{item.category}</div>
                    <h3 className="dashboard-shop-card-title">
                      <Link
                        href={`/shop/${item.slug}`}
                        scroll={true}
                        onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
                      >
                        {item.title}
                      </Link>
                    </h3>
                    <p className="dashboard-shop-card-sub">{item.subtitle}</p>
                    <div className="dashboard-shop-card-footer">
                      <div className="dashboard-shop-card-price">
                        <strong>₦{item.price.toLocaleString("en-NG")}</strong>
                        {item.compareAtPrice && item.compareAtPrice > item.price && (
                          <small>₦{item.compareAtPrice.toLocaleString("en-NG")}</small>
                        )}
                      </div>
                      {isOwned ? (
                        <Link
                          href={isCourse ? `/app/learn-course/${item.id}` : "/app/library"}
                          scroll={true}
                          onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
                          className="btn btn-secondary btn-small"
                        >
                          {isCourse ? "Open classroom" : "Download"}
                        </Link>
                      ) : (
                        <Link
                          href={`/shop/${item.slug}`}
                          scroll={true}
                          onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
                          className="btn btn-primary btn-small"
                        >
                          View details
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-shop-empty-banner">
            <div className="dashboard-shop-empty-content">
              <div className="dashboard-shop-empty-icon">
                <Store size={26} />
              </div>
              <div>
                <h3>EA Academy Shop</h3>
                <p>
                  Explore standard professional masterclasses, certification courses, and
                  production-ready digital assets, templates, and guides.
                </p>
              </div>
            </div>
            <Link
              href="/shop"
              scroll={true}
              onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
              className="btn btn-primary"
            >
              Browse shop <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </section>

      <div className="dashboard-columns">
        <section>
          <div className="section-heading">
            <h2>Your learning path</h2>
            <Link href="/app/tracks">
              View curriculum <ArrowRight size={15} />
            </Link>
          </div>
          {modules.loading ? (
            <div className="card">Loading your curriculum…</div>
          ) : trackModules.length ? (
            <div className="module-stack">
              {trackModules.slice(0, 3).map((module, index) => (
                <ModuleCard
                  key={module.id}
                  module={module}
                  index={index}
                  completed={completed}
                />
              ))}
            </div>
          ) : (
            <Empty
              title="Your path is taking shape"
              body="Your instructor will publish modules, lessons, and resources here. Your account is ready when the curriculum is."
            />
          )}
          <div className="community-callout">
            <MessageCircle size={26} />
            <div>
              <h3>Better, together.</h3>
              <p className="muted">
                Meet your cohort, share ideas, and learn from each other.
              </p>
            </div>
            <Link href="/app/community" className="btn btn-secondary btn-small">
              Visit the lounge <ArrowRight size={15} />
            </Link>
          </div>
        </section>
        <aside className="dashboard-aside">
          <section className="card">
            <div className="section-heading">
              <h3>Up next</h3>
              <Clock size={17} />
            </div>
            {pending.length ? (
              pending.slice(0, 3).map((assignment) => (
                <Link
                  key={assignment.id}
                  href={`/app/assignments/${assignment.id}`}
                  className="up-next"
                >
                  <span className="eyebrow">ASSIGNMENT</span>
                  <strong>{assignment.title}</strong>
                  <span className="muted">
                    {assignment.dueDate
                      ? `Due ${new Date(assignment.dueDate).toLocaleDateString()}`
                      : "Self-paced"}
                    <ChevronRight size={15} />
                  </span>
                </Link>
              ))
            ) : (
              <p className="muted">
                You have no pending assignments. New challenges will appear
                here.
              </p>
            )}
          </section>
          <section className="card">
            <div className="section-heading">
              <h3>Academy updates</h3>
              <span className="small-dot" />
            </div>
            {news.length ? (
              news.map((item) => (
                <div className="news-item" key={item.id}>
                  <small>{new Date(item.createdAt).toLocaleDateString()}</small>
                  <h4>{item.title}</h4>
                  <p className="muted">{item.message}</p>
                </div>
              ))
            ) : (
              <p className="muted">
                Announcements from your instructors will appear here.
              </p>
            )}
          </section>
          {!isPremium(user) && (
            <section className="premium-aside">
              <span className="eyebrow">GO FURTHER</span>
              <h3>
                Three tracks.
                <br />
                One membership.
              </h3>
              <p>Unlock the full academy for ₦3,000 per month.</p>
              <Link href="/app/billing" className="btn btn-light btn-small">
                Explore Premium <ArrowRight size={15} />
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function ModuleCard({
  module,
  index,
  completed,
}: {
  module: CourseModule;
  index: number;
  completed: Set<string>;
}) {
  const { user } = useAcademy();
  const lessons = [...(module.lessons || [])].sort((a, b) => a.order - b.order);
  const count = lessons.filter((lesson) => completed.has(lesson.id)).length;
  const accessible =
    isPremium(user) ||
    (module.classId === user?.enrolledClassId && module.free);
  return (
    <article className="card module-card">
      <div className="module-summary">
        <span className="module-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div>
          <div className="module-title">
            <h3>{module.title}</h3>
            <span
              className={`badge ${count === lessons.length && lessons.length ? "complete" : ""}`}
            >
              {count === lessons.length && lessons.length
                ? "Completed"
                : count
                  ? "In progress"
                  : accessible
                    ? "Available"
                    : "Premium"}
            </span>
          </div>
          <p className="muted">{module.description}</p>
          <div className="module-meta">
            <span>
              <BookOpen size={14} />
              {lessons.length} lessons
            </span>
            <span>{count} completed</span>
          </div>
        </div>
      </div>
      {lessons.length ? (
        <div className="lesson-list">
          {lessons.map((lesson, i) => {
            const unlocked =
              isPremium(user) ||
              (module.classId === user?.enrolledClassId &&
                lesson.free &&
                module.free);
            return (
              <Link
                className={`lesson-row ${!unlocked ? "lesson-locked" : ""}`}
                href={unlocked ? `/app/lesson/${lesson.id}` : "/app/billing"}
                key={lesson.id}
              >
                <span
                  className={`lesson-status ${completed.has(lesson.id) ? "done" : ""}`}
                >
                  {completed.has(lesson.id) ? (
                    <Check size={14} />
                  ) : !unlocked ? (
                    <Lock size={13} />
                  ) : (
                    <Play size={13} />
                  )}
                </span>
                <span>
                  <small>LESSON {String(i + 1).padStart(2, "0")}</small>
                  {lesson.title}
                </span>
                <span className="lesson-duration">
                  {lesson.duration || "Self-paced"}
                </span>
                <ChevronRight size={16} />
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="muted module-empty">
          Lessons will appear when your instructor publishes them.
        </p>
      )}
    </article>
  );
}
function TrackLibrary() {
  const { user } = useAcademy();
  const [selected, setSelected] = useState<CareerPathClassId | null>(null);
  const trackId = selected || user?.enrolledClassId || "system-dev";
  const modules = useRecords<CourseModule>("modules", [
    ["published", "==", true],
  ]);
  const progress = useRecords<Progress>(
    "progress",
    [["studentId", "==", user?.id || ""]],
    !!user,
  );
  const track = TRACKS.find((item) => item.id === trackId)!;
  const visible = modules.data
    .filter((item) => item.classId === trackId)
    .sort((a, b) => a.order - b.order);
  const completed = new Set(progress.data.map((item) => item.lessonId));
  return (
    <div>
      <Header
        eyebrow="BUILD YOUR FUTURE, ONE LESSON AT A TIME"
        title="Explore the academy"
        description="Three career paths. Practical skills. A place to put them to work."
      />
      <div className="track-tabs" role="tablist" aria-label="Career tracks">
        {TRACKS.map((item) => (
          <button
            role="tab"
            aria-selected={item.id === trackId}
            className={item.id === trackId ? "active" : ""}
            key={item.id}
            onClick={() => setSelected(item.id)}
          >
            {item.name}
            {user?.enrolledClassId === item.id && <span>PRIMARY</span>}
          </button>
        ))}
      </div>
      <section className="track-intro">
        <div>
          <p className="eyebrow">{track.eyebrow}</p>
          <h2>{track.name}</h2>
          <p className="muted">{track.description}</p>
        </div>
        <div className="track-skills">
          {track.skills.map((skill) => (
            <span key={skill}>
              <Check size={14} />
              {skill}
            </span>
          ))}
        </div>
      </section>
      <p className="track-enrollment muted">
        <Lock size={13} /> Your primary track is{" "}
        {TRACKS.find((item) => item.id === user?.enrolledClassId)?.name}.
        Exploring another track does not change your enrollment.
      </p>
      {modules.error && <p className="alert">{modules.error}</p>}
      {modules.loading ? (
        <div className="card">Loading curriculum…</div>
      ) : visible.length ? (
        <div className="module-stack">
          {visible.map((module, index) => (
            <ModuleCard
              key={module.id}
              module={module}
              index={index}
              completed={completed}
            />
          ))}
        </div>
      ) : (
        <Empty
          title="Something worth learning is coming"
          body="This track is ready for its curriculum. Published modules and lessons will appear here as your instructor adds them."
        />
      )}
    </div>
  );
}

type ClassPostDraft = {
  classId: CareerPathClassId;
  moduleId: string;
  assignmentId: string;
  title: string;
  content: string;
  videoUrl: string;
  duration: string;
  free: boolean;
  resources: string;
};

function Classroom() {
  const { user } = useAcademy();
  const lessonIndex = useRecords<Lesson>("lessons", [
    ["published", "==", true],
  ]);
  const [classLessons, setClassLessons] = useState<Lesson[]>([]);
  const [classLessonsLoading, setClassLessonsLoading] = useState(true);
  const [classLessonsError, setClassLessonsError] = useState("");
  const modules = useRecords<CourseModule>("modules");
  const assignments = useRecords<Assignment>("assignments", [
    ["published", "==", true],
  ]);
  const progress = useRecords<Progress>(
    "progress",
    [["studentId", "==", user?.id || ""]],
    !!user,
  );
  const [composer, setComposer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const refreshFeed = useCallback(async () => {
    if (!user) return;
    try {
      const items = await api<Lesson[]>("classroom.list");
      setClassLessons(items);
    } catch (cause) {
      setClassLessonsError(errorMessage(cause));
    }
  }, [user]);

  useEffect(() => {
    if (!user || lessonIndex.loading) return;
    let cancelled = false;
    setClassLessonsLoading(true);
    setClassLessonsError("");
    void api<Lesson[]>("classroom.list")
      .then((items) => {
        if (!cancelled) setClassLessons(items);
      })
      .catch((cause) => {
        if (!cancelled) setClassLessonsError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setClassLessonsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonIndex.data, lessonIndex.loading, user]);
  const staffScopes =
    user?.role === "Admin"
      ? TRACKS.map((track) => track.id)
      : user?.role === "Instructor"
        ? user.instructorTrackIds || []
        : [];
  const defaultTrack = staffScopes[0] || user?.enrolledClassId || "system-dev";
  const [draft, setDraft] = useState<ClassPostDraft>({
    classId: defaultTrack,
    moduleId: "",
    assignmentId: "",
    title: "",
    content: "",
    videoUrl: "",
    duration: "Self-paced",
    free: false,
    resources: "",
  });
  if (!user) return null;
  const staff = user.role !== "Student";
  const scopes = staffScopes;
  const visible = classLessons
    .filter((lesson) =>
      staff
        ? scopes.includes(lesson.classId)
        : isPremium(user) ||
          (lesson.classId === user.enrolledClassId && lesson.free),
    )
    .sort((a, b) =>
      String(b.createdAt || b.updatedAt || "").localeCompare(
        String(a.createdAt || a.updatedAt || ""),
      ),
    );
  const completed = new Set(progress.data.map((item) => item.lessonId));
  const matchingModules = modules.data.filter(
    (module) => module.classId === draft.classId,
  );
  const matchingAssignments = assignments.data.filter(
    (assignment) => assignment.classId === draft.classId,
  );
  const postClass = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const resources = draft.resources
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((value) => {
          const parsed = new URL(value);
          if (parsed.protocol !== "https:")
            throw new Error("Resource links must use HTTPS.");
          return {
            title: parsed.hostname.replace(/^www\./, ""),
            url: parsed.href,
          };
        });
      await api("class.post", {
        post: {
          ...draft,
          moduleId: draft.moduleId || undefined,
          assignmentId: draft.assignmentId || undefined,
          resources,
        },
      });
      setDraft({
        ...draft,
        moduleId: "",
        assignmentId: "",
        title: "",
        content: "",
        videoUrl: "",
        duration: "Self-paced",
        resources: "",
      });
      setComposer(false);
      setMessage("Class posted. Students can now see it in their classroom.");
      await refreshFeed();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="classroom-page">
      <Header
        eyebrow="YOUR CLASSROOM"
        title="Classes, recordings, and updates."
        description="Watch recent classes, continue learning, and keep every resource in one place."
      >
        {staff && scopes.length > 0 && (
          <button
            className="btn btn-primary"
            onClick={() => setComposer((value) => !value)}
          >
            <Plus size={17} /> {composer ? "Close composer" : "Post a class"}
          </button>
        )}
      </Header>
      {(error || message) && (
        <p className={error ? "alert alert-error" : "alert"} role="status">
          {error || message}
        </p>
      )}
      {composer && (
        <section className="card class-composer">
          <div>
            <p className="eyebrow">NEW CLASS POST</p>
            <h2>Share a recorded class</h2>
            <p className="muted">
              Paste a YouTube, Bunny Stream, or direct HTTPS video link. The
              meeting link for live classes stays in Live sessions.
            </p>
          </div>
          <form className="workspace-form" onSubmit={postClass}>
            <div className="grid-2">
              <label>
                Student track
                <select
                  value={draft.classId}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      classId: event.target.value as CareerPathClassId,
                      moduleId: "",
                      assignmentId: "",
                    })
                  }
                >
                  {TRACKS.filter((track) => scopes.includes(track.id)).map(
                    (track) => (
                      <option key={track.id} value={track.id}>
                        {track.name}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Module
                <select
                  value={draft.moduleId}
                  onChange={(event) =>
                    setDraft({ ...draft, moduleId: event.target.value })
                  }
                >
                  <option value="">
                    {matchingModules.length
                      ? "Classroom posts (automatic)"
                      : "Create Classroom posts automatically"}
                  </option>
                  {matchingModules.map((module) => (
                    <option key={module.id} value={module.id}>
                      {module.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Class title
              <input
                required
                maxLength={200}
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
                placeholder="Example: Introduction to website design"
              />
            </label>
            <label>
              Video link or embed code (YouTube, Vimeo, Loom, Drive, Bunny, direct MP4, or &lt;iframe&gt;)
              <input
                required
                type="text"
                value={draft.videoUrl}
                onChange={(event) =>
                  setDraft({ ...draft, videoUrl: event.target.value })
                }
                placeholder="https://youtube.com/..., Vimeo, Loom, or paste <iframe> embed code"
              />
            </label>
            <div className="grid-2">
              <label>
                Duration
                <input
                  maxLength={40}
                  value={draft.duration}
                  onChange={(event) =>
                    setDraft({ ...draft, duration: event.target.value })
                  }
                  placeholder="45 minutes"
                />
              </label>
              <label>
                Related assignment (optional)
                <select
                  value={draft.assignmentId}
                  onChange={(event) =>
                    setDraft({ ...draft, assignmentId: event.target.value })
                  }
                >
                  <option value="">No assignment</option>
                  {matchingAssignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Class notes
              <textarea
                required
                rows={7}
                value={draft.content}
                onChange={(event) =>
                  setDraft({ ...draft, content: event.target.value })
                }
                placeholder="Summarize the class, key ideas, and what students should do next. Markdown is supported."
              />
            </label>
            <label>
              Resource links (optional, one HTTPS link per line)
              <textarea
                rows={4}
                value={draft.resources}
                onChange={(event) =>
                  setDraft({ ...draft, resources: event.target.value })
                }
                placeholder={
                  "https://example.com/worksheet.pdf\nhttps://example.com/slides"
                }
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={draft.free}
                onChange={(event) =>
                  setDraft({ ...draft, free: event.target.checked })
                }
              />
              Make this class available to Free students in this track
            </label>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Posting class…" : "Post class now"}
            </button>
          </form>
        </section>
      )}
      {(lessonIndex.error || classLessonsError || progress.error) && (
        <p className="alert alert-error">
          {lessonIndex.error || classLessonsError || progress.error}
        </p>
      )}
      <section className="class-feed">
        {visible.map((lesson) => (
          <ClassPostCard
            key={lesson.id}
            lesson={lesson}
            completed={completed.has(lesson.id)}
            canComplete={!staff}
            matchingAssignments={assignments.data.filter(
              (a) => a.classId === lesson.classId,
            )}
            onUpdated={refreshFeed}
          />
        ))}
      </section>
      {!lessonIndex.loading && !classLessonsLoading && !visible.length && (
        <Empty
          title="Your classroom is ready"
          body={
            staff
              ? "Post your first recorded class. Students will see it here immediately."
              : "Your instructor’s recorded classes and learning updates will appear here."
          }
        />
      )}
    </div>
  );
}

function ClassPostCard({
  lesson,
  completed,
  canComplete,
  matchingAssignments = [],
  onUpdated,
}: {
  lesson: Lesson;
  completed: boolean;
  canComplete: boolean;
  matchingAssignments?: Assignment[];
  onUpdated?: () => Promise<void> | void;
}) {
  const { user } = useAcademy();
  const canManage =
    user?.role === "Admin" ||
    (user?.role === "Instructor" &&
      (user.instructorTrackIds || []).includes(lesson.classId));

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(completed);
  const [error, setError] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [editDraft, setEditDraft] = useState({
    title: lesson.title,
    videoUrl: lesson.videoUrl || "",
    duration: lesson.duration || "Self-paced",
    content: lesson.content || "",
    moduleId: lesson.moduleId || "",
    assignmentId: lesson.assignmentId || "",
    free: !!lesson.free,
    resources: lesson.resources?.map((r) => r.url).join("\n") || "",
  });

  useEffect(() => {
    setEditDraft({
      title: lesson.title,
      videoUrl: lesson.videoUrl || "",
      duration: lesson.duration || "Self-paced",
      content: lesson.content || "",
      moduleId: lesson.moduleId || "",
      assignmentId: lesson.assignmentId || "",
      free: !!lesson.free,
      resources: lesson.resources?.map((r) => r.url).join("\n") || "",
    });
  }, [lesson]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEdit(true);
    setEditError("");
    try {
      const resources = editDraft.resources
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((value) => {
          const parsed = new URL(value);
          if (parsed.protocol !== "https:")
            throw new Error("Resource links must use HTTPS.");
          return {
            title: parsed.hostname.replace(/^www\./, ""),
            url: parsed.href,
          };
        });

      await api("class.update", {
        id: lesson.id,
        post: {
          classId: lesson.classId,
          moduleId: editDraft.moduleId || undefined,
          assignmentId: editDraft.assignmentId || undefined,
          title: editDraft.title,
          content: editDraft.content,
          videoUrl: editDraft.videoUrl,
          duration: editDraft.duration || "Self-paced",
          free: editDraft.free,
          resources,
        },
      });
      setIsEditing(false);
      await onUpdated?.();
    } catch (cause) {
      setEditError(errorMessage(cause));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this class post? This action cannot be undone.",
      )
    )
      return;
    setDeleting(true);
    setError("");
    try {
      await api("lesson.delete", { id: lesson.id });
      await onUpdated?.();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDeleting(false);
    }
  };

  const assignmentUrl = lesson.assignmentId
    ? `/app/assignments/${lesson.assignmentId}`
    : "";

  return (
    <article className="card class-post">
      <div className="class-post-meta">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span className="badge">
            {TRACKS.find((track) => track.id === lesson.classId)?.name}
          </span>
          {lesson.free && (
            <span className="badge badge-success">Free class</span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span className="muted">
            {lesson.createdAt
              ? new Date(lesson.createdAt).toLocaleDateString("en-NG", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "Recorded class"}
          </span>
          {canManage && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditError("");
                  setIsEditing((v) => !v);
                }}
                title="Edit this class"
                style={{
                  padding: "4px 10px",
                  fontSize: 13,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Pencil size={13} /> {isEditing ? "Cancel" : "Edit"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDelete}
                disabled={deleting}
                title="Delete this class"
                style={{
                  padding: "4px 8px",
                  fontSize: 13,
                  color: "#d93025",
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {isEditing ? (
        <form
          className="workspace-form class-edit-form"
          onSubmit={handleSaveEdit}
          style={{ marginTop: 18 }}
        >
          <div className="grid-2">
            <label>
              Class title
              <input
                required
                maxLength={200}
                value={editDraft.title}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, title: event.target.value })
                }
              />
            </label>
            <label>
              Duration
              <input
                maxLength={40}
                value={editDraft.duration}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, duration: event.target.value })
                }
                placeholder="45 minutes"
              />
            </label>
          </div>

          <label>
            Video link or embed code (YouTube, Vimeo, Loom, Drive, Bunny, direct MP4, or &lt;iframe&gt;)
            <input
              required
              type="text"
              value={editDraft.videoUrl}
              onChange={(event) =>
                setEditDraft({ ...editDraft, videoUrl: event.target.value })
              }
              placeholder="https://youtube.com/..., Vimeo, Loom, or paste <iframe> embed code"
            />
          </label>

          {matchingAssignments.length > 0 && (
            <label>
              Related assignment (optional)
              <select
                value={editDraft.assignmentId}
                onChange={(event) =>
                  setEditDraft({
                    ...editDraft,
                    assignmentId: event.target.value,
                  })
                }
              >
                <option value="">No assignment</option>
                {matchingAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Class notes (Markdown supported)
            <textarea
              required
              rows={6}
              value={editDraft.content}
              onChange={(event) =>
                setEditDraft({ ...editDraft, content: event.target.value })
              }
              placeholder="Summarize the class, key ideas, and what students should do next."
            />
          </label>

          <label>
            Resource links (optional, one HTTPS link per line)
            <textarea
              rows={3}
              value={editDraft.resources}
              onChange={(event) =>
                setEditDraft({ ...editDraft, resources: event.target.value })
              }
              placeholder={
                "https://example.com/worksheet.pdf\nhttps://example.com/slides"
              }
            />
          </label>

          <label className="check-label">
            <input
              type="checkbox"
              checked={editDraft.free}
              onChange={(event) =>
                setEditDraft({ ...editDraft, free: event.target.checked })
              }
            />
            Make this class available to Free students in this track
          </label>

          {editError && <p className="alert alert-error">{editError}</p>}

          <div className="button-row" style={{ marginTop: 14 }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={savingEdit}
            >
              {savingEdit ? "Saving changes…" : "Save changes"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsEditing(false)}
              disabled={savingEdit}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <h2>{lesson.title}</h2>
          <p className="muted">{lesson.duration || "Self-paced"}</p>
          <div className="class-post-video">
            <LessonVideo url={lesson.videoUrl} title={lesson.title} />
          </div>
          <div className="class-post-notes prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {lesson.content}
            </ReactMarkdown>
          </div>
          {!!lesson.resources?.length && (
            <div className="class-resources">
              {lesson.resources.map((resource, index) => (
                <a
                  key={`${resource.url}-${index}`}
                  href={safeUrl(resource.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText size={15} /> {resource.title}
                </a>
              ))}
            </div>
          )}
          {error && <p className="alert alert-error">{error}</p>}
          <div className="button-row">
            <Link className="btn btn-primary" href={`/app/lesson/${lesson.id}`}>
              Open class & discussion <ArrowRight size={16} />
            </Link>
            {assignmentUrl && (
              <Link className="btn btn-secondary" href={assignmentUrl}>
                View assignment
              </Link>
            )}
            {canComplete && (
              <button
                className="btn btn-secondary"
                disabled={done || saving}
                onClick={async () => {
                  setSaving(true);
                  setError("");
                  try {
                    await api("progress.complete", { lessonId: lesson.id });
                    setDone(true);
                  } catch (cause) {
                    setError(errorMessage(cause));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <CheckCircle2 size={16} />
                {done ? "Completed" : saving ? "Saving…" : "Mark complete"}
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}

function LessonVideo({ url, title }: { url: string; title: string }) {
  if (!url) {
    return (
      <div className="video-empty">
        <Play size={40} />
        <p>
          This lesson has no video yet. Read the notes below to get started.
        </p>
      </div>
    );
  }

  const { embedUrl, isDirectVideo } = getVideoEmbed(url);

  if (isDirectVideo) {
    return (
      <video
        className="lesson-video"
        controls
        preload="metadata"
        src={safeUrl(embedUrl || url)}
      >
        Your browser cannot play this video.{" "}
        <a href={safeUrl(embedUrl || url)}>Open the video</a>.
      </video>
    );
  }

  if (embedUrl) {
    return (
      <iframe
        className="lesson-video"
        src={embedUrl}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }

  return (
    <div className="video-empty">
      <Play size={40} />
      <p>Unable to embed this video player directly.</p>
      <a
        className="btn btn-secondary"
        href={safeUrl(url)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open video link in new tab <ExternalLink size={14} />
      </a>
    </div>
  );
}

function LessonPlayer({ id }: { id?: string }) {
  const { user } = useAcademy();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [saving, setSaving] = useState(false);
  const [offline, setOffline] = useState(false);
  const [queued, setQueued] = useState(false);
  const progress = useRecords<Progress>(
    "progress",
    [["studentId", "==", user?.id || ""]],
    !!user,
  );
  const modules = useRecords<CourseModule>("modules", [
    ["published", "==", true],
  ]);
  useEffect(() => {
    if (!id || !user) {
      setLoading(false);
      return;
    }
    let active = true;
    const key = `ea:lesson:${user.id}:${id}`;
    const load = async () => {
      try {
        if (!navigator.onLine) {
          const cached = localStorage.getItem(key);
          if (cached) {
            const saved = JSON.parse(cached) as Lesson;
            if (!saved.free && !isPremium(user))
              throw new Error(
                "Reconnect and renew Premium to access this saved lesson.",
              );
            if (active) {
              setLesson(saved);
              setOffline(true);
            }
            return;
          }
          throw new Error(
            "Open this lesson while connected first to make its notes and exercises available offline.",
          );
        }
        const result = await api<Lesson>("lesson.get", { id });
        if (active) {
          setLesson(result);
          try {
            localStorage.setItem(key, JSON.stringify(result));
          } catch {}
        }
      } catch (err) {
        if (active) setError(errorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    setQueued(readQueue(user.id).some((item) => item.id === `progress:${id}`));
    return () => {
      active = false;
    };
  }, [id, user]);
  useEffect(() => {
    const update = () => {
      if (user && id)
        setQueued(
          readQueue(user.id).some((item) => item.id === `progress:${id}`),
        );
    };
    window.addEventListener("ea:queue-synced", update);
    return () => window.removeEventListener("ea:queue-synced", update);
  }, [user, id]);
  const completed = progress.data.some((item) => item.lessonId === id);
  const ordered = useMemo(
    () =>
      modules.data
        .filter((module) => module.classId === lesson?.classId)
        .sort((a, b) => a.order - b.order)
        .flatMap((module) =>
          [...(module.lessons || [])].sort((a, b) => a.order - b.order),
        ),
    [modules.data, lesson],
  );
  const next = ordered[ordered.findIndex((item) => item.id === id) + 1];
  const mark = async () => {
    if (!id || !user) return;
    setSaving(true);
    setError("");
    try {
      if (!navigator.onLine) {
        queueAction(
          user.id,
          "progress.complete",
          { lessonId: id },
          `progress:${id}`,
        );
        setQueued(true);
      } else await api("progress.complete", { lessonId: id });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <div className="card">Loading your lesson…</div>;
  if (!lesson)
    return (
      <div>
        <Link href="/app/tracks" className="back-link">
          ← Back to curriculum
        </Link>
        <Empty
          title="This lesson is unavailable"
          body={
            error || "Choose a published lesson from your curriculum to begin."
          }
        />
        <Link className="btn btn-primary" href="/app/tracks">
          Browse lessons
        </Link>
      </div>
    );
  return (
    <div>
      <Link href="/app/tracks" className="back-link">
        ← Back to curriculum
      </Link>
      <Header
        eyebrow={
          TRACKS.find((item) => item.id === lesson.classId)?.name ||
          "YOUR CLASSROOM"
        }
        title={lesson.title}
        description={`${lesson.duration || "Self-paced"} · Learn, practice, make progress.`}
      >
        <span className="badge">
          {completed
            ? "Completed"
            : queued
              ? "Completion saved offline"
              : "In progress"}
        </span>
      </Header>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {offline && (
        <p className="alert">
          You’re reading a lesson saved on this device. Notes and exercises work
          offline; streamed video and AI need a connection.
        </p>
      )}
      <div className="video-container">
        <LessonVideo url={lesson.videoUrl} title={lesson.title} />
      </div>
      <div className="lesson-workspace card">
        <div
          className="tabs lesson-tabs"
          role="tablist"
          aria-label="Lesson content"
        >
          {[
            { id: "overview", label: "Overview", icon: BookOpen },
            { id: "resources", label: "Resources", icon: Download },
            { id: "discussion", label: "Discussion", icon: MessageCircle },
            { id: "tutor", label: "AI tutor", icon: MessageCircle },
          ].map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={tab === item.id ? "active" : ""}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </div>
        <div className="lesson-tab-content" role="tabpanel">
          {tab === "overview" && (
            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {lesson.content ||
                  "Your instructor has not added lesson notes yet."}
              </ReactMarkdown>
            </div>
          )}
          {tab === "resources" && (
            <div>
              {lesson.resources?.length ? (
                lesson.resources.map((resource, index) => (
                  <a
                    className="resource-row"
                    key={index}
                    href={safeUrl(resource.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FileText size={22} />
                    <span>{resource.title}</span>
                    <ArrowRight size={18} />
                  </a>
                ))
              ) : (
                <Empty
                  title="Resources will live here"
                  body="Your instructor can attach reading lists, toolkits, and supporting files to this lesson."
                />
              )}
              {lesson.videoUrl && (
                <a
                  className="btn btn-secondary"
                  href={safeUrl(lesson.videoUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open video source <ArrowRight size={15} />
                </a>
              )}
              <p className="muted">
                For direct video files, use the video player’s download control
                when available. Hosted video downloads depend on the provider.
              </p>
            </div>
          )}
          {tab === "discussion" && <LessonDiscussion lesson={lesson} />}
          {tab === "tutor" && <Tutor lessonId={lesson.id} />}
        </div>
      </div>
      <div className="lesson-footer">
        <p className="muted">Ready for your next step?</p>
        <div className="button-row">
          <button
            className="btn btn-secondary"
            disabled={completed || queued || saving}
            onClick={mark}
          >
            <CheckCircle2 size={17} />
            {completed
              ? "Lesson completed"
              : queued
                ? "Saved for sync"
                : saving
                  ? "Saving…"
                  : "Mark as complete"}
          </button>
          {next && next.id !== id && (
            <Link className="btn btn-primary" href={`/app/lesson/${next.id}`}>
              Next lesson <ArrowRight size={17} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
function LessonDiscussion({ lesson }: { lesson: Lesson }) {
  const discussions = useRecords<Discussion>("discussions", [
    ["lessonId", "==", lesson.id],
  ]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      await api("discussion.create", {
        title: `Question about ${lesson.title}`,
        body,
        classId: lesson.classId,
        lessonId: lesson.id,
      });
      setBody("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h3>Learn out loud</h3>
      <p className="muted">
        Ask a question, share an insight, or continue the conversation in the
        cohort lounge.
      </p>
      {(error || discussions.error) && (
        <p className="alert">{error || discussions.error}</p>
      )}
      <label className="field">
        Your question
        <textarea
          rows={4}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What would you like to understand better?"
        />
      </label>
      <button
        className="btn btn-primary"
        disabled={!body.trim() || busy}
        onClick={send}
      >
        <Send size={15} />
        {busy ? "Posting…" : "Post question"}
      </button>
      <div className="lesson-discussions">
        {discussions.data.map((item) => (
          <article className="discussion-entry" key={item.id}>
            <div>
              <strong>{item.authorName}</strong>
              <small>{new Date(item.createdAt).toLocaleDateString()}</small>
            </div>
            <div className="prose">
              <ReactMarkdown>{item.body}</ReactMarkdown>
            </div>
            <Link href={`/app/community/${item.id}`}>
              View conversation <ArrowRight size={14} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
function Tutor({ lessonId }: { lessonId: string }) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<{ role: string; text: string }[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    const question = prompt.trim();
    if (!question) return;
    setBusy(true);
    setError("");
    setMessages((previous) => [...previous, { role: "You", text: question }]);
    setPrompt("");
    try {
      const response = await api<{ text: string }>("ai.ask", {
        mode: "tutor",
        lessonId,
        prompt: question,
      });
      setMessages((previous) => [
        ...previous,
        { role: "AI tutor", text: response.text },
      ]);
    } catch (err) {
      setError(errorMessage(err));
      setPrompt(question);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="tutor">
      <div className="tutor-intro">
        <MessageCircle size={25} />
        <div>
          <h3>A little help, right when you need it.</h3>
          <p className="muted">
            Ask for an explanation, an example, or a hint. AI guidance may be
            imperfect; your instructor makes final grading decisions.
          </p>
        </div>
      </div>
      <div className="tutor-messages" aria-live="polite">
        {messages.map((item, index) => (
          <div
            className={`tutor-message ${item.role === "You" ? "from-user" : ""}`}
            key={index}
          >
            <p className="eyebrow">{item.role}</p>
            <div className="prose">
              <ReactMarkdown>{item.text}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="field">
          Ask your tutor
          <textarea
            rows={3}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Can you explain this lesson with a practical example?"
          />
        </label>
        <button className="btn btn-primary" disabled={busy || !prompt.trim()}>
          <Send size={16} />
          {busy ? "Thinking…" : "Ask AI tutor"}
        </button>
      </form>
    </section>
  );
}

function LearningRecord() {
  const { user } = useAcademy();
  const modules = useRecords<CourseModule>("modules", [
    ["published", "==", true],
  ]);
  const progress = useRecords<Progress>(
    "progress",
    [["studentId", "==", user?.id || ""]],
    !!user,
  );
  const submissions = useRecords<AssignmentSubmission>(
    "submissions",
    [["studentId", "==", user?.id || ""]],
    !!user,
  );
  const assignments = useRecords<Assignment>("assignments", [
    ["published", "==", true],
  ]);
  const userTranscripts = useRecords<{ id: string; studentId: string }>(
    "transcripts",
    [["studentId", "==", user?.id || ""]],
    !!user,
  );
  const [issued, setIssued] = useState<{ id: string; url: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const activeRecordId = issued?.id || userTranscripts.data[0]?.id || null;
  const activeRecordUrl = activeRecordId ? `/verify/${activeRecordId}` : null;
  const certTitle = getCertificateTitle(user.enrolledClassId);
  const fullCertUrl =
    typeof window !== "undefined" && activeRecordUrl
      ? new URL(activeRecordUrl, window.location.origin).href
      : `https://student.cleanbrandagency.com${activeRecordUrl || ""}`;
  const linkedInCertUrl = activeRecordId
    ? getLinkedInCertUrl({
        certName: certTitle,
        certId: activeRecordId,
        certUrl: fullCertUrl,
        issuedAt: new Date().toISOString(),
      })
    : "#";
  const linkedInShareUrl = getLinkedInShareUrl(fullCertUrl);

  const copyCertLink = async () => {
    try {
      await navigator.clipboard.writeText(fullCertUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };
  const completed = new Set(progress.data.map((item) => item.lessonId));
  const finished = modules.data.filter(
    (module) =>
      module.lessons?.length &&
      module.lessons.every((lesson) => completed.has(lesson.id)),
  );
  const graded = submissions.data.filter((item) => item.status === "graded");
  const issue = async () => {
    setBusy(true);
    setError("");
    try {
      setIssued(await api<{ id: string; url: string }>("transcript.issue"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="learning-record-page">
      <Header
        eyebrow="YOUR PROGRESS, RECOGNISED"
        title="Learning record"
        description="Your completed modules and instructor ratings in one place."
      >
        <button className="btn btn-secondary" onClick={() => window.print()}>
          <Download size={16} /> Print / save PDF
        </button>
      </Header>
      {(error || progress.error || submissions.error) && (
        <p className="alert">{error || progress.error || submissions.error}</p>
      )}
      <article className="learning-record card">
        <div className="record-brand">
          <span className="record-mark">EA</span>
          <div>
            <strong>EA ACADEMY</strong>
            <p>CAREER ACCELERATOR</p>
          </div>
          <GraduationCap size={34} />
        </div>
        <p className="eyebrow">PERSONAL LEARNING RECORD</p>
        <h2>{user.name}</h2>
        <div className="record-details">
          <div>
            <small>PRIMARY TRACK</small>
            <strong>
              {TRACKS.find((track) => track.id === user.enrolledClassId)?.name}
            </strong>
          </div>
          <div>
            <small>ENROLLED</small>
            <strong>
              {user.enrolledAt
                ? new Date(user.enrolledAt).toLocaleDateString()
                : "—"}
            </strong>
          </div>
          <div>
            <small>ISSUED</small>
            <strong>{new Date().toLocaleDateString()}</strong>
          </div>
        </div>
        <h3>Completed modules</h3>
        {finished.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Track</th>
                  <th>Lessons</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {finished.map((module) => (
                  <tr key={module.id}>
                    <td>{module.title}</td>
                    <td>
                      {
                        TRACKS.find((track) => track.id === module.classId)
                          ?.short
                      }
                    </td>
                    <td>{module.lessons?.length}</td>
                    <td>Completed</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            Complete all lessons in a module to add it to your learning record.
          </p>
        )}
        <h3>Assignment ratings</h3>
        {graded.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Assignment</th>
                  <th>Rating</th>
                  <th>Instructor feedback</th>
                </tr>
              </thead>
              <tbody>
                {graded.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {assignments.data.find(
                        (assignment) => assignment.id === item.assignmentId,
                      )?.title || "Assignment"}
                    </td>
                    <td>
                      <strong>{item.grade} / 100</strong>
                    </td>
                    <td>{item.feedback || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            Instructor ratings will appear here after your assignments are
            reviewed.
          </p>
        )}
        <div className="record-footer">
          <p>
            EA Academy records practical learning progress and instructor
            ratings. This learning record does not use academic credits or GPA.
          </p>
        </div>

        {activeRecordId && (
          <div className="record-credential-box">
            <div className="credential-box-header">
              <div className="credential-seal-mini">
                <Award size={22} />
              </div>
              <div>
                <span className="eyebrow">
                  VERIFIED PROFESSIONAL CREDENTIAL
                </span>
                <h4>{certTitle}</h4>
                <p>
                  Your verifiable certificate is published with cryptographic
                  proof. Add it to your LinkedIn profile certifications, share
                  it with your network, or send the public link to prospective
                  employers.
                </p>
              </div>
            </div>

            <div className="credential-actions-row">
              <a
                href={linkedInCertUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-linkedin"
                id="workspace-add-linkedin-btn"
                title="Add certificate to your LinkedIn Profile credentials"
              >
                <Linkedin size={16} /> Add to LinkedIn
              </a>
              <a
                href={linkedInShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                id="workspace-share-linkedin-btn"
                title="Share certificate to LinkedIn feed"
              >
                <Share2 size={15} /> Share on LinkedIn
              </a>
              <a
                href={activeRecordUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                id="workspace-view-cert-btn"
                title="Open public certificate verification page"
              >
                <ExternalLink size={15} /> View Certificate
              </a>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={copyCertLink}
                title="Copy public verification URL"
              >
                {copied ? (
                  <Check size={15} className="text-emerald" />
                ) : (
                  <Copy size={15} />
                )}
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
            <p className="credential-meta-text">
              Cryptographic ID: <code>{activeRecordId}</code> • Public URL:{" "}
              <a
                href={activeRecordUrl!}
                target="_blank"
                rel="noopener noreferrer"
              >
                {fullCertUrl}
              </a>
            </p>
          </div>
        )}
      </article>

      <div className="record-actions">
        <p className="muted">
          Generate an official public verification link and professional
          certificate. Your name, completed modules, and evaluated assignments
          will be visible to employers and clients with the link.
        </p>
        <button
          className="btn btn-primary"
          disabled={busy || (!finished.length && !graded.length)}
          onClick={issue}
        >
          <CheckCircle2 size={17} />
          {busy
            ? "Issuing…"
            : activeRecordId
              ? "Refresh verified record"
              : "Create verified record"}
        </button>
      </div>
    </div>
  );
}
