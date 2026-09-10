"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  PlayCircle,
  Clock,
  Download,
  Award,
  ChevronDown,
  ChevronUp,
  FileText,
  Paperclip,
  Share2,
  Printer,
  X,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { useAcademy } from "@/components/academy-provider";
import { api } from "@/lib/api";
import { getVideoEmbed } from "@/lib/video";
import type {
  ShopItem,
  ShopCourseLesson,
  ShopCourseProgress,
  ShopCertificate,
} from "@/lib/types";

interface CourseResponse {
  course: ShopItem;
  progress: ShopCourseProgress | null;
}

export function CoursePlayer({ courseId }: { courseId: string }) {
  const { user } = useAcademy();
  const router = useRouter();

  const [data, setData] = useState<CourseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentLessonId, setCurrentLessonId] = useState<string>("");
  const [openModuleIds, setOpenModuleIds] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"notes" | "resources">("notes");
  const [updatingProgress, setUpdatingProgress] = useState(false);

  // Certificate Modal
  const [showCertificate, setShowCertificate] = useState(false);
  const [certificateData, setCertificateData] = useState<ShopCertificate | null>(null);
  const [loadingCert, setLoadingCert] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const res = await api<CourseResponse>("shop.course.get", { courseId });
        if (!mounted) return;
        setData(res);

        // Find initial lesson
        const allLessons: ShopCourseLesson[] = [];
        const modulesMap: Record<string, boolean> = {};
        (res.course.curriculum || []).forEach((m) => {
          modulesMap[m.id] = true;
          (m.lessons || []).forEach((l) => allLessons.push(l));
        });
        setOpenModuleIds(modulesMap);

        // Resume from lastLessonId or first incomplete lesson or first lesson
        const completed = res.progress?.completedLessonIds || [];
        let initialId = res.progress?.lastLessonId;
        if (!initialId || !allLessons.some((l) => l.id === initialId)) {
          const firstIncomplete = allLessons.find((l) => !completed.includes(l.id));
          initialId = firstIncomplete ? firstIncomplete.id : allLessons[0]?.id || "";
        }
        setCurrentLessonId(initialId);
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unable to load classroom.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  // Flattened lessons list for previous/next navigation
  const allLessons = useMemo(() => {
    if (!data?.course.curriculum) return [];
    const list: { lesson: ShopCourseLesson; moduleTitle: string }[] = [];
    data.course.curriculum.forEach((mod) => {
      (mod.lessons || []).forEach((les) => {
        list.push({ lesson: les, moduleTitle: mod.title });
      });
    });
    return list;
  }, [data]);

  const currentLessonIndex = useMemo(() => {
    return allLessons.findIndex((item) => item.lesson.id === currentLessonId);
  }, [allLessons, currentLessonId]);

  const currentLesson = useMemo(() => {
    return allLessons[currentLessonIndex]?.lesson || null;
  }, [allLessons, currentLessonIndex]);

  const completedLessonIds = useMemo(() => {
    return data?.progress?.completedLessonIds || [];
  }, [data]);

  const isCurrentCompleted = currentLesson
    ? completedLessonIds.includes(currentLesson.id)
    : false;

  const totalLessonsCount = allLessons.length;
  const completedCount = completedLessonIds.length;
  const progressPercent =
    totalLessonsCount > 0
      ? Math.min(100, Math.round((completedCount / totalLessonsCount) * 100))
      : 0;

  const toggleLessonComplete = async (lessonId: string, markComplete: boolean) => {
    try {
      setUpdatingProgress(true);
      const res = await api<{ progress: ShopCourseProgress; certificateId?: string }>(
        "shop.course.progress",
        {
          courseId,
          lessonId,
          completed: markComplete,
        },
      );
      setData((prev) => (prev ? { ...prev, progress: res.progress } : prev));
      if (res.certificateId) {
        // Automatically open certificate modal upon 100% completion!
        void handleViewCertificate(res.certificateId);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingProgress(false);
    }
  };

  const handleNextLesson = async () => {
    if (!isCurrentCompleted && currentLesson) {
      await toggleLessonComplete(currentLesson.id, true);
    }
    if (currentLessonIndex < allLessons.length - 1) {
      setCurrentLessonId(allLessons[currentLessonIndex + 1].lesson.id);
    }
  };

  const handlePrevLesson = () => {
    if (currentLessonIndex > 0) {
      setCurrentLessonId(allLessons[currentLessonIndex - 1].lesson.id);
    }
  };

  const handleViewCertificate = async (certId?: string) => {
    const targetId = certId || data?.progress?.certificateId;
    if (!targetId) return;
    try {
      setLoadingCert(true);
      setShowCertificate(true);
      const cert = await api<ShopCertificate>("shop.certificate.get", {
        id: targetId,
      });
      setCertificateData(cert);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCert(false);
    }
  };

  if (loading) {
    return (
      <div className="classroom-loading">
        <div className="classroom-spinner" />
        <p>Loading course classroom…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="classroom-error-box">
        <h3>Classroom Unavailable</h3>
        <p>{error || "Course could not be loaded."}</p>
        <Link href="/app/library" className="btn btn-primary">
          <ArrowLeft size={16} /> Back to Library
        </Link>
      </div>
    );
  }

  const { course } = data;
  const videoEmbed = currentLesson?.videoUrl ? getVideoEmbed(currentLesson.videoUrl) : null;

  return (
    <div className="classroom-layout">
      {/* Top Classroom Bar */}
      <header className="classroom-topbar">
        <div className="classroom-topbar-left">
          <Link href="/app/library" className="classroom-back-btn">
            <ArrowLeft size={18} />
            <span className="back-text">My Library</span>
          </Link>
          <div className="classroom-course-title">
            <h2>{course.title}</h2>
            <span className="classroom-track-badge">{course.category}</span>
          </div>
        </div>

        <div className="classroom-topbar-right">
          {/* Progress Pill */}
          <div className="classroom-progress-pill">
            <div className="progress-fill-bar">
              <div
                className="progress-fill-val"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span>
              {completedCount}/{totalLessonsCount} completed ({progressPercent}%)
            </span>
          </div>

          {/* Certificate button */}
          {(progressPercent === 100 || data.progress?.certificateId) &&
            course.certificateEnabled && (
              <button
                type="button"
                className="btn btn-primary btn-small classroom-cert-btn"
                onClick={() => handleViewCertificate()}
              >
                <Award size={15} />
                <span>Certificate</span>
              </button>
            )}
        </div>
      </header>

      {/* Classroom Body: Main Video Player & Lesson Sidebar */}
      <div className="classroom-main-container">
        {/* Left / Center: Video and Notes */}
        <main className="classroom-stage">
          {/* Responsive Video Container */}
          <div className="classroom-video-frame">
            {videoEmbed?.embedUrl ? (
              videoEmbed.isDirectVideo ? (
                <video
                  src={videoEmbed.embedUrl}
                  controls
                  className="classroom-player-element"
                  poster={course.thumbnailUrl}
                />
              ) : (
                <iframe
                  src={videoEmbed.embedUrl}
                  title={currentLesson?.title || "Lesson Video"}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="classroom-player-element"
                />
              )
            ) : (
              <div className="classroom-no-video">
                <PlayCircle size={48} />
                <p>No video attached to this lesson. Read the notes below.</p>
              </div>
            )}
          </div>

          {/* Lesson Action Bar */}
          <div className="classroom-action-bar">
            <div className="action-bar-left">
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={handlePrevLesson}
                disabled={currentLessonIndex <= 0}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={handleNextLesson}
                disabled={currentLessonIndex >= allLessons.length - 1}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="action-bar-right">
              <button
                type="button"
                className={`btn ${
                  isCurrentCompleted ? "btn-secondary completed-btn" : "btn-primary"
                }`}
                onClick={() =>
                  currentLesson &&
                  toggleLessonComplete(currentLesson.id, !isCurrentCompleted)
                }
                disabled={updatingProgress}
              >
                {isCurrentCompleted ? (
                  <>
                    <CheckCircle2 size={16} className="text-emerald" />
                    Completed
                  </>
                ) : (
                  <>
                    <Circle size={16} />
                    Mark as Complete
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Lesson Details & Content Tabs */}
          <div className="classroom-content-box">
            <div className="classroom-lesson-header">
              <span className="eyebrow">
                LESSON {currentLessonIndex + 1} OF {allLessons.length}
              </span>
              <h1>{currentLesson?.title || "Classroom Lesson"}</h1>
              {currentLesson?.duration && (
                <span className="classroom-duration">
                  <Clock size={13} /> {currentLesson.duration}
                </span>
              )}
            </div>

            <div className="classroom-tabs">
              <button
                type="button"
                className={`classroom-tab ${activeTab === "notes" ? "active" : ""}`}
                onClick={() => setActiveTab("notes")}
              >
                <FileText size={15} />
                Lesson Notes & Overview
              </button>
              <button
                type="button"
                className={`classroom-tab ${activeTab === "resources" ? "active" : ""}`}
                onClick={() => setActiveTab("resources")}
              >
                <Paperclip size={15} />
                Downloads & Resources ({currentLesson?.resources?.length || 0})
              </button>
            </div>

            <div className="classroom-tab-content">
              {activeTab === "notes" ? (
                <div className="classroom-notes-body whitespace-pre-line">
                  {currentLesson?.content || (
                    <p className="text-muted">
                      No additional written notes for this lesson. Follow the video
                      presentation above.
                    </p>
                  )}
                </div>
              ) : (
                <div className="classroom-resources-body">
                  {!currentLesson?.resources || currentLesson.resources.length === 0 ? (
                    <p className="text-muted">
                      No external download files attached to this lesson.
                    </p>
                  ) : (
                    <div className="classroom-resource-list">
                      {currentLesson.resources.map((res, rIdx) => (
                        <a
                          key={rIdx}
                          href={res.url}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="classroom-resource-card"
                        >
                          <div className="res-icon">
                            <Download size={18} />
                          </div>
                          <div className="res-info">
                            <strong>{res.title}</strong>
                            {res.size && <span>{res.size}</span>}
                          </div>
                          <ExternalLink size={15} className="res-arrow" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right: Curriculum Sidebar */}
        <aside className="classroom-sidebar">
          <div className="classroom-sidebar-header">
            <h3>Course Curriculum</h3>
            <span className="sidebar-total-badge">
              {totalLessonsCount} lessons
            </span>
          </div>

          <div className="classroom-modules-accordion">
            {(course.curriculum || []).map((mod, modIdx) => {
              const isOpen = !!openModuleIds[mod.id];
              const modLessons = mod.lessons || [];
              const modCompletedCount = modLessons.filter((l) =>
                completedLessonIds.includes(l.id),
              ).length;

              return (
                <div key={mod.id} className="classroom-mod-item">
                  <button
                    type="button"
                    className="classroom-mod-header"
                    onClick={() =>
                      setOpenModuleIds((prev) => ({
                        ...prev,
                        [mod.id]: !prev[mod.id],
                      }))
                    }
                    aria-expanded={isOpen}
                  >
                    <div className="mod-header-left">
                      <span className="mod-idx">Module {modIdx + 1}</span>
                      <h4>{mod.title}</h4>
                    </div>
                    <div className="mod-header-right">
                      <span className="mod-progress-text">
                        {modCompletedCount}/{modLessons.length}
                      </span>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="classroom-mod-lessons">
                      {modLessons.map((les) => {
                        const isCurrent = les.id === currentLessonId;
                        const isCompleted = completedLessonIds.includes(les.id);

                        return (
                          <div
                            key={les.id}
                            className={`classroom-sidebar-lesson ${
                              isCurrent ? "active" : ""
                            } ${isCompleted ? "completed" : ""}`}
                            onClick={() => setCurrentLessonId(les.id)}
                            role="button"
                            tabIndex={0}
                          >
                            <button
                              type="button"
                              className="lesson-check-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleLessonComplete(les.id, !isCompleted);
                              }}
                              aria-label={
                                isCompleted ? "Mark incomplete" : "Mark complete"
                              }
                            >
                              {isCompleted ? (
                                <CheckCircle2 size={16} className="checked-icon" />
                              ) : (
                                <Circle size={16} className="unchecked-icon" />
                              )}
                            </button>

                            <div className="sidebar-lesson-info">
                              <span className="sidebar-lesson-title">
                                {les.title}
                              </span>
                              <div className="sidebar-lesson-meta">
                                {les.duration && (
                                  <span className="sidebar-lesson-duration">
                                    <Clock size={11} /> {les.duration}
                                  </span>
                                )}
                                {(les.resources || []).length > 0 && (
                                  <span className="sidebar-lesson-has-res">
                                    <Paperclip size={11} />
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Certificate of Completion Modal */}
      {showCertificate && (
        <div
          className="certificate-modal-backdrop"
          onClick={() => setShowCertificate(false)}
          role="presentation"
        >
          <div
            className="certificate-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="certificate-modal-top">
              <div className="cert-badge">
                <Award size={16} />
                <span>OFFICIAL CREDENTIAL</span>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowCertificate(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {loadingCert ? (
              <div className="certificate-loading">Loading certificate…</div>
            ) : certificateData ? (
              <div className="certificate-sheet-wrap">
                {/* Printable Certificate Template */}
                <div className="certificate-sheet" id="ea-course-certificate">
                  <div className="cert-border-outer">
                    <div className="cert-border-inner">
                      <div className="cert-header">
                        <div className="cert-logo">EA ACADEMY</div>
                        <span className="cert-subtitle">
                          VERIFIED CERTIFICATE OF COMPLETION
                        </span>
                      </div>

                      <div className="cert-body">
                        <p className="cert-intro">This is to certify that</p>
                        <h2 className="cert-recipient-name">
                          {certificateData.studentName}
                        </h2>
                        <p className="cert-text">
                          has successfully mastered all curriculum requirements,
                          hands-on exercises, and final modules for
                        </p>
                        <h3 className="cert-course-title">
                          {certificateData.courseTitle}
                        </h3>
                      </div>

                      <div className="cert-footer">
                        <div className="cert-signature-col">
                          <div className="cert-sig-line" />
                          <strong>Emmanuel Amadin</strong>
                          <span>Founder & Lead Mentor, EA Academy</span>
                        </div>
                        <div className="cert-seal-col">
                          <div className="cert-gold-seal">
                            <Award size={36} />
                            <span>VERIFIED</span>
                          </div>
                        </div>
                        <div className="cert-meta-col">
                          <span>
                            Date:{" "}
                            {new Date(certificateData.issuedAt).toLocaleDateString()}
                          </span>
                          <span className="cert-code">
                            ID: {certificateData.verificationCode}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="certificate-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowCertificate(false)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => window.print()}
                  >
                    <Printer size={16} />
                    Print / Save as PDF
                  </button>
                </div>
              </div>
            ) : (
              <div className="certificate-loading">Certificate not found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
