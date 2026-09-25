"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
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
  Printer,
  X,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  Lock,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { api, downloadAttachment } from "@/lib/api";
import { AdVideoPlayer } from "@/components/ad-video-player";
import type {
  ShopItem,
  ShopCourseModule,
  ShopCourseLesson,
  ShopCourseProgress,
  ShopCertificate,
  ShopQuizAttempt,
  ShopChapterQuizResult,
} from "@/lib/types";

interface CourseResponse {
  course: ShopItem;
  progress: ShopCourseProgress | null;
}

export function CoursePlayer({ courseId }: { courseId: string }) {
  const [data, setData] = useState<CourseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentLessonId, setCurrentLessonId] = useState<string>("");
  const [activeQuizModuleId, setActiveQuizModuleId] = useState<string | null>(
    null,
  );
  const [openModuleIds, setOpenModuleIds] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"notes" | "resources">("notes");
  const [updatingProgress, setUpdatingProgress] = useState(false);

  // Chapter Quiz State
  const [quizAnswers, setQuizAnswers] = useState<
    Record<string, string | string[]>
  >({});
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [latestQuizAttempt, setLatestQuizAttempt] =
    useState<ShopQuizAttempt | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);

  // Certificate Modal
  const [showCertificate, setShowCertificate] = useState(false);
  const [certificateData, setCertificateData] = useState<ShopCertificate | null>(
    null,
  );
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
          const firstIncomplete = allLessons.find(
            (l) => !completed.includes(l.id),
          );
          initialId = firstIncomplete
            ? firstIncomplete.id
            : allLessons[0]?.id || "";
        }
        setCurrentLessonId(initialId);
      } catch (err: unknown) {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : "Unable to load classroom.",
          );
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
    const list: {
      lesson: ShopCourseLesson;
      moduleId: string;
      moduleTitle: string;
      isLastInModule: boolean;
      moduleHasQuiz: boolean;
    }[] = [];
    data.course.curriculum.forEach((mod) => {
      const lessons = mod.lessons || [];
      const hasQuiz = Boolean(
        mod.quiz?.enabled && (mod.quiz?.questions?.length || 0) > 0,
      );
      lessons.forEach((les, idx) => {
        list.push({
          lesson: les,
          moduleId: mod.id,
          moduleTitle: mod.title,
          isLastInModule: idx === lessons.length - 1,
          moduleHasQuiz: hasQuiz,
        });
      });
    });
    return list;
  }, [data]);

  const currentLessonIndex = useMemo(() => {
    return allLessons.findIndex((item) => item.lesson.id === currentLessonId);
  }, [allLessons, currentLessonId]);

  const currentLessonEntry = useMemo(() => {
    return allLessons[currentLessonIndex] || null;
  }, [allLessons, currentLessonIndex]);

  const currentLesson = currentLessonEntry?.lesson || null;

  const activeQuizModule: ShopCourseModule | null = useMemo(() => {
    if (!activeQuizModuleId || !data?.course.curriculum) return null;
    return (
      data.course.curriculum.find((m) => m.id === activeQuizModuleId) || null
    );
  }, [activeQuizModuleId, data]);

  const completedLessonIds = useMemo(() => {
    return data?.progress?.completedLessonIds || [];
  }, [data]);

  const quizResults = useMemo(() => {
    return data?.progress?.quizResults || {};
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

  // Overall Course Quiz Score & Certificate Eligibility calculation
  const quizEligibility = useMemo(() => {
    const curriculum = data?.course.curriculum || [];
    const requiredModules = curriculum.filter(
      (m) =>
        m.quiz?.enabled &&
        m.quiz?.required !== false &&
        (m.quiz?.questions?.length || 0) > 0,
    );

    let earnedScore = 0;
    let totalQuestions = 0;
    let completedQuizzes = 0;

    if (requiredModules.length > 0) {
      for (const mod of requiredModules) {
        const qCount = mod.quiz?.questions?.length || 0;
        totalQuestions += qCount;
        const r = quizResults[mod.id];
        if (r && r.attemptsCount > 0) {
          completedQuizzes += 1;
          earnedScore += Number(r.effectiveScore || 0);
        }
      }
    } else {
      for (const mod of curriculum) {
        const r = quizResults[mod.id];
        if (r && r.attemptsCount > 0) {
          earnedScore += Number(r.effectiveScore || 0);
          totalQuestions += Number(r.totalQuestions || 0);
        }
      }
    }

    const overallPercentage =
      totalQuestions > 0
        ? Math.round((earnedScore / totalQuestions) * 100)
        : 100;

    const allLessonsDone =
      totalLessonsCount > 0 && completedCount >= totalLessonsCount;
    const allRequiredQuizzesDone =
      requiredModules.length === 0 || completedQuizzes >= requiredModules.length;
    const meetsMinimumScore =
      requiredModules.length === 0 || overallPercentage >= 50;

    const certificateUnlocked = Boolean(
      data?.progress?.certificateId ||
        (allLessonsDone && allRequiredQuizzesDone && meetsMinimumScore),
    );

    return {
      hasRequiredQuizzes: requiredModules.length > 0,
      requiredQuizzesCount: requiredModules.length,
      completedQuizzesCount: completedQuizzes,
      earnedScore: Math.round(earnedScore * 100) / 100,
      totalQuestions,
      overallPercentage,
      allLessonsDone,
      allRequiredQuizzesDone,
      meetsMinimumScore,
      certificateUnlocked,
    };
  }, [data, quizResults, totalLessonsCount, completedCount]);

  const openChapterQuiz = (moduleId: string) => {
    setActiveQuizModuleId(moduleId);
    setQuizAnswers({});
    setQuizError(null);
    const existingRes = quizResults[moduleId];
    const lastAttempt =
      existingRes?.attempts && existingRes.attempts.length > 0
        ? existingRes.attempts[existingRes.attempts.length - 1]
        : null;
    setLatestQuizAttempt(lastAttempt);
  };

  const handleStartRetake = () => {
    setQuizAnswers({});
    setLatestQuizAttempt(null);
    setQuizError(null);
  };

  const handleSubmitQuiz = async () => {
    if (!activeQuizModule || !data) return;
    try {
      setSubmittingQuiz(true);
      setQuizError(null);
      const res = await api<{
        attempt: ShopQuizAttempt;
        chapterResult: ShopChapterQuizResult;
        progress: ShopCourseProgress;
        certificateId?: string;
        certificateUnlocked?: boolean;
      }>("shop.course.quiz.submit", {
        courseId: data.course.id,
        moduleId: activeQuizModule.id,
        answers: quizAnswers,
      });

      setLatestQuizAttempt(res.attempt);
      setData((prev) => (prev ? { ...prev, progress: res.progress } : prev));

      if (res.certificateUnlocked && res.certificateId) {
        void handleViewCertificate(res.certificateId);
      }
    } catch (e: unknown) {
      setQuizError(
        e instanceof Error ? e.message : "Failed to submit chapter quiz.",
      );
    } finally {
      setSubmittingQuiz(false);
    }
  };

  const toggleLessonComplete = async (
    lessonId: string,
    markComplete: boolean,
  ) => {
    try {
      setUpdatingProgress(true);
      const res = await api<{
        progress: ShopCourseProgress;
        certificateId?: string;
      }>("shop.course.progress", {
        courseId,
        lessonId,
        completed: markComplete,
      });
      setData((prev) => (prev ? { ...prev, progress: res.progress } : prev));
      if (res.certificateId) {
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
    if (currentLessonEntry?.isLastInModule && currentLessonEntry.moduleHasQuiz) {
      openChapterQuiz(currentLessonEntry.moduleId);
      return;
    }
    if (currentLessonIndex < allLessons.length - 1) {
      setActiveQuizModuleId(null);
      setCurrentLessonId(allLessons[currentLessonIndex + 1].lesson.id);
    }
  };

  const handlePrevLesson = () => {
    setActiveQuizModuleId(null);
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
  const activeChapterQuizResult = activeQuizModule
    ? quizResults[activeQuizModule.id]
    : undefined;
  const retakePolicy = activeQuizModule?.quiz?.retakePolicy || "unlimited";
  const maxAttempts =
    retakePolicy === "single"
      ? 1
      : retakePolicy === "limited"
        ? activeQuizModule?.quiz?.maxAttempts || 3
        : Infinity;
  const attemptsUsed = activeChapterQuizResult?.attemptsCount || 0;
  const canRetakeQuiz = attemptsUsed < maxAttempts;

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
              {completedCount}/{totalLessonsCount} lessons ({progressPercent}%)
            </span>
          </div>

          {quizEligibility.hasRequiredQuizzes && (
            <div
              className="classroom-progress-pill"
              title="Overall Course Quiz Score (Minimum 50% required for certificate)"
            >
              <Sparkles size={13} style={{ color: "#f59e0b" }} />
              <span>
                Quiz Score: {quizEligibility.earnedScore}/
                {quizEligibility.totalQuestions} (
                {quizEligibility.overallPercentage}%)
              </span>
            </div>
          )}

          {/* Certificate button */}
          {course.certificateEnabled !== false &&
            (data.progress?.certificateId ? (
              <button
                type="button"
                className="btn btn-primary btn-small classroom-cert-btn"
                onClick={() => handleViewCertificate()}
              >
                <Award size={15} />
                <span>Certificate Ready</span>
              </button>
            ) : (
              <span
                className="classroom-progress-pill"
                style={{ opacity: 0.85 }}
                title="Complete all required lessons and achieve a minimum overall quiz score of 50%"
              >
                <Lock size={13} />
                <span>Certificate Locked (Min 50% Quiz)</span>
              </span>
            ))}
        </div>
      </header>

      {/* Classroom Body: Main Stage & Lesson Sidebar */}
      <div className="classroom-main-container">
        {/* Left / Center: Video Stage OR Chapter Quiz Assessment Stage */}
        <main className="classroom-stage">
          {activeQuizModule && activeQuizModule.quiz ? (
            <div
              className="classroom-content-box"
              style={{ marginTop: 0, padding: "1.75rem" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: "1rem",
                  marginBottom: "1.25rem",
                  paddingBottom: "1rem",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div>
                  <span
                    className="eyebrow"
                    style={{ display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <Sparkles size={14} style={{ color: "#f59e0b" }} />
                    CHAPTER QUIZ ASSESSMENT
                  </span>
                  <h1 style={{ margin: "4px 0 6px" }}>
                    {activeQuizModule.title} — Quiz
                  </h1>
                  {activeQuizModule.summary && (
                    <p className="text-muted" style={{ margin: 0, fontSize: "14px" }}>
                      {activeQuizModule.summary}
                    </p>
                  )}
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span className="classroom-track-badge">
                    {(activeQuizModule.quiz.questions || []).length} Questions
                  </span>
                  <span className="classroom-track-badge">
                    Scoring: {activeQuizModule.quiz.scoringMethod || "highest"}
                  </span>
                  <span className="classroom-track-badge">
                    Attempts: {attemptsUsed}
                    {Number.isFinite(maxAttempts) ? ` / ${maxAttempts}` : " (Unlimited)"}
                  </span>
                </div>
              </div>

              {/* Key Learning Points Recap if available */}
              {activeQuizModule.keyLearningPoints &&
                activeQuizModule.keyLearningPoints.length > 0 &&
                !latestQuizAttempt && (
                  <div
                    style={{
                      padding: "0.9rem 1.1rem",
                      borderRadius: "10px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      marginBottom: "1.25rem",
                    }}
                  >
                    <strong style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Key Learning Points Covered in This Chapter:
                    </strong>
                    <ul style={{ margin: "6px 0 0", paddingLeft: "1.2rem", fontSize: "13px" }}>
                      {activeQuizModule.keyLearningPoints.map((pt, idx) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                )}

              {quizError && (
                <div
                  style={{
                    padding: "0.85rem 1rem",
                    borderRadius: "10px",
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    color: "#f87171",
                    marginBottom: "1rem",
                    fontSize: "13px",
                  }}
                >
                  {quizError}
                </div>
              )}

              {/* Immediate Feedback Banner after Submission */}
              {latestQuizAttempt && (
                <div
                  style={{
                    padding: "1.25rem",
                    borderRadius: "12px",
                    marginBottom: "1.5rem",
                    background: latestQuizAttempt.passed
                      ? "rgba(16, 185, 129, 0.12)"
                      : "rgba(239, 68, 68, 0.12)",
                    border: latestQuizAttempt.passed
                      ? "1px solid rgba(16, 185, 129, 0.4)"
                      : "1px solid rgba(239, 68, 68, 0.4)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "1rem",
                    }}
                  >
                    <div>
                      <span className="eyebrow">
                        ATTEMPT #{latestQuizAttempt.attemptNumber} RESULT
                      </span>
                      <h3 style={{ margin: "4px 0" }}>
                        {latestQuizAttempt.passed
                          ? "🎉 Passed! Great understanding of this chapter."
                          : "⚠️ Below 50% Passing Threshold — Review & Retake"}
                      </h3>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "1rem",
                          marginTop: "0.5rem",
                          fontSize: "14px",
                        }}
                      >
                        <span>
                          Score:{" "}
                          <strong>
                            {latestQuizAttempt.score} /{" "}
                            {latestQuizAttempt.totalQuestions}
                          </strong>
                        </span>
                        <span>
                          Percentage:{" "}
                          <strong>{latestQuizAttempt.percentage}%</strong>
                        </span>
                        <span style={{ color: "#10b981" }}>
                          Correct: <strong>{latestQuizAttempt.correctCount}</strong>
                        </span>
                        <span style={{ color: "#f87171" }}>
                          Incorrect:{" "}
                          <strong>{latestQuizAttempt.incorrectCount}</strong>
                        </span>
                        <span>
                          Status:{" "}
                          <strong>
                            {latestQuizAttempt.passed ? "PASSED" : "FAILED"}
                          </strong>
                        </span>
                      </div>
                      {activeChapterQuizResult && (
                        <div
                          className="text-muted"
                          style={{ fontSize: "12px", marginTop: "6px" }}
                        >
                          Recorded Chapter Score (
                          {activeQuizModule.quiz.scoringMethod || "highest"}):{" "}
                          <strong>
                            {activeChapterQuizResult.effectiveScore} /{" "}
                            {activeChapterQuizResult.totalQuestions} (
                            {activeChapterQuizResult.effectivePercentage}%)
                          </strong>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {canRetakeQuiz ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-small"
                          onClick={handleStartRetake}
                        >
                          <RefreshCw size={14} /> Retake Quiz
                        </button>
                      ) : (
                        <span className="classroom-track-badge">
                          Max attempts reached
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => setActiveQuizModuleId(null)}
                      >
                        Back to Lessons
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Questions List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {(activeQuizModule.quiz.questions || []).map((q, qIdx) => {
                  const fb = latestQuizAttempt?.feedback?.find(
                    (f) => f.questionId === q.id,
                  );

                  return (
                    <div
                      key={q.id}
                      style={{
                        padding: "1.15rem",
                        borderRadius: "12px",
                        background: "rgba(255,255,255,0.03)",
                        border: fb
                          ? fb.correct
                            ? "1px solid rgba(16, 185, 129, 0.45)"
                            : "1px solid rgba(239, 68, 68, 0.45)"
                          : "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          marginBottom: "0.75rem",
                        }}
                      >
                        <strong style={{ fontSize: "15px" }}>
                          {qIdx + 1}. {q.question}
                        </strong>
                        <span
                          className="classroom-track-badge"
                          style={{ fontSize: "11px", height: "fit-content" }}
                        >
                          {q.type === "multiple_choice"
                            ? "Multiple Choice"
                            : q.type === "true_false"
                              ? "True / False"
                              : q.type === "multiple_answer"
                                ? "Select All That Apply"
                                : "Short Answer"}
                        </span>
                      </div>

                      {(q.type === "multiple_choice" || q.type === "true_false") && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                          }}
                        >
                          {(q.options && q.options.length > 0
                            ? q.options
                            : ["True", "False"]
                          ).map((opt) => {
                            const selected = quizAnswers[q.id] === opt;
                            return (
                              <label
                                key={opt}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.6rem",
                                  padding: "0.6rem 0.85rem",
                                  borderRadius: "8px",
                                  border: selected
                                    ? "1px solid rgba(217, 119, 6, 0.6)"
                                    : "1px solid rgba(255,255,255,0.08)",
                                  background: selected
                                    ? "rgba(217, 119, 6, 0.1)"
                                    : "rgba(255,255,255,0.02)",
                                  cursor: latestQuizAttempt ? "default" : "pointer",
                                }}
                              >
                                <input
                                  type="radio"
                                  name={`student_q_${q.id}`}
                                  disabled={Boolean(latestQuizAttempt)}
                                  checked={selected}
                                  onChange={() =>
                                    setQuizAnswers((prev) => ({
                                      ...prev,
                                      [q.id]: opt,
                                    }))
                                  }
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {q.type === "multiple_answer" && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                          }}
                        >
                          {(q.options || []).map((opt) => {
                            const curr = Array.isArray(quizAnswers[q.id])
                              ? (quizAnswers[q.id] as string[])
                              : [];
                            const checked = curr.includes(opt);
                            return (
                              <label
                                key={opt}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.6rem",
                                  padding: "0.6rem 0.85rem",
                                  borderRadius: "8px",
                                  border: checked
                                    ? "1px solid rgba(217, 119, 6, 0.6)"
                                    : "1px solid rgba(255,255,255,0.08)",
                                  background: checked
                                    ? "rgba(217, 119, 6, 0.1)"
                                    : "rgba(255,255,255,0.02)",
                                  cursor: latestQuizAttempt ? "default" : "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  disabled={Boolean(latestQuizAttempt)}
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...curr, opt]
                                      : curr.filter((x) => x !== opt);
                                    setQuizAnswers((prev) => ({
                                      ...prev,
                                      [q.id]: next,
                                    }));
                                  }}
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {q.type === "short_answer" && (
                        <input
                          type="text"
                          className="input"
                          disabled={Boolean(latestQuizAttempt)}
                          placeholder="Type your answer here..."
                          value={
                            typeof quizAnswers[q.id] === "string"
                              ? (quizAnswers[q.id] as string)
                              : ""
                          }
                          onChange={(e) =>
                            setQuizAnswers((prev) => ({
                              ...prev,
                              [q.id]: e.target.value,
                            }))
                          }
                        />
                      )}

                      {fb && (
                        <div
                          style={{
                            marginTop: "0.75rem",
                            paddingTop: "0.65rem",
                            borderTop: "1px solid rgba(255,255,255,0.08)",
                            fontSize: "13px",
                            color: fb.correct ? "#10b981" : "#f87171",
                          }}
                        >
                          <strong>
                            {fb.correct ? "✓ Correct!" : "✗ Incorrect"}
                          </strong>
                          {!fb.correct && fb.correctAnswer && (
                            <span style={{ marginLeft: "8px" }}>
                              Correct Answer:{" "}
                              <strong>
                                {Array.isArray(fb.correctAnswer)
                                  ? fb.correctAnswer.join(", ")
                                  : fb.correctAnswer}
                              </strong>
                            </span>
                          )}
                          {fb.explanation && (
                            <div
                              className="text-muted"
                              style={{ marginTop: "4px", fontSize: "12px" }}
                            >
                              {fb.explanation}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Submit Quiz Footer */}
              {!latestQuizAttempt && (
                <div
                  style={{
                    marginTop: "1.5rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setActiveQuizModuleId(null)}
                  >
                    <ArrowLeft size={15} /> Back to Lesson Video
                  </button>

                  {canRetakeQuiz ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void handleSubmitQuiz()}
                      disabled={submittingQuiz}
                    >
                      <CheckCircle2 size={16} />
                      {submittingQuiz
                        ? "Grading Quiz…"
                        : "Submit Chapter Quiz for Instant Grading"}
                    </button>
                  ) : (
                    <span className="text-muted">
                      You have used all allowed attempts for this chapter quiz.
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Responsive Video Container */}
              <div className="classroom-video-frame">
                {currentLesson?.videoUrl ? (
                  <AdVideoPlayer
                    key={currentLesson.id}
                    videoUrl={currentLesson.videoUrl}
                    title={currentLesson.title || "Lesson Video"}
                    poster={course.thumbnailUrl}
                    courseId={course.id}
                    className="classroom-player-element"
                  />
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
                    disabled={
                      currentLessonIndex >= allLessons.length - 1 &&
                      !(
                        currentLessonEntry?.isLastInModule &&
                        currentLessonEntry?.moduleHasQuiz
                      )
                    }
                  >
                    {currentLessonEntry?.isLastInModule &&
                    currentLessonEntry?.moduleHasQuiz
                      ? "Take Chapter Quiz"
                      : "Next"}
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="action-bar-right" style={{ display: "flex", gap: "0.5rem" }}>
                  {currentLessonEntry?.moduleHasQuiz && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => openChapterQuiz(currentLessonEntry.moduleId)}
                    >
                      <HelpCircle size={15} />
                      Chapter Quiz
                    </button>
                  )}
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
                    Resources & Materials ({currentLesson?.resources?.length || 0})
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
                      {!currentLesson?.resources ||
                      currentLesson.resources.length === 0 ? (
                        <p className="text-muted">
                          No external material files attached to this lesson.
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
                              onClick={(e) => {
                                if (
                                  res.url.startsWith("/api/upload") ||
                                  res.url.startsWith("uploads/")
                                ) {
                                  e.preventDefault();
                                  void downloadAttachment(res.url);
                                }
                              }}
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
            </>
          )}
        </main>

        {/* Right: Curriculum & Certification Status Sidebar */}
        <aside className="classroom-sidebar">
          <div className="classroom-sidebar-header">
            <h3>Course Curriculum</h3>
            <span className="sidebar-total-badge">
              {totalLessonsCount} lessons
            </span>
          </div>

          {/* Certificate Eligibility & Overall Quiz Score Card */}
          {course.certificateEnabled !== false && (
            <div
              style={{
                margin: "0.75rem 1rem",
                padding: "0.95rem 1rem",
                borderRadius: "12px",
                background: quizEligibility.certificateUnlocked
                  ? "rgba(16, 185, 129, 0.12)"
                  : "rgba(255, 255, 255, 0.04)",
                border: quizEligibility.certificateUnlocked
                  ? "1px solid rgba(16, 185, 129, 0.4)"
                  : "1px solid rgba(255, 255, 255, 0.1)",
                fontSize: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "6px",
                  fontWeight: 700,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {quizEligibility.certificateUnlocked ? (
                    <>
                      <Award size={15} style={{ color: "#10b981" }} />
                      <span style={{ color: "#10b981" }}>Certificate Unlocked</span>
                    </>
                  ) : (
                    <>
                      <Lock size={14} style={{ color: "#f59e0b" }} />
                      <span>Certificate Locked</span>
                    </>
                  )}
                </span>
                {quizEligibility.hasRequiredQuizzes && (
                  <span>
                    Overall Quiz: {quizEligibility.overallPercentage}%
                  </span>
                )}
              </div>

              <p
                className="text-muted"
                style={{ margin: "0 0 8px", fontSize: "11.5px", lineHeight: 1.45 }}
              >
                {quizEligibility.certificateUnlocked
                  ? "Congratulations! Your certificate is ready for download."
                  : "Complete all required lessons and achieve a minimum overall quiz score of 50%."}
              </p>

              {quizEligibility.hasRequiredQuizzes && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    opacity: 0.85,
                    marginBottom: quizEligibility.certificateUnlocked ? "8px" : 0,
                  }}
                >
                  <span>
                    Quizzes: {quizEligibility.completedQuizzesCount}/
                    {quizEligibility.requiredQuizzesCount}
                  </span>
                  <span>
                    Score: {quizEligibility.earnedScore}/
                    {quizEligibility.totalQuestions} (Min 50%)
                  </span>
                </div>
              )}

              {quizEligibility.certificateUnlocked &&
                data.progress?.certificateId && (
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    style={{ width: "100%", justifyContent: "center" }}
                    onClick={() => handleViewCertificate()}
                  >
                    <Award size={14} /> Download Certificate
                  </button>
                )}
            </div>
          )}

          <div className="classroom-modules-accordion">
            {(course.curriculum || []).map((mod, modIdx) => {
              const isOpen = !!openModuleIds[mod.id];
              const modLessons = mod.lessons || [];
              const modCompletedCount = modLessons.filter((l) =>
                completedLessonIds.includes(l.id),
              ).length;
              const hasQuiz = Boolean(
                mod.quiz?.enabled && (mod.quiz?.questions?.length || 0) > 0,
              );
              const modQuizResult = quizResults[mod.id];

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
                      {isOpen ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="classroom-mod-lessons">
                      {modLessons.map((les) => {
                        const isCurrent =
                          !activeQuizModuleId && les.id === currentLessonId;
                        const isCompleted = completedLessonIds.includes(les.id);

                        return (
                          <div
                            key={les.id}
                            className={`classroom-sidebar-lesson ${
                              isCurrent ? "active" : ""
                            } ${isCompleted ? "completed" : ""}`}
                            onClick={() => {
                              setActiveQuizModuleId(null);
                              setCurrentLessonId(les.id);
                            }}
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

                      {/* End-of-Chapter Quiz Row */}
                      {hasQuiz && (
                        <div
                          className={`classroom-sidebar-lesson ${
                            activeQuizModuleId === mod.id ? "active" : ""
                          } ${modQuizResult?.passed ? "completed" : ""}`}
                          onClick={() => openChapterQuiz(mod.id)}
                          role="button"
                          tabIndex={0}
                          style={{
                            borderTop: "1px dashed rgba(255,255,255,0.08)",
                            background:
                              activeQuizModuleId === mod.id
                                ? "rgba(217, 119, 6, 0.14)"
                                : undefined,
                          }}
                        >
                          <div className="lesson-check-btn">
                            {modQuizResult && modQuizResult.attemptsCount > 0 ? (
                              <CheckCircle2
                                size={16}
                                className={
                                  modQuizResult.passed
                                    ? "checked-icon"
                                    : "unchecked-icon"
                                }
                              />
                            ) : (
                              <HelpCircle
                                size={16}
                                style={{ color: "#f59e0b" }}
                              />
                            )}
                          </div>
                          <div className="sidebar-lesson-info">
                            <span
                              className="sidebar-lesson-title"
                              style={{ fontWeight: 600 }}
                            >
                              Chapter {modIdx + 1} Quiz
                            </span>
                            <div className="sidebar-lesson-meta">
                              <span>
                                {(mod.quiz?.questions || []).length} questions
                              </span>
                              {modQuizResult &&
                                modQuizResult.attemptsCount > 0 && (
                                  <span
                                    style={{
                                      color: modQuizResult.passed
                                        ? "#10b981"
                                        : "#f59e0b",
                                      fontWeight: 600,
                                    }}
                                  >
                                    • {modQuizResult.effectiveScore}/
                                    {modQuizResult.totalQuestions} (
                                    {modQuizResult.effectivePercentage}%)
                                  </span>
                                )}
                            </div>
                          </div>
                        </div>
                      )}
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
