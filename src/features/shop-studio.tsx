"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  Eye,
  Check,
  ArrowLeft,
  Upload,
  Video,
  FileText,
  Layers,
  ChevronDown,
  ChevronUp,
  Download,
  Award,
  ExternalLink,
  PlayCircle,
  HelpCircle,
  Clock,
  Lock,
  Paperclip,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  BarChart3,
  Users,
} from "lucide-react";
import { api, uploadFile } from "@/lib/api";
import { useAction, ActionMessage } from "@/features/admin/shared";
import { getVideoEmbed } from "@/lib/video";
import type {
  ShopItem,
  ShopCourseModule,
  ShopCourseLesson,
  ShopCourseLessonResource,
  ShopChapterQuizConfig,
  ShopChapterQuizQuestion,
  ShopQuizQuestionType,
  ShopQuizRetakePolicy,
  ShopQuizScoringMethod,
  ShopCourseQuizAnalytics,
} from "@/lib/types";

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length >= 2 ? base : `${base || "course"}-${Date.now().toString().slice(-4)}`;
}

const DEFAULT_COURSE: Omit<ShopItem, "id" | "createdAt" | "updatedAt"> = {
  title: "",
  slug: "",
  type: "course",
  subtitle: "",
  description: "",
  price: 15000,
  compareAtPrice: 25000,
  category: "Systems & Development",
  tags: ["Practical", "Masterclass"],
  badge: "Featured",
  thumbnailUrl: "",
  previewVideoUrl: "",
  whatYouWillLearn: ["Master industry-standard production workflows."],
  requirements: ["Basic computer literacy and enthusiasm to learn."],
  targetAudience: ["Learners looking for professional, career-accelerating skills."],
  published: false,
  featured: false,
  level: "All Levels",
  totalDuration: "8 hours",
  certificateEnabled: true,
  includedInPremium: false,
  curriculum: [
    {
      id: "module-1",
      title: "Module 1: Orientation & Foundations",
      description: "Setting up your tools, workspace, and core fundamentals.",
      summary: "Covers foundational setup, core workflows, and verification best practices.",
      keyLearningPoints: [
        "Setting up your development and production workspace",
        "Understanding the core workflow and verification steps",
      ],
      order: 1,
      lessons: [
        {
          id: "lesson-1-1",
          title: "Welcome & Course Roadmap",
          duration: "08:30",
          videoUrl: "",
          content: "Welcome to this professional masterclass. Below you will find key resources and roadmap notes.",
          resources: [],
          isFreePreview: true,
          order: 1,
        },
      ],
    },
  ],
};

const DEFAULT_PRODUCT: Omit<ShopItem, "id" | "createdAt" | "updatedAt"> = {
  title: "",
  slug: "",
  type: "digital_product",
  subtitle: "",
  description: "",
  price: 5000,
  compareAtPrice: 10000,
  category: "Creative Media Studio",
  tags: ["Template", "Guide"],
  badge: "Popular",
  thumbnailUrl: "",
  previewVideoUrl: "",
  whatYouWillLearn: ["Instant production assets and complete step-by-step guides."],
  requirements: [],
  targetAudience: ["Designers, developers, and creators."],
  published: false,
  featured: false,
  fileUrl: "",
  fileFormat: "PDF & ZIP",
  fileSize: "18.4 MB",
  version: "v1.0",
  includes: [
    "Comprehensive 80-page reference handbook",
    "Production-ready design templates",
    "Lifetime digital updates",
  ],
};

export function ShopStudio() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const action = useAction();

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await api<ShopItem[]>("shop.admin.list");
      setItems(res || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchItems();
  }, []);

  const [activeItem, setActiveItem] = useState<Partial<ShopItem> | null>(null);
  const [activeTab, setActiveTab] = useState<
    "info" | "curriculum" | "outcomes" | "quizzes"
  >("info");
  const [selectedLessonEdit, setSelectedLessonEdit] = useState<{
    moduleId: string;
    lesson: ShopCourseLesson;
  } | null>(null);
  const [selectedQuizModuleId, setSelectedQuizModuleId] = useState<string | null>(
    null,
  );
  const [previewQuizModuleId, setPreviewQuizModuleId] = useState<string | null>(
    null,
  );
  const [quizAnalytics, setQuizAnalytics] =
    useState<ShopCourseQuizAnalytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "course" | "digital_product">("all");

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterType !== "all" && item.type !== filterType) return false;
      return true;
    });
  }, [items, filterType]);

  const fetchQuizAnalytics = async (courseId: string) => {
    try {
      setLoadingAnalytics(true);
      const res = await api<ShopCourseQuizAnalytics>(
        "shop.admin.quiz.analytics",
        { courseId },
      );
      setQuizAnalytics(res);
    } catch {
      setQuizAnalytics(null);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    if (activeTab === "quizzes" && activeItem?.id && activeItem.type === "course") {
      void fetchQuizAnalytics(activeItem.id);
    }
  }, [activeTab, activeItem?.id, activeItem?.type]);

  const handleCreateNew = (type: "course" | "digital_product") => {
    const base = type === "course" ? { ...DEFAULT_COURSE } : { ...DEFAULT_PRODUCT };
    setActiveItem(base);
    setActiveTab("info");
    setSelectedLessonEdit(null);
    setSelectedQuizModuleId(null);
    setPreviewQuizModuleId(null);
    setQuizAnalytics(null);
    setThumbError(false);
  };

  const handleEditItem = (item: ShopItem) => {
    setActiveItem(JSON.parse(JSON.stringify(item)));
    setActiveTab("info");
    setSelectedLessonEdit(null);
    setSelectedQuizModuleId(null);
    setPreviewQuizModuleId(null);
    setQuizAnalytics(null);
    setThumbError(false);
  };

  const handleSave = async (publishNow?: boolean) => {
    if (!activeItem) return;

    const finalTitle = activeItem.title?.trim();
    if (!finalTitle) {
      alert("Please enter a title for your course or product.");
      setActiveTab("info");
      return;
    }

    const isPublished =
      publishNow !== undefined ? publishNow : !!activeItem.published;

    // Sanitize modules, lessons, and chapter quizzes
    const sanitizedCurriculum: ShopCourseModule[] = (activeItem.curriculum || []).map(
      (mod, mIdx) => {
        const sanitizedQuiz: ShopChapterQuizConfig | undefined = mod.quiz
          ? {
              enabled: Boolean(mod.quiz.enabled),
              required: mod.quiz.required !== false,
              requiredQuestionsCount:
                typeof mod.quiz.requiredQuestionsCount === "number" &&
                mod.quiz.requiredQuestionsCount > 0
                  ? mod.quiz.requiredQuestionsCount
                  : undefined,
              retakePolicy: mod.quiz.retakePolicy || "unlimited",
              maxAttempts:
                typeof mod.quiz.maxAttempts === "number" && mod.quiz.maxAttempts > 0
                  ? mod.quiz.maxAttempts
                  : 3,
              scoringMethod: mod.quiz.scoringMethod || "highest",
              questions: (mod.quiz.questions || [])
                .map((q, qIdx) => ({
                  id: q.id || `quiz_q_${Date.now()}_${mIdx}_${qIdx}`,
                  type: q.type || "multiple_choice",
                  question: (q.question || "").trim() || `Question ${qIdx + 1}`,
                  options: (q.options || []).map((o) => o.trim()).filter(Boolean),
                  correctAnswer: (q.correctAnswer || "").trim(),
                  correctAnswers: (q.correctAnswers || [])
                    .map((c) => c.trim())
                    .filter(Boolean),
                  explanation: (q.explanation || "").trim(),
                  points: typeof q.points === "number" && q.points > 0 ? q.points : 1,
                }))
                .filter((q) => q.question.length > 0),
            }
          : undefined;

        return {
          id: mod.id || `module-${Date.now()}-${mIdx}`,
          title: mod.title?.trim() || `Module ${mIdx + 1}`,
          description: mod.description?.trim() || "",
          summary: mod.summary?.trim() || "",
          keyLearningPoints: (mod.keyLearningPoints || [])
            .map((k) => k.trim())
            .filter(Boolean),
          order: mIdx + 1,
          lessons: (mod.lessons || []).map((les, lIdx) => ({
            id: les.id || `lesson-${Date.now()}-${mIdx}-${lIdx}`,
            title: les.title?.trim() || `Lesson ${lIdx + 1}`,
            duration: les.duration?.trim() || "10:00",
            videoUrl: les.videoUrl?.trim() || "",
            content: les.content || "",
            resources: (les.resources || []).map((res) => ({
              id: (res as ShopCourseLessonResource & { id?: string }).id,
              title: res.title?.trim() || "Resource",
              url: res.url?.trim() || "",
              size: res.size?.trim(),
            })),
            isFreePreview: Boolean(les.isFreePreview),
            order: lIdx + 1,
          })),
          quiz: sanitizedQuiz,
        };
      },
    );

    const rawComparePrice = activeItem.compareAtPrice;
    const cleanComparePrice =
      typeof rawComparePrice === "number" && rawComparePrice > 0
        ? rawComparePrice
        : undefined;

    const payload: Partial<ShopItem> = {
      ...activeItem,
      title: finalTitle,
      slug: slugify(activeItem.slug?.trim() || finalTitle),
      published: isPublished,
      subtitle: activeItem.subtitle?.trim() || "",
      description: activeItem.description?.trim() || "",
      price: Math.max(100, Number(activeItem.price) || 100),
      compareAtPrice: cleanComparePrice,
      thumbnailUrl: activeItem.thumbnailUrl?.trim() || "",
      previewVideoUrl: activeItem.previewVideoUrl?.trim() || "",
      whatYouWillLearn: (activeItem.whatYouWillLearn || [])
        .map((s) => s.trim())
        .filter(Boolean),
      requirements: (activeItem.requirements || [])
        .map((s) => s.trim())
        .filter(Boolean),
      targetAudience: (activeItem.targetAudience || [])
        .map((s) => s.trim())
        .filter(Boolean),
      tags: (activeItem.tags || []).map((s) => s.trim()).filter(Boolean),
      curriculum: sanitizedCurriculum,
    };

    const successMsg = isPublished
      ? "Course published and live in catalog!"
      : "Course draft saved successfully!";

    const ok = await action.run(async () => {
      await api("shop.admin.save", { item: payload });
      await fetchItems();
      setActiveItem(null);
      setSelectedLessonEdit(null);
      setSelectedQuizModuleId(null);
      setPreviewQuizModuleId(null);
    }, successMsg);

    if (!ok) {
      alert(action.message || "Failed to save or publish. Please check details.");
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) return;
    await action.run(async () => {
      await api("shop.admin.delete", { id });
      await fetchItems();
      if (activeItem?.id === id) setActiveItem(null);
    }, "Item deleted.");
  };

  async function handleThumbnailUpload(file: File) {
    try {
      setUploadingThumb(true);
      const res = await uploadFile(file);
      setActiveItem((prev) => (prev ? { ...prev, thumbnailUrl: res.url } : prev));
      setThumbError(false);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploadingThumb(false);
    }
  }

  async function handleDigitalAssetUpload(file: File) {
    try {
      setUploadingAsset(true);
      const res = await uploadFile(file);
      if (activeItem) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        setActiveItem({
          ...activeItem,
          fileUrl: res.url,
          fileSize: `${sizeMb} MB`,
          fileFormat: file.name.split(".").pop()?.toUpperCase() || "ZIP",
        });
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploadingAsset(false);
    }
  }

  // --- Curriculum Helpers ---
  const addModule = () => {
    if (!activeItem) return;
    const curr = activeItem.curriculum || [];
    const nextOrder = curr.length + 1;
    const newMod: ShopCourseModule = {
      id: `module-${Date.now()}`,
      title: `Module ${nextOrder}: New Chapter`,
      description: "",
      order: nextOrder,
      lessons: [],
    };
    setActiveItem({ ...activeItem, curriculum: [...curr, newMod] });
  };

  const updateModule = (modId: string, updates: Partial<ShopCourseModule>) => {
    if (!activeItem) return;
    const curr = (activeItem.curriculum || []).map((m) =>
      m.id === modId ? { ...m, ...updates } : m,
    );
    setActiveItem({ ...activeItem, curriculum: curr });
  };

  const deleteModule = (modId: string) => {
    if (!confirm("Are you sure you want to delete this chapter and all its lessons?")) return;
    if (!activeItem) return;
    const curr = (activeItem.curriculum || []).filter((m) => m.id !== modId);
    setActiveItem({ ...activeItem, curriculum: curr });
  };

  const addLesson = (modId: string) => {
    if (!activeItem) return;
    const mod = (activeItem.curriculum || []).find((m) => m.id === modId);
    const nextOrder = (mod?.lessons?.length || 0) + 1;
    const newLesson: ShopCourseLesson = {
      id: `lesson-${Date.now()}`,
      title: `Lesson ${nextOrder}: New Topic`,
      duration: "10:00",
      videoUrl: "",
      content: "",
      resources: [],
      isFreePreview: false,
      order: nextOrder,
    };
    const curr = (activeItem.curriculum || []).map((m) =>
      m.id === modId ? { ...m, lessons: [...(m.lessons || []), newLesson] } : m,
    );
    setActiveItem({ ...activeItem, curriculum: curr });
    setSelectedLessonEdit({ moduleId: modId, lesson: newLesson });
  };

  const saveLessonEdit = (modId: string, lesson: ShopCourseLesson) => {
    if (!activeItem) return;
    const curr = (activeItem.curriculum || []).map((m) => {
      if (m.id !== modId) return m;
      return {
        ...m,
        lessons: (m.lessons || []).map((l) => (l.id === lesson.id ? lesson : l)),
      };
    });
    setActiveItem({ ...activeItem, curriculum: curr });
    setSelectedLessonEdit(null);
  };

  const deleteLesson = (modId: string, lessonId: string) => {
    if (!confirm("Delete this lesson?")) return;
    if (!activeItem) return;
    const curr = (activeItem.curriculum || []).map((m) => {
      if (m.id !== modId) return m;
      return {
        ...m,
        lessons: (m.lessons || []).filter((l) => l.id !== lessonId),
      };
    });
    setActiveItem({ ...activeItem, curriculum: curr });
    if (selectedLessonEdit?.lesson.id === lessonId) setSelectedLessonEdit(null);
  };

  // --- Render Editor ---
  if (activeItem) {
    const isCourse = activeItem.type === "course";
    const previewTrailerEmbed = activeItem.previewVideoUrl
      ? getVideoEmbed(activeItem.previewVideoUrl)
      : null;

    return (
      <div className="studio-editor">
        {/* Studio Top Bar */}
        <div className="studio-topbar">
          <div className="studio-topbar-left">
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => {
                if (confirm("Leave editor? Any unsaved changes will be lost.")) {
                  setActiveItem(null);
                  setSelectedLessonEdit(null);
                }
              }}
            >
              <ArrowLeft size={16} />
              Back to catalog
            </button>
            <div className="studio-topbar-title">
              <h2>{activeItem.title || "Untitled Product"}</h2>
              <span className={`shop-card-type-badge ${isCourse ? "course" : "product"}`}>
                {isCourse ? "Course Builder" : "Digital Asset"}
              </span>
              <span className={`studio-status-pill ${activeItem.published ? "published" : "draft"}`}>
                {activeItem.published ? "Live / Published" : "Draft"}
              </span>
            </div>
          </div>

          <div className="studio-topbar-actions">
            {activeItem.slug && activeItem.published && (
              <Link
                href={`/shop/${activeItem.slug}`}
                target="_blank"
                className="btn btn-secondary btn-small"
              >
                <Eye size={15} />
                View live page
              </Link>
            )}
            {activeItem.published && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => handleSave(false)}
                disabled={action.busy}
                title="Unpublish course and set back to Draft"
              >
                Revert to draft
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleSave(false)}
              disabled={action.busy}
            >
              Save draft
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleSave(true)}
              disabled={action.busy}
            >
              <Check size={15} />
              {activeItem.published ? "Update & Keep Live" : "Save & Publish"}
            </button>
          </div>
        </div>

        <ActionMessage action={action} />

        {/* Tab Navigation */}
        <div className="studio-nav-tabs">
          <button
            type="button"
            className={`studio-tab-btn ${activeTab === "info" ? "active" : ""}`}
            onClick={() => setActiveTab("info")}
          >
            <FileText size={16} />
            1. General Info & Pricing
          </button>
          {isCourse && (
            <button
              type="button"
              className={`studio-tab-btn ${activeTab === "curriculum" ? "active" : ""}`}
              onClick={() => setActiveTab("curriculum")}
            >
              <Layers size={16} />
              2. Curriculum & Video Studio (
              {(activeItem.curriculum || []).reduce(
                (acc, m) => acc + (m.lessons?.length || 0),
                0,
              )}{" "}
              lessons)
            </button>
          )}
          <button
            type="button"
            className={`studio-tab-btn ${activeTab === "outcomes" ? "active" : ""}`}
            onClick={() => setActiveTab("outcomes")}
          >
            <Award size={16} />
            {isCourse ? "3. Outcomes & Prerequisites" : "2. Deliverables & Details"}
          </button>
          {isCourse && (
            <button
              type="button"
              className={`studio-tab-btn ${activeTab === "quizzes" ? "active" : ""}`}
              onClick={() => setActiveTab("quizzes")}
            >
              <BarChart3 size={16} />
              4. Quiz Management & Scores (
              {(activeItem.curriculum || []).filter(
                (m) => m.quiz?.enabled && (m.quiz?.questions?.length || 0) > 0,
              ).length}{" "}
              quizzes)
            </button>
          )}
        </div>

        {/* Tab 1: General Info & Pricing */}
        {activeTab === "info" && (
          <div className="studio-form-grid">
            <section className="studio-section-card">
              <h3>Core Details</h3>
              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Masterclass: AI Engineering with Python"
                  value={activeItem.title || ""}
                  onChange={(e) => {
                    const title = e.target.value;
                    setActiveItem({
                      ...activeItem,
                      title,
                      slug: activeItem.id ? activeItem.slug : slugify(title),
                    });
                  }}
                />
              </div>

              <div className="form-group">
                <label>URL Slug * (Unique web path)</label>
                <div className="studio-slug-input">
                  <span>/shop/</span>
                  <input
                    type="text"
                    className="input"
                    placeholder="ai-engineering-python"
                    value={activeItem.slug || ""}
                    onChange={(e) =>
                      setActiveItem({ ...activeItem, slug: slugify(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Subtitle / Hook *</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Brief compelling 1-2 sentence pitch shown on cards and headers."
                  value={activeItem.subtitle || ""}
                  onChange={(e) =>
                    setActiveItem({ ...activeItem, subtitle: e.target.value })
                  }
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Category</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. AI & Machine Learning"
                    value={activeItem.category || ""}
                    onChange={(e) =>
                      setActiveItem({ ...activeItem, category: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Badge Label (Optional)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Bestseller, New, Popular"
                    value={activeItem.badge || ""}
                    onChange={(e) =>
                      setActiveItem({ ...activeItem, badge: e.target.value })
                    }
                  />
                </div>
              </div>

              {isCourse && (
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Skill Level</label>
                    <select
                      className="input"
                      value={activeItem.level || "All Levels"}
                      onChange={(e) =>
                        setActiveItem({
                          ...activeItem,
                          level: e.target.value as ShopItem["level"],
                        })
                      }
                    >
                      <option value="All Levels">All Levels</option>
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Total Duration</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. 14 Hours, 6 Weeks"
                      value={activeItem.totalDuration || ""}
                      onChange={(e) =>
                        setActiveItem({ ...activeItem, totalDuration: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Tags (comma-separated)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Python, LangChain, OpenAI, FastAPI"
                  value={(activeItem.tags || []).join(", ")}
                  onChange={(e) =>
                    setActiveItem({
                      ...activeItem,
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>

              <div className="form-group">
                <label>Full Description & Overview (Markdown supported)</label>
                <textarea
                  className="input"
                  rows={8}
                  placeholder="Detailed breakdown of what this course covers, its projects, and value."
                  value={activeItem.description || ""}
                  onChange={(e) =>
                    setActiveItem({ ...activeItem, description: e.target.value })
                  }
                />
              </div>
            </section>

            {/* Right Column: Pricing & Media */}
            <div className="studio-sidebar-column">
              <section className="studio-section-card">
                <h3>Pricing & Access (NGN ₦)</h3>
                <div className="form-group">
                  <label>Sale Price (₦ NGN) *</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="15000"
                    value={activeItem.price || ""}
                    onChange={(e) =>
                      setActiveItem({
                        ...activeItem,
                        price: Math.max(100, Number(e.target.value)),
                      })
                    }
                  />
                  <small className="form-help">
                    Students will pay ₦{(activeItem.price || 0).toLocaleString("en-NG")} via Paystack.
                  </small>
                </div>

                <div className="form-group">
                  <label>Compare-at Price (₦ NGN Anchor)</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="25000"
                    value={activeItem.compareAtPrice || ""}
                    onChange={(e) =>
                      setActiveItem({
                        ...activeItem,
                        compareAtPrice: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                  <small className="form-help">
                    Crossed-out original price to display savings percentage.
                  </small>
                </div>

                {isCourse && (
                  <>
                    <div className="form-checkbox-row">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={activeItem.includedInPremium === true}
                          onChange={(e) =>
                            setActiveItem({
                              ...activeItem,
                              includedInPremium: e.target.checked,
                            })
                          }
                        />
                        <span style={{ fontWeight: 600 }}>Included in Premium Membership</span>
                      </label>
                      <small className="form-help" style={{ marginLeft: "1.75rem", display: "block" }}>
                        Active Premium members (₦3,000/mo) unlock this course with no extra charge. Non-members pay the standard price.
                      </small>
                    </div>

                    <div className="form-checkbox-row">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={activeItem.certificateEnabled !== false}
                          onChange={(e) =>
                            setActiveItem({
                              ...activeItem,
                              certificateEnabled: e.target.checked,
                            })
                          }
                        />
                        <span>Enable Verified Certificate of Completion</span>
                      </label>
                    </div>
                  </>
                )}
              </section>

              <section className="studio-section-card">
                <h3>Cover Thumbnail Image</h3>
                <div className="form-group">
                  <label>Image URL or Uploaded Path</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="https://... or click Upload from Device below"
                    value={activeItem.thumbnailUrl || ""}
                    onChange={(e) => {
                      setThumbError(false);
                      setActiveItem({ ...activeItem, thumbnailUrl: e.target.value });
                    }}
                  />
                </div>
                <div className="studio-upload-box">
                  <label className="btn btn-secondary btn-small">
                    <Upload size={14} />
                    {uploadingThumb ? "Uploading…" : "Upload from Device"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleThumbnailUpload(file);
                      }}
                      disabled={uploadingThumb}
                    />
                  </label>
                  <span className="text-muted" style={{ fontSize: "12px", marginLeft: "10px" }}>
                    Recommended: 16:9 ratio (JPG, PNG, or WebP up to 2 MB)
                  </span>
                </div>
                {activeItem.thumbnailUrl && (
                  <div>
                    <div className="studio-thumbnail-preview">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={activeItem.thumbnailUrl}
                        alt="Thumbnail preview"
                        onError={() => setThumbError(true)}
                        onLoad={() => setThumbError(false)}
                      />
                    </div>
                    {thumbError && (
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "8px 12px",
                          borderRadius: "8px",
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.25)",
                          color: "#ef4444",
                          fontSize: "12px",
                        }}
                      >
                        ⚠️ Image failed to load from this link. If using an external host, make sure the link is public and ends directly in an image extension (.jpg, .png, .webp). Or click &quot;Upload from Device&quot; to upload your picture directly.
                      </div>
                    )}
                  </div>
                )}
              </section>

              {isCourse && (
                <section className="studio-section-card">
                  <h3>Promotional Video Trailer</h3>
                  <div className="form-group">
                    <label>Preview Video URL / Embed</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Paste YouTube, Vimeo, Loom, or Bunny link"
                      value={activeItem.previewVideoUrl || ""}
                      onChange={(e) =>
                        setActiveItem({
                          ...activeItem,
                          previewVideoUrl: e.target.value,
                        })
                      }
                    />
                    <small className="form-help">
                      Shown to prospective buyers on the shop landing page.
                    </small>
                  </div>
                  {previewTrailerEmbed?.embedUrl && (
                    <div className="studio-video-live-preview">
                      <div className="live-preview-label">
                        <PlayCircle size={13} />
                        Live Trailer Preview
                      </div>
                      {previewTrailerEmbed.isDirectVideo ? (
                        <video
                          src={previewTrailerEmbed.embedUrl}
                          controls
                          className="studio-preview-frame"
                        />
                      ) : (
                        <iframe
                          src={previewTrailerEmbed.embedUrl}
                          title="Trailer Preview"
                          className="studio-preview-frame"
                          allowFullScreen
                        />
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Digital Product Delivery File */}
              {!isCourse && (
                <section className="studio-section-card">
                  <h3>Digital File Delivery</h3>
                  <div className="form-group">
                    <label>Download File URL *</label>
                    <input
                      type="url"
                      className="input"
                      placeholder="Supabase storage URL, Google Drive, or Notion link"
                      value={activeItem.fileUrl || ""}
                      onChange={(e) =>
                        setActiveItem({ ...activeItem, fileUrl: e.target.value })
                      }
                    />
                  </div>
                  <div className="studio-upload-box">
                    <label className="btn btn-secondary btn-small">
                      <Upload size={14} />
                      {uploadingAsset ? "Uploading file…" : "Upload PDF/ZIP to Cloud"}
                      <input
                        type="file"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleDigitalAssetUpload(file);
                        }}
                        disabled={uploadingAsset}
                      />
                    </label>
                  </div>
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Format</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="PDF, ZIP, Figma"
                        value={activeItem.fileFormat || ""}
                        onChange={(e) =>
                          setActiveItem({ ...activeItem, fileFormat: e.target.value })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>File Size</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="e.g. 15.2 MB"
                        value={activeItem.fileSize || ""}
                        onChange={(e) =>
                          setActiveItem({ ...activeItem, fileSize: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Curriculum & Video Studio (Courses Only) */}
        {activeTab === "curriculum" && isCourse && (
          <div className="studio-curriculum-container">
            <div className="studio-curriculum-header">
              <div>
                <h3>Curriculum Structure</h3>
                <p>
                  Organize your course into structured modules and lessons. Add video
                  streams, downloadable files, and toggle free preview lessons for buyers.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={addModule}
              >
                <Plus size={15} />
                Add Chapter / Module
              </button>
            </div>

            <div className="studio-modules-list">
              {(activeItem.curriculum || []).map((mod, modIndex) => (
                <div key={mod.id} className="studio-module-block">
                  <div className="studio-module-top">
                    <div className="studio-module-heading">
                      <span className="studio-module-index">
                        Chapter {modIndex + 1}
                      </span>
                      <input
                        type="text"
                        className="studio-module-title-input"
                        value={mod.title}
                        onChange={(e) =>
                          updateModule(mod.id, { title: e.target.value })
                        }
                        placeholder="Module Title..."
                      />
                    </div>
                    <div className="studio-module-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => addLesson(mod.id)}
                      >
                        <Plus size={14} />
                        Add Lesson
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() => deleteModule(mod.id)}
                        title="Delete module"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    className="studio-module-desc-input"
                    value={mod.description || ""}
                    onChange={(e) =>
                      updateModule(mod.id, { description: e.target.value })
                    }
                    placeholder="Brief description of chapter objectives…"
                  />

                  {/* Lessons list */}
                  <div className="studio-lessons-sublist">
                    {(mod.lessons || []).length === 0 ? (
                      <div className="studio-empty-lessons">
                        No lessons yet. Click &quot;Add Lesson&quot; to build this chapter.
                      </div>
                    ) : (
                      mod.lessons.map((lesson, lessonIdx) => {
                        return (
                          <div key={lesson.id} className="studio-lesson-row">
                            <div className="studio-lesson-left">
                              <span className="studio-lesson-index">
                                {modIndex + 1}.{lessonIdx + 1}
                              </span>
                              <div className="studio-lesson-meta">
                                <strong>{lesson.title}</strong>
                                <div className="studio-lesson-badges">
                                  {lesson.duration && (
                                    <span className="studio-badge-pill">
                                      <Clock size={11} />
                                      {lesson.duration}
                                    </span>
                                  )}
                                  {lesson.videoUrl ? (
                                    <span className="studio-badge-pill video">
                                      <Video size={11} />
                                      Stream ready
                                    </span>
                                  ) : (
                                    <span className="studio-badge-pill warn">
                                      No video link
                                    </span>
                                  )}
                                  {lesson.isFreePreview && (
                                    <span className="studio-badge-pill preview">
                                      Free Preview
                                    </span>
                                  )}
                                  {(lesson.resources || []).length > 0 && (
                                    <span className="studio-badge-pill">
                                      <Paperclip size={11} />
                                      {lesson.resources!.length} files
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="studio-lesson-right">
                              <button
                                type="button"
                                className="btn btn-secondary btn-small"
                                onClick={() =>
                                  setSelectedLessonEdit({
                                    moduleId: mod.id,
                                    lesson: JSON.parse(JSON.stringify(lesson)),
                                  })
                                }
                              >
                                <Edit3 size={14} />
                                Edit Lesson
                              </button>
                              <button
                                type="button"
                                className="icon-btn danger"
                                onClick={() => deleteLesson(mod.id, lesson.id)}
                                title="Delete lesson"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Chapter Summary, Key Learning Points & End-of-Chapter AI Quiz Bar */}
                  <div
                    style={{
                      marginTop: "1rem",
                      padding: "1rem 1.25rem",
                      borderRadius: "12px",
                      background: mod.quiz?.enabled
                        ? "rgba(217, 119, 6, 0.08)"
                        : "rgba(255, 255, 255, 0.03)",
                      border: mod.quiz?.enabled
                        ? "1px solid rgba(217, 119, 6, 0.35)"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.85rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <label
                          className="checkbox-label"
                          style={{ fontWeight: 700, cursor: "pointer", margin: 0 }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(mod.quiz?.enabled)}
                            onChange={(e) => {
                              const enabled = e.target.checked;
                              const currentQuiz: ShopChapterQuizConfig = mod.quiz || {
                                enabled,
                                required: true,
                                retakePolicy: "unlimited",
                                maxAttempts: 3,
                                scoringMethod: "highest",
                                questions: [],
                              };
                              updateModule(mod.id, {
                                quiz: { ...currentQuiz, enabled },
                              });
                            }}
                          />
                          <Sparkles size={15} style={{ color: "#f59e0b" }} />
                          <span>End-of-Chapter Quiz</span>
                        </label>

                        <span
                          className={`studio-status-pill ${
                            mod.quiz?.enabled ? "published" : "draft"
                          }`}
                        >
                          {mod.quiz?.enabled ? "Quiz Enabled" : "Quiz Disabled"}
                        </span>

                        {mod.quiz?.questions && mod.quiz.questions.length > 0 && (
                          <span className="studio-badge-pill">
                            <HelpCircle size={11} />
                            {mod.quiz.requiredQuestionsCount &&
                            mod.quiz.requiredQuestionsCount < mod.quiz.questions.length
                              ? `${mod.quiz.requiredQuestionsCount} of ${mod.quiz.questions.length} questions required`
                              : `${mod.quiz.questions.length} questions`}
                          </span>
                        )}

                        {mod.quiz?.enabled && (
                          <span className="studio-badge-pill">
                            Retakes: {mod.quiz.retakePolicy || "unlimited"} • Score:{" "}
                            {mod.quiz.scoringMethod || "highest"}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        {(mod.quiz?.questions?.length || 0) > 0 && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => setPreviewQuizModuleId(mod.id)}
                          >
                            <Eye size={14} />
                            Preview as Student
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-primary btn-small"
                          onClick={() => setSelectedQuizModuleId(mod.id)}
                        >
                          <Sparkles size={14} />
                          {(mod.quiz?.questions?.length || 0) > 0
                            ? `Edit / AI Quiz (${mod.quiz!.questions.length})`
                            : "Generate AI Quiz"}
                        </button>
                      </div>
                    </div>

                    <div className="form-row-2" style={{ gap: "0.75rem" }}>
                      <div>
                        <label
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            opacity: 0.8,
                            display: "block",
                            marginBottom: "4px",
                          }}
                        >
                          Chapter Summary (Used by AI Quiz Generator)
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="Concise summary of what this chapter teaches..."
                          value={mod.summary || ""}
                          onChange={(e) =>
                            updateModule(mod.id, { summary: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            opacity: 0.8,
                            display: "block",
                            marginBottom: "4px",
                          }}
                        >
                          Key Learning Points (Comma-separated for AI)
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Setup workflow, API authentication, Error handling"
                          value={(mod.keyLearningPoints || []).join(", ")}
                          onChange={(e) =>
                            updateModule(mod.id, {
                              keyLearningPoints: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Lesson Editor Modal / Drawer */}
            {selectedLessonEdit && (
              <LessonEditorModal
                moduleId={selectedLessonEdit.moduleId}
                initialLesson={selectedLessonEdit.lesson}
                onClose={() => setSelectedLessonEdit(null)}
                onSave={(lesson) =>
                  saveLessonEdit(selectedLessonEdit.moduleId, lesson)
                }
              />
            )}
          </div>
        )}

        {/* Tab 3: Outcomes, Requirements & Deliverables */}
        {activeTab === "outcomes" && (
          <div className="studio-form-grid">
            <section className="studio-section-card">
              <h3>What Students Will Learn (Bullet points)</h3>
              <p className="form-help">
                Appears with checkmarks on the shop sales page.
              </p>
              <div className="studio-items-editor">
                {(activeItem.whatYouWillLearn || []).map((point, idx) => (
                  <div key={idx} className="studio-item-row">
                    <CheckCircle2 size={16} className="studio-check-icon" />
                    <input
                      type="text"
                      className="input"
                      value={point}
                      onChange={(e) => {
                        const next = [...(activeItem.whatYouWillLearn || [])];
                        next[idx] = e.target.value;
                        setActiveItem({ ...activeItem, whatYouWillLearn: next });
                      }}
                    />
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => {
                        const next = (activeItem.whatYouWillLearn || []).filter(
                          (_, i) => i !== idx,
                        );
                        setActiveItem({ ...activeItem, whatYouWillLearn: next });
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() =>
                    setActiveItem({
                      ...activeItem,
                      whatYouWillLearn: [
                        ...(activeItem.whatYouWillLearn || []),
                        "New learning outcome...",
                      ],
                    })
                  }
                >
                  <Plus size={14} /> Add outcome point
                </button>
              </div>
            </section>

            {isCourse ? (
              <section className="studio-section-card">
                <h3>Prerequisites & Target Audience</h3>
                <div className="form-group">
                  <label>Prerequisites / Requirements</label>
                  {(activeItem.requirements || []).map((req, idx) => (
                    <div key={idx} className="studio-item-row">
                      <input
                        type="text"
                        className="input"
                        value={req}
                        onChange={(e) => {
                          const next = [...(activeItem.requirements || [])];
                          next[idx] = e.target.value;
                          setActiveItem({ ...activeItem, requirements: next });
                        }}
                      />
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() => {
                          const next = (activeItem.requirements || []).filter(
                            (_, i) => i !== idx,
                          );
                          setActiveItem({ ...activeItem, requirements: next });
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() =>
                      setActiveItem({
                        ...activeItem,
                        requirements: [
                          ...(activeItem.requirements || []),
                          "Prerequisite...",
                        ],
                      })
                    }
                  >
                    <Plus size={14} /> Add requirement
                  </button>
                </div>

                <div className="form-group" style={{ marginTop: "1.5rem" }}>
                  <label>Who this course is for</label>
                  {(activeItem.targetAudience || []).map((target, idx) => (
                    <div key={idx} className="studio-item-row">
                      <input
                        type="text"
                        className="input"
                        value={target}
                        onChange={(e) => {
                          const next = [...(activeItem.targetAudience || [])];
                          next[idx] = e.target.value;
                          setActiveItem({ ...activeItem, targetAudience: next });
                        }}
                      />
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() => {
                          const next = (activeItem.targetAudience || []).filter(
                            (_, i) => i !== idx,
                          );
                          setActiveItem({ ...activeItem, targetAudience: next });
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() =>
                      setActiveItem({
                        ...activeItem,
                        targetAudience: [
                          ...(activeItem.targetAudience || []),
                          "Ideal learner profile...",
                        ],
                      })
                    }
                  >
                    <Plus size={14} /> Add target audience
                  </button>
                </div>
              </section>
            ) : (
              <section className="studio-section-card">
                <h3>Package Deliverables / What is Included</h3>
                <p className="form-help">
                  Shown on the download sales page as what buyers receive.
                </p>
                <div className="studio-items-editor">
                  {(activeItem.includes || []).map((inc, idx) => (
                    <div key={idx} className="studio-item-row">
                      <Download size={16} className="studio-check-icon" />
                      <input
                        type="text"
                        className="input"
                        value={inc}
                        onChange={(e) => {
                          const next = [...(activeItem.includes || [])];
                          next[idx] = e.target.value;
                          setActiveItem({ ...activeItem, includes: next });
                        }}
                      />
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() => {
                          const next = (activeItem.includes || []).filter(
                            (_, i) => i !== idx,
                          );
                          setActiveItem({ ...activeItem, includes: next });
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() =>
                      setActiveItem({
                        ...activeItem,
                        includes: [
                          ...(activeItem.includes || []),
                          "Included resource...",
                        ],
                      })
                    }
                  >
                    <Plus size={14} /> Add deliverable
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        {/* Tab 4: Quiz Management Dashboard (Courses Only) */}
        {activeTab === "quizzes" && isCourse && (
          <div className="studio-curriculum-container">
            <div className="studio-curriculum-header">
              <div>
                <h3>AI Quiz & Certification Management Dashboard</h3>
                <p>
                  Monitor chapter quiz configurations, question counts, retake &
                  scoring policies, average scores, and individual student
                  certification eligibility (50% minimum overall quiz score required).
                </p>
              </div>
              {activeItem.id && (
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => void fetchQuizAnalytics(activeItem.id!)}
                  disabled={loadingAnalytics}
                >
                  <RefreshCw size={14} />
                  {loadingAnalytics ? "Refreshing…" : "Refresh Student Scores"}
                </button>
              )}
            </div>

            {/* Summary KPI Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <div className="studio-section-card" style={{ padding: "1.1rem" }}>
                <span className="eyebrow">ACTIVE CHAPTER QUIZZES</span>
                <div style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "4px" }}>
                  {
                    (activeItem.curriculum || []).filter(
                      (m) => m.quiz?.enabled && (m.quiz?.questions?.length || 0) > 0,
                    ).length
                  }{" "}
                  / {(activeItem.curriculum || []).length}
                </div>
                <small className="form-help">Chapters with enabled quizzes</small>
              </div>

              <div className="studio-section-card" style={{ padding: "1.1rem" }}>
                <span className="eyebrow">TOTAL QUIZ QUESTIONS</span>
                <div style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "4px" }}>
                  {(activeItem.curriculum || []).reduce(
                    (acc, m) =>
                      acc + (m.quiz?.enabled ? m.quiz?.questions?.length || 0 : 0),
                    0,
                  )}
                </div>
                <small className="form-help">Active graded questions across course</small>
              </div>

              <div className="studio-section-card" style={{ padding: "1.1rem" }}>
                <span className="eyebrow">AVERAGE STUDENT QUIZ SCORE</span>
                <div
                  style={{
                    fontSize: "1.75rem",
                    fontWeight: 800,
                    marginTop: "4px",
                    color:
                      (quizAnalytics?.overallAveragePercentage || 0) >= 50
                        ? "#10b981"
                        : "#f59e0b",
                  }}
                >
                  {quizAnalytics ? `${quizAnalytics.overallAveragePercentage}%` : "—"}
                </div>
                <small className="form-help">
                  Across {quizAnalytics?.students?.length || 0} enrolled learners
                </small>
              </div>

              <div className="studio-section-card" style={{ padding: "1.1rem" }}>
                <span className="eyebrow">CERTIFICATE REQUIREMENT</span>
                <div style={{ fontSize: "1.35rem", fontWeight: 800, marginTop: "4px" }}>
                  ≥ 50% Overall Score
                </div>
                <small className="form-help">
                  All required lessons + required chapter quizzes
                </small>
              </div>
            </div>

            {/* Chapter Quiz Configuration Table */}
            <section className="studio-section-card" style={{ marginBottom: "1.5rem" }}>
              <h3>Chapter Quizzes Overview</h3>
              <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "13px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.1)",
                        textAlign: "left",
                      }}
                    >
                      <th style={{ padding: "10px 8px" }}>Chapter</th>
                      <th style={{ padding: "10px 8px" }}>Quiz Status</th>
                      <th style={{ padding: "10px 8px" }}>Questions</th>
                      <th style={{ padding: "10px 8px" }}>Retake & Scoring</th>
                      <th style={{ padding: "10px 8px" }}>Avg Student Score</th>
                      <th style={{ padding: "10px 8px", textAlign: "right" }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeItem.curriculum || []).map((mod, idx) => {
                      const qCount = mod.quiz?.questions?.length || 0;
                      const reqCount =
                        mod.quiz?.requiredQuestionsCount &&
                        mod.quiz.requiredQuestionsCount < qCount
                          ? mod.quiz.requiredQuestionsCount
                          : qCount;
                      const stat = quizAnalytics?.chapters?.find(
                        (c) => c.moduleId === mod.id,
                      );

                      return (
                        <tr
                          key={mod.id}
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <td style={{ padding: "12px 8px", fontWeight: 600 }}>
                            Chapter {idx + 1}: {mod.title}
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <label
                              className="checkbox-label"
                              style={{ margin: 0, cursor: "pointer" }}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(mod.quiz?.enabled)}
                                onChange={(e) => {
                                  const enabled = e.target.checked;
                                  const currentQuiz: ShopChapterQuizConfig =
                                    mod.quiz || {
                                      enabled,
                                      required: true,
                                      retakePolicy: "unlimited",
                                      maxAttempts: 3,
                                      scoringMethod: "highest",
                                      questions: [],
                                    };
                                  updateModule(mod.id, {
                                    quiz: { ...currentQuiz, enabled },
                                  });
                                }}
                              />
                              <span
                                className={`studio-status-pill ${
                                  mod.quiz?.enabled ? "published" : "draft"
                                }`}
                              >
                                {mod.quiz?.enabled ? "Enabled" : "Disabled"}
                              </span>
                            </label>
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            {reqCount} required ({qCount} total)
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <span className="studio-badge-pill">
                              {mod.quiz?.retakePolicy || "unlimited"} •{" "}
                              {mod.quiz?.scoringMethod || "highest"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            {stat && stat.studentsAttempted > 0 ? (
                              <span>
                                <strong>{stat.averagePercentage}%</strong> (
                                {stat.studentsAttempted} students • {stat.passRate}%
                                pass)
                              </span>
                            ) : (
                              <span className="text-muted">No attempts yet</span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: "12px 8px",
                              textAlign: "right",
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: "0.4rem",
                            }}
                          >
                            {qCount > 0 && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-small"
                                onClick={() => setPreviewQuizModuleId(mod.id)}
                              >
                                <Eye size={13} /> Preview
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-primary btn-small"
                              onClick={() => setSelectedQuizModuleId(mod.id)}
                            >
                              <Sparkles size={13} /> Configure / AI Quiz
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Individual Student Quiz Performance Table */}
            <section className="studio-section-card">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.75rem",
                }}
              >
                <div>
                  <h3>
                    <Users
                      size={16}
                      style={{ verticalAlign: "middle", marginRight: "6px" }}
                    />
                    Individual Student Quiz Performance & Certification Status
                  </h3>
                  <p className="form-help">
                    Tracks each student&apos;s chapter quiz scores, overall course
                    quiz percentage, and whether their certificate is unlocked (≥ 50%
                    overall + all lessons complete).
                  </p>
                </div>
              </div>

              {!activeItem.id ? (
                <p className="text-muted" style={{ padding: "1rem 0" }}>
                  Save this course first to view live student quiz performance.
                </p>
              ) : loadingAnalytics ? (
                <p className="text-muted" style={{ padding: "1rem 0" }}>
                  Loading student quiz performance…
                </p>
              ) : !quizAnalytics || quizAnalytics.students.length === 0 ? (
                <p className="text-muted" style={{ padding: "1rem 0" }}>
                  No students have started lessons or attempted quizzes in this
                  course yet.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "13px",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.1)",
                          textAlign: "left",
                        }}
                      >
                        <th style={{ padding: "10px 8px" }}>Student</th>
                        <th style={{ padding: "10px 8px" }}>Lessons</th>
                        <th style={{ padding: "10px 8px" }}>Quizzes Completed</th>
                        <th style={{ padding: "10px 8px" }}>Chapter Breakdown</th>
                        <th style={{ padding: "10px 8px" }}>Overall Quiz Score</th>
                        <th style={{ padding: "10px 8px" }}>Certificate Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quizAnalytics.students.map((st) => (
                        <tr
                          key={st.studentId}
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <td style={{ padding: "10px 8px" }}>
                            <strong>{st.studentName}</strong>
                            {st.studentEmail && (
                              <div className="text-muted" style={{ fontSize: "11px" }}>
                                {st.studentEmail}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {st.completedLessonsCount} / {st.totalLessonsCount}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {st.completedQuizzesCount} / {st.requiredQuizzesCount}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {(activeItem.curriculum || []).map((mod, mIdx) => {
                                const cScore = st.chapterScores[mod.id];
                                if (!cScore) return null;
                                return (
                                  <span
                                    key={mod.id}
                                    className="studio-badge-pill"
                                    title={`${mod.title}: ${cScore.score}/${cScore.total} (${cScore.attempts} attempts)`}
                                  >
                                    Ch.{mIdx + 1}: {cScore.score}/{cScore.total} (
                                    {cScore.percentage}%)
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td style={{ padding: "10px 8px", fontWeight: 700 }}>
                            {st.overallTotal > 0 ? (
                              <span
                                style={{
                                  color:
                                    st.overallPercentage >= 50
                                      ? "#10b981"
                                      : "#ef4444",
                                }}
                              >
                                {st.overallScore} / {st.overallTotal} (
                                {st.overallPercentage}%)
                              </span>
                            ) : (
                              <span className="text-muted">Not taken</span>
                            )}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {st.certificateUnlocked ? (
                              <span className="studio-status-pill published">
                                <Award size={12} /> Unlocked
                              </span>
                            ) : (
                              <span className="studio-status-pill draft">
                                <Lock size={12} /> Locked (&lt;50% or Incomplete)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Chapter AI Quiz Editor Modal (Accessible from Curriculum or Quiz Dashboard) */}
        {selectedQuizModuleId &&
          (activeItem.curriculum || []).find(
            (m) => m.id === selectedQuizModuleId,
          ) && (
            <ChapterQuizEditorModal
              courseTitle={activeItem.title || ""}
              module={
                (activeItem.curriculum || []).find(
                  (m) => m.id === selectedQuizModuleId,
                )!
              }
              onClose={() => setSelectedQuizModuleId(null)}
              onPreview={(updatedMod) => {
                updateModule(updatedMod.id, updatedMod);
                const modId = updatedMod.id;
                setSelectedQuizModuleId(null);
                setPreviewQuizModuleId(modId);
              }}
              onSave={(updatedMod) => {
                updateModule(updatedMod.id, updatedMod);
                setSelectedQuizModuleId(null);
              }}
            />
          )}

        {/* Student Quiz Preview Modal */}
        {previewQuizModuleId &&
          (activeItem.curriculum || []).find(
            (m) => m.id === previewQuizModuleId,
          ) && (
            <QuizStudentPreviewModal
              module={
                (activeItem.curriculum || []).find(
                  (m) => m.id === previewQuizModuleId,
                )!
              }
              onClose={() => setPreviewQuizModuleId(null)}
              onEditQuiz={() => {
                const modId = previewQuizModuleId;
                setPreviewQuizModuleId(null);
                setSelectedQuizModuleId(modId);
              }}
            />
          )}
      </div>
    );
  }

  // --- Render Catalog Overview (List View) ---
  return (
    <div className="studio-hub">
      <div className="workspace-hero">
        <div>
          <span className="eyebrow">ACADEMY STORE MANAGEMENT</span>
          <h1>Course & Digital Product Studio</h1>
          <p>
            Build professional standard courses with chapters, streaming video lessons,
            and certificates. Sell downloadable PDFs, guides, toolkits, and software assets.
          </p>
        </div>
        <div className="workspace-inline">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleCreateNew("digital_product")}
          >
            <Download size={16} />
            + New Digital Material
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleCreateNew("course")}
          >
            <BookOpen size={16} />
            + New Professional Course
          </button>
        </div>
      </div>

      <div className="studio-filter-bar">
        <div className="studio-type-pills">
          <button
            type="button"
            className={`pill ${filterType === "all" ? "active" : ""}`}
            onClick={() => setFilterType("all")}
          >
            All Products ({items.length})
          </button>
          <button
            type="button"
            className={`pill ${filterType === "course" ? "active" : ""}`}
            onClick={() => setFilterType("course")}
          >
            Courses ({items.filter((i) => i.type === "course").length})
          </button>
          <button
            type="button"
            className={`pill ${filterType === "digital_product" ? "active" : ""}`}
            onClick={() => setFilterType("digital_product")}
          >
            Materials & PDFs (
            {items.filter((i) => i.type === "digital_product").length})
          </button>
        </div>
      </div>

      <ActionMessage action={action} />

      {loading ? (
        <div className="studio-loading">Loading studio items…</div>
      ) : filteredItems.length === 0 ? (
        <div className="studio-hub-empty">
          <BookOpen size={48} className="empty-icon" />
          <h3>No items created yet</h3>
          <p>
            Start by creating your first standalone professional course or digital
            resource for students to purchase.
          </p>
          <div className="workspace-inline" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleCreateNew("course")}
            >
              Build your first course
            </button>
          </div>
        </div>
      ) : (
        <div className="studio-items-grid">
          {filteredItems.map((item) => {
            const isCourse = item.type === "course";
            const lessonCount = isCourse && Array.isArray(item.curriculum)
              ? item.curriculum.reduce(
                  (acc, m) => acc + (m.lessons?.length || 0),
                  0,
                )
              : 0;

            return (
              <div key={item.id} className="studio-item-card">
                <div className="studio-item-card-media">
                  {item.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget.parentElement?.querySelector(".studio-card-fallback");
                        if (fallback) (fallback as HTMLElement).style.display = "flex";
                      }}
                    />
                  )}
                  <div
                    className="studio-card-fallback"
                    style={{ display: item.thumbnailUrl ? "none" : "flex" }}
                  >
                    {isCourse ? <BookOpen size={30} /> : <Download size={30} />}
                  </div>
                  <div className="studio-card-badges">
                    <span
                      className={`shop-card-type-badge ${isCourse ? "course" : "product"}`}
                    >
                      {isCourse ? "Course" : "Material"}
                    </span>
                    <span
                      className={`studio-status-pill ${item.published ? "published" : "draft"}`}
                    >
                      {item.published ? "Live" : "Draft"}
                    </span>
                  </div>
                </div>

                <div className="studio-item-card-body">
                  <div className="studio-card-category">{item.category}</div>
                  <h4>{item.title}</h4>
                  <p>{item.subtitle}</p>

                  <div className="studio-card-info-row">
                    {isCourse ? (
                      <span>
                        <Layers size={13} /> {lessonCount} lessons • {item.level}
                      </span>
                    ) : (
                      <span>
                        <FileText size={13} /> {item.fileFormat || "PDF"} •{" "}
                        {item.fileSize || "Instant"}
                      </span>
                    )}
                    <span className="studio-card-sales">
                      {item.salesCount || 0} sales
                    </span>
                  </div>

                  <div className="studio-card-price-row">
                    <strong>₦{item.price.toLocaleString("en-NG")}</strong>
                    {item.compareAtPrice && item.compareAtPrice > item.price && (
                      <del>₦{item.compareAtPrice.toLocaleString("en-NG")}</del>
                    )}
                  </div>

                  <div className="studio-card-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => handleEditItem(item)}
                    >
                      <Edit3 size={14} />
                      Open Studio
                    </button>
                    {item.published && (
                      <Link
                        href={`/shop/${item.slug}`}
                        target="_blank"
                        className="btn btn-secondary btn-small icon-btn"
                        title="View Public Page"
                      >
                        <ExternalLink size={14} />
                      </Link>
                    )}
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => handleDelete(item.id, item.title)}
                      title="Delete item"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LessonEditorModal({
  moduleId,
  initialLesson,
  onClose,
  onSave,
}: {
  moduleId: string;
  initialLesson: ShopCourseLesson;
  onClose: () => void;
  onSave: (lesson: ShopCourseLesson) => void;
}) {
  const [lesson, setLesson] = useState<ShopCourseLesson>(initialLesson);
  const [newResourceTitle, setNewResourceTitle] = useState("");
  const [newResourceUrl, setNewResourceUrl] = useState("");
  const [uploadingResource, setUploadingResource] = useState(false);

  const videoEmbed = lesson.videoUrl ? getVideoEmbed(lesson.videoUrl) : null;

  const handleAddResource = () => {
    if (!newResourceTitle.trim() || !newResourceUrl.trim()) {
      alert("Please provide both a title and a valid download URL.");
      return;
    }
    const current = lesson.resources || [];
    setLesson({
      ...lesson,
      resources: [
        ...current,
        {
          title: newResourceTitle.trim(),
          url: newResourceUrl.trim(),
        },
      ],
    });
    setNewResourceTitle("");
    setNewResourceUrl("");
  };

  async function handleResourceUpload(file: File) {
    try {
      setUploadingResource(true);
      const res = await uploadFile(file);
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      const current = lesson.resources || [];
      setLesson({
        ...lesson,
        resources: [
          ...current,
          {
            title: file.name,
            url: res.url,
            size: `${sizeMb} MB`,
          },
        ],
      });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "File upload failed.");
    } finally {
      setUploadingResource(false);
    }
  }

  return (
    <div className="studio-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="studio-modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="studio-modal-header">
          <div>
            <span className="eyebrow">LESSON STUDIO EDITOR</span>
            <h3>{lesson.title || "Edit Lesson"}</h3>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="studio-modal-body">
          <div className="form-group">
            <label>Lesson Title *</label>
            <input
              type="text"
              className="input"
              value={lesson.title}
              onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
              placeholder="e.g. 02. Setting Up Cloud Storage & Next.js"
            />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Duration (e.g. 14:30)</label>
              <input
                type="text"
                className="input"
                value={lesson.duration}
                onChange={(e) =>
                  setLesson({ ...lesson, duration: e.target.value })
                }
                placeholder="12:45"
              />
            </div>
            <div className="form-group" style={{ alignSelf: "center", paddingTop: "1.2rem" }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={lesson.isFreePreview}
                  onChange={(e) =>
                    setLesson({ ...lesson, isFreePreview: e.target.checked })
                  }
                />
                <span>Allow Free Preview (Non-buyers can watch)</span>
              </label>
            </div>
          </div>

          <div className="form-group">
            <label>Universal Video Streaming URL or Embed Code *</label>
            <textarea
              className="input"
              rows={2}
              value={lesson.videoUrl}
              onChange={(e) => setLesson({ ...lesson, videoUrl: e.target.value })}
              placeholder="Paste YouTube, Vimeo, Loom, Bunny Stream, Google Drive, or direct MP4 URL"
            />
            <small className="form-help">
              Universal engine supports YouTube, Vimeo, Loom, Bunny, Google Drive, and MP4 links.
            </small>
          </div>

          {/* Real-time Video Preview */}
          {videoEmbed?.embedUrl ? (
            <div className="studio-video-live-preview">
              <div className="live-preview-label">
                <PlayCircle size={13} />
                Live Video Streaming Preview ({videoEmbed.provider})
              </div>
              {videoEmbed.isDirectVideo ? (
                <video
                  src={videoEmbed.embedUrl}
                  controls
                  className="studio-preview-frame"
                />
              ) : (
                <iframe
                  src={videoEmbed.embedUrl}
                  title="Lesson preview"
                  className="studio-preview-frame"
                  allowFullScreen
                />
              )}
            </div>
          ) : (
            <div className="studio-no-video-preview">
              <Video size={20} />
              <span>Paste a video link above to see the real-time live preview.</span>
            </div>
          )}

          <div className="form-group">
            <label>Lesson Notes, Instructions & Code (Markdown)</label>
            <textarea
              className="input"
              rows={5}
              value={lesson.content}
              onChange={(e) => setLesson({ ...lesson, content: e.target.value })}
              placeholder="Key notes, commands, instructions, or transcript for students..."
            />
          </div>

          <div className="form-group">
            <label>Downloadable Lesson Resources & Files</label>
            <div className="studio-resources-list">
              {(lesson.resources || []).map((res, rIdx) => (
                <div key={rIdx} className="studio-resource-item">
                  <Paperclip size={14} />
                  <span className="resource-title">{res.title}</span>
                  {res.size && <span className="resource-size">{res.size}</span>}
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noreferrer"
                    className="resource-link"
                  >
                    Test Link
                  </a>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => {
                      const next = (lesson.resources || []).filter(
                        (_, i) => i !== rIdx,
                      );
                      setLesson({ ...lesson, resources: next });
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div className="studio-add-resource-box">
              <div className="form-row-2">
                <input
                  type="text"
                  className="input"
                  placeholder="Resource title (e.g. Starter Code)"
                  value={newResourceTitle}
                  onChange={(e) => setNewResourceTitle(e.target.value)}
                />
                <input
                  type="url"
                  className="input"
                  placeholder="https://drive.google.com/... or GitHub link"
                  value={newResourceUrl}
                  onChange={(e) => setNewResourceUrl(e.target.value)}
                />
              </div>
              <div className="studio-resource-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={handleAddResource}
                >
                  <Plus size={14} /> Attach Link
                </button>
                <label className="btn btn-secondary btn-small">
                  <Upload size={14} />
                  {uploadingResource ? "Uploading…" : "Upload PDF/ZIP to Supabase"}
                  <input
                    type="file"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleResourceUpload(file);
                    }}
                    disabled={uploadingResource}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="studio-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSave(lesson)}
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function ChapterQuizEditorModal({
  courseTitle,
  module: initialModule,
  onClose,
  onPreview,
  onSave,
}: {
  courseTitle: string;
  module: ShopCourseModule;
  onClose: () => void;
  onPreview: (updatedModule: ShopCourseModule) => void;
  onSave: (updatedModule: ShopCourseModule) => void;
}) {
  const [summary, setSummary] = useState(initialModule.summary || "");
  const [keyPointsText, setKeyPointsText] = useState(
    (initialModule.keyLearningPoints || []).join("\n"),
  );
  const [quiz, setQuiz] = useState<ShopChapterQuizConfig>(() => {
    const existing = initialModule.quiz;
    return {
      enabled: existing ? Boolean(existing.enabled) : true,
      required: existing ? existing.required !== false : true,
      requiredQuestionsCount: existing?.requiredQuestionsCount,
      retakePolicy: existing?.retakePolicy || "unlimited",
      maxAttempts: existing?.maxAttempts || 3,
      scoringMethod: existing?.scoringMethod || "highest",
      questions: existing?.questions
        ? JSON.parse(JSON.stringify(existing.questions))
        : [],
    };
  });

  const [aiCount, setAiCount] = useState(5);
  const [aiAppendMode, setAiAppendMode] = useState<"replace" | "append">("replace");
  const [allowedTypes, setAllowedTypes] = useState<ShopQuizQuestionType[]>([
    "multiple_choice",
    "true_false",
    "multiple_answer",
    "short_answer",
  ]);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [newQuestionType, setNewQuestionType] =
    useState<ShopQuizQuestionType>("multiple_choice");

  const parsedKeyPoints = useMemo(
    () =>
      keyPointsText
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean),
    [keyPointsText],
  );

  const toggleAllowedType = (t: ShopQuizQuestionType) => {
    setAllowedTypes((prev) => {
      if (prev.includes(t)) {
        return prev.length > 1 ? prev.filter((x) => x !== t) : prev;
      }
      return [...prev, t];
    });
  };

  const handleGenerateAIQuiz = async () => {
    try {
      setGeneratingAI(true);
      const res = await api<{
        questions: ShopChapterQuizQuestion[];
        generatedSummary?: string;
        generatedKeyPoints?: string[];
      }>("shop.admin.quiz.generate", {
        courseTitle,
        chapterTitle: initialModule.title,
        chapterDescription: initialModule.description || "",
        chapterSummary: summary,
        keyLearningPoints: parsedKeyPoints,
        lessons: (initialModule.lessons || []).map((l) => ({
          title: l.title,
          content: l.content || "",
        })),
        questionCount: Math.max(1, Math.min(30, Number(aiCount) || 5)),
        allowedTypes,
      });

      if (res.generatedSummary && !summary.trim()) {
        setSummary(res.generatedSummary);
      }
      if (
        res.generatedKeyPoints &&
        res.generatedKeyPoints.length > 0 &&
        parsedKeyPoints.length === 0
      ) {
        setKeyPointsText(res.generatedKeyPoints.join("\n"));
      }

      if (Array.isArray(res.questions) && res.questions.length > 0) {
        setQuiz((prev) => ({
          ...prev,
          enabled: true,
          questions:
            aiAppendMode === "append"
              ? [...prev.questions, ...res.questions]
              : res.questions,
        }));
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to generate AI quiz.");
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleRegenerateSingleQuestion = async (qIndex: number) => {
    const targetQ = quiz.questions[qIndex];
    if (!targetQ) return;
    try {
      setRegeneratingId(targetQ.id);
      const res = await api<{
        questions: ShopChapterQuizQuestion[];
      }>("shop.admin.quiz.generate", {
        courseTitle,
        chapterTitle: initialModule.title,
        chapterDescription: initialModule.description || "",
        chapterSummary: summary,
        keyLearningPoints: parsedKeyPoints,
        lessons: (initialModule.lessons || []).map((l) => ({
          title: l.title,
          content: l.content || "",
        })),
        questionCount: 1,
        allowedTypes: [targetQ.type],
        existingQuestionToReplace: targetQ.question,
      });

      if (res.questions && res.questions[0]) {
        const replacement = { ...res.questions[0], id: targetQ.id };
        setQuiz((prev) => ({
          ...prev,
          questions: prev.questions.map((q, idx) =>
            idx === qIndex ? replacement : q,
          ),
        }));
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to regenerate question.");
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleAddCustomQuestion = () => {
    const newQ: ShopChapterQuizQuestion =
      newQuestionType === "true_false"
        ? {
            id: `quiz_q_${Date.now()}`,
            type: "true_false",
            question: "New True/False question based on this chapter...",
            options: ["True", "False"],
            correctAnswer: "True",
            correctAnswers: ["True"],
            explanation: "",
            points: 1,
          }
        : newQuestionType === "multiple_answer"
          ? {
              id: `quiz_q_${Date.now()}`,
              type: "multiple_answer",
              question:
                "Which of the following apply to this chapter? (Select all that apply)",
              options: ["Option A", "Option B", "Option C", "Option D"],
              correctAnswer: "Option A",
              correctAnswers: ["Option A", "Option B"],
              explanation: "",
              points: 1,
            }
          : newQuestionType === "short_answer"
            ? {
                id: `quiz_q_${Date.now()}`,
                type: "short_answer",
                question: "Enter the key term or command taught in this chapter:",
                options: [],
                correctAnswer: "Key Term",
                correctAnswers: ["Key Term"],
                explanation: "",
                points: 1,
              }
            : {
                id: `quiz_q_${Date.now()}`,
                type: "multiple_choice",
                question: "New multiple-choice question for this chapter...",
                options: ["Option A", "Option B", "Option C", "Option D"],
                correctAnswer: "Option A",
                correctAnswers: ["Option A"],
                explanation: "",
                points: 1,
              };

    setQuiz((prev) => ({
      ...prev,
      enabled: true,
      questions: [...prev.questions, newQ],
    }));
  };

  const updateQuestion = (
    idx: number,
    updates: Partial<ShopChapterQuizQuestion>,
  ) => {
    setQuiz((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === idx ? { ...q, ...updates } : q,
      ),
    }));
  };

  const moveQuestion = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= quiz.questions.length) return;
    setQuiz((prev) => {
      const next = [...prev.questions];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      return { ...prev, questions: next };
    });
  };

  const deleteQuestion = (idx: number) => {
    setQuiz((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx),
    }));
  };

  const buildUpdatedModule = (): ShopCourseModule => ({
    ...initialModule,
    summary: summary.trim(),
    keyLearningPoints: parsedKeyPoints,
    quiz,
  });

  return (
    <div className="studio-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="studio-modal-content"
        style={{ maxWidth: "920px", width: "95vw", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="studio-modal-header">
          <div>
            <span className="eyebrow">AI CHAPTER QUIZ & ASSESSMENT STUDIO</span>
            <h3>{initialModule.title}</h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {quiz.questions.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => onPreview(buildUpdatedModule())}
              >
                <Eye size={14} /> Preview Quiz as Student
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="studio-modal-body">
          {/* Section 1: Chapter Context & AI Generator */}
          <div
            style={{
              padding: "1.1rem",
              borderRadius: "12px",
              background: "rgba(217, 119, 6, 0.08)",
              border: "1px solid rgba(217, 119, 6, 0.3)",
              marginBottom: "1.25rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem",
                marginBottom: "0.75rem",
              }}
            >
              <strong style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Sparkles size={16} style={{ color: "#f59e0b" }} />
                1. AI Chapter Quiz Generator
              </strong>
              <span className="studio-badge-pill">
                Analyzes chapter title, summary, key points &{" "}
                {(initialModule.lessons || []).length} lessons
              </span>
            </div>

            <div className="form-row-2" style={{ marginBottom: "0.75rem" }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Chapter Summary</label>
                <textarea
                  className="input"
                  rows={2}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Summarize the core concepts taught in this chapter..."
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Key Learning Points (One per line or comma-separated)</label>
                <textarea
                  className="input"
                  rows={2}
                  value={keyPointsText}
                  onChange={(e) => setKeyPointsText(e.target.value)}
                  placeholder="Key point 1&#10;Key point 2"
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: "1rem",
                paddingTop: "0.5rem",
                borderTop: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                    Questions to Generate
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    className="input"
                    style={{ width: "90px" }}
                    value={aiCount}
                    onChange={(e) =>
                      setAiCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))
                    }
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                    Generation Mode
                  </label>
                  <select
                    className="input"
                    value={aiAppendMode}
                    onChange={(e) =>
                      setAiAppendMode(e.target.value as "replace" | "append")
                    }
                  >
                    <option value="replace">Replace current questions</option>
                    <option value="append">Append to current questions</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                    Question Types to Include
                  </label>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {(
                      [
                        ["multiple_choice", "Multiple Choice"],
                        ["true_false", "True / False"],
                        ["multiple_answer", "Multiple-Answer"],
                        ["short_answer", "Short-Answer"],
                      ] as const
                    ).map(([typeKey, label]) => (
                      <label
                        key={typeKey}
                        className="checkbox-label"
                        style={{ fontSize: "12px", margin: 0, cursor: "pointer" }}
                      >
                        <input
                          type="checkbox"
                          checked={allowedTypes.includes(typeKey)}
                          onChange={() => toggleAllowedType(typeKey)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleGenerateAIQuiz()}
                disabled={generatingAI}
              >
                <Sparkles size={15} />
                {generatingAI
                  ? "Generating Chapter Quiz…"
                  : `Generate ${aiCount} Questions with AI`}
              </button>
            </div>
          </div>

          {/* Section 2: Quiz Settings, Retake Policy & Scoring Method */}
          <div
            style={{
              padding: "1rem 1.1rem",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              marginBottom: "1.25rem",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "1.25rem",
                marginBottom: "0.85rem",
              }}
            >
              <label className="checkbox-label" style={{ fontWeight: 700, margin: 0 }}>
                <input
                  type="checkbox"
                  checked={quiz.enabled}
                  onChange={(e) => setQuiz({ ...quiz, enabled: e.target.checked })}
                />
                <span>Enable Quiz for this Chapter</span>
              </label>

              <label className="checkbox-label" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={quiz.required !== false}
                  onChange={(e) => setQuiz({ ...quiz, required: e.target.checked })}
                />
                <span>
                  Required for Course Completion & Certificate (Contributes to 50%
                  overall score)
                </span>
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "0.85rem",
              }}
            >
              <div>
                <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  Retake Policy
                </label>
                <select
                  className="input"
                  value={quiz.retakePolicy}
                  onChange={(e) =>
                    setQuiz({
                      ...quiz,
                      retakePolicy: e.target.value as ShopQuizRetakePolicy,
                    })
                  }
                >
                  <option value="unlimited">Unlimited retakes</option>
                  <option value="limited">Limited retakes</option>
                  <option value="single">Single attempt only</option>
                </select>
              </div>

              {quiz.retakePolicy === "limited" && (
                <div>
                  <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                    Max Attempts Allowed
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className="input"
                    value={quiz.maxAttempts || 3}
                    onChange={(e) =>
                      setQuiz({
                        ...quiz,
                        maxAttempts: Math.max(1, Number(e.target.value) || 2),
                      })
                    }
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  Scoring Method
                </label>
                <select
                  className="input"
                  value={quiz.scoringMethod}
                  onChange={(e) =>
                    setQuiz({
                      ...quiz,
                      scoringMethod: e.target.value as ShopQuizScoringMethod,
                    })
                  }
                >
                  <option value="highest">Highest score counts</option>
                  <option value="latest">Latest attempt counts</option>
                  <option value="average">Average score counts</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  Questions Required for Student
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, quiz.questions.length)}
                  className="input"
                  placeholder={`All (${quiz.questions.length})`}
                  value={quiz.requiredQuestionsCount || ""}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : undefined;
                    setQuiz({
                      ...quiz,
                      requiredQuestionsCount:
                        val && val > 0 ? val : undefined,
                    });
                  }}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Questions Editor List */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "0.85rem",
            }}
          >
            <strong>
              Chapter Questions ({quiz.questions.length})
            </strong>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <select
                className="input"
                style={{ width: "auto", padding: "6px 10px", fontSize: "13px" }}
                value={newQuestionType}
                onChange={(e) =>
                  setNewQuestionType(e.target.value as ShopQuizQuestionType)
                }
              >
                <option value="multiple_choice">Multiple Choice</option>
                <option value="true_false">True or False</option>
                <option value="multiple_answer">Multiple-Answer</option>
                <option value="short_answer">Short-Answer</option>
              </select>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={handleAddCustomQuestion}
              >
                <Plus size={14} /> Add Custom Question
              </button>
            </div>
          </div>

          {quiz.questions.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                borderRadius: "12px",
                border: "1px dashed rgba(255,255,255,0.15)",
              }}
            >
              <HelpCircle size={32} style={{ opacity: 0.5, marginBottom: "8px" }} />
              <p style={{ margin: "0 0 8px" }}>
                No questions in this chapter quiz yet.
              </p>
              <p className="text-muted" style={{ fontSize: "12px", margin: 0 }}>
                Click &quot;Generate Questions with AI&quot; above or &quot;Add
                Custom Question&quot; to build your assessment.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {quiz.questions.map((q, qIdx) => {
                const isRegenerating = regeneratingId === q.id;
                return (
                  <div
                    key={q.id}
                    style={{
                      padding: "1rem",
                      borderRadius: "12px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                        marginBottom: "0.65rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span className="studio-module-index">Q{qIdx + 1}</span>
                        <select
                          className="input"
                          style={{ width: "auto", padding: "4px 8px", fontSize: "12px" }}
                          value={q.type}
                          onChange={(e) => {
                            const nextType = e.target.value as ShopQuizQuestionType;
                            const nextOptions =
                              nextType === "true_false"
                                ? ["True", "False"]
                                : nextType === "short_answer"
                                  ? []
                                  : q.options && q.options.length >= 2
                                    ? q.options
                                    : ["Option A", "Option B", "Option C", "Option D"];
                            const nextCorrect =
                              nextType === "true_false"
                                ? "True"
                                : nextOptions[0] || q.correctAnswer || "";
                            updateQuestion(qIdx, {
                              type: nextType,
                              options: nextOptions,
                              correctAnswer: nextCorrect,
                              correctAnswers: [nextCorrect],
                            });
                          }}
                        >
                          <option value="multiple_choice">Multiple Choice</option>
                          <option value="true_false">True or False</option>
                          <option value="multiple_answer">Multiple-Answer</option>
                          <option value="short_answer">Short-Answer</option>
                        </select>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => void handleRegenerateSingleQuestion(qIdx)}
                          disabled={isRegenerating}
                          title="Regenerate this individual question with AI"
                        >
                          <RefreshCw size={13} />
                          {isRegenerating ? "Regenerating…" : "AI Regenerate"}
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => moveQuestion(qIdx, -1)}
                          disabled={qIdx === 0}
                          title="Move question up"
                        >
                          <ChevronUp size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => moveQuestion(qIdx, 1)}
                          disabled={qIdx === quiz.questions.length - 1}
                          title="Move question down"
                        >
                          <ChevronDown size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          onClick={() => deleteQuestion(qIdx)}
                          title="Delete question"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                      <input
                        type="text"
                        className="input"
                        value={q.question}
                        onChange={(e) =>
                          updateQuestion(qIdx, { question: e.target.value })
                        }
                        placeholder="Enter question text..."
                      />
                    </div>

                    {/* Options / Correct Answer Editor by Question Type */}
                    {q.type === "true_false" && (
                      <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem" }}>
                        {["True", "False"].map((tf) => {
                          const isSelected =
                            (q.correctAnswer || "True").toLowerCase() ===
                            tf.toLowerCase();
                          return (
                            <label
                              key={tf}
                              className="checkbox-label"
                              style={{
                                padding: "6px 14px",
                                borderRadius: "8px",
                                border: isSelected
                                  ? "1px solid #10b981"
                                  : "1px solid rgba(255,255,255,0.12)",
                                background: isSelected
                                  ? "rgba(16, 185, 129, 0.12)"
                                  : "transparent",
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="radio"
                                name={`tf_${q.id}`}
                                checked={isSelected}
                                onChange={() =>
                                  updateQuestion(qIdx, {
                                    options: ["True", "False"],
                                    correctAnswer: tf,
                                    correctAnswers: [tf],
                                  })
                                }
                              />
                              <span>{tf} (Correct Answer)</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {(q.type === "multiple_choice" || q.type === "multiple_answer") && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.45rem",
                          marginBottom: "0.75rem",
                        }}
                      >
                        <small className="form-help">
                          {q.type === "multiple_answer"
                            ? "Check all correct answer options:"
                            : "Select the radio button next to the correct answer option:"}
                        </small>
                        {(q.options || []).map((opt, optIdx) => {
                          const isCorrect =
                            q.type === "multiple_answer"
                              ? (q.correctAnswers || []).includes(opt)
                              : q.correctAnswer === opt;
                          return (
                            <div
                              key={optIdx}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                              }}
                            >
                              <input
                                type={
                                  q.type === "multiple_answer"
                                    ? "checkbox"
                                    : "radio"
                                }
                                name={`opt_${q.id}`}
                                checked={isCorrect}
                                onChange={(e) => {
                                  if (q.type === "multiple_answer") {
                                    const current = q.correctAnswers || [];
                                    const nextCorrect = e.target.checked
                                      ? Array.from(new Set([...current, opt]))
                                      : current.filter((c) => c !== opt);
                                    updateQuestion(qIdx, {
                                      correctAnswer: nextCorrect[0] || "",
                                      correctAnswers: nextCorrect,
                                    });
                                  } else {
                                    updateQuestion(qIdx, {
                                      correctAnswer: opt,
                                      correctAnswers: [opt],
                                    });
                                  }
                                }}
                                title="Mark as correct answer"
                              />
                              <input
                                type="text"
                                className="input"
                                style={{
                                  flex: 1,
                                  borderColor: isCorrect
                                    ? "rgba(16, 185, 129, 0.5)"
                                    : undefined,
                                }}
                                value={opt}
                                onChange={(e) => {
                                  const newVal = e.target.value;
                                  const nextOpts = [...(q.options || [])];
                                  const oldVal = nextOpts[optIdx];
                                  nextOpts[optIdx] = newVal;
                                  const nextCorrectAnswers = (
                                    q.correctAnswers || []
                                  ).map((c) => (c === oldVal ? newVal : c));
                                  updateQuestion(qIdx, {
                                    options: nextOpts,
                                    correctAnswer:
                                      q.correctAnswer === oldVal
                                        ? newVal
                                        : q.correctAnswer,
                                    correctAnswers: nextCorrectAnswers,
                                  });
                                }}
                              />
                              {(q.options || []).length > 2 && (
                                <button
                                  type="button"
                                  className="icon-btn danger"
                                  onClick={() => {
                                    const nextOpts = (q.options || []).filter(
                                      (_, i) => i !== optIdx,
                                    );
                                    const nextCorrect = (
                                      q.correctAnswers || []
                                    ).filter((c) => c !== opt);
                                    updateQuestion(qIdx, {
                                      options: nextOpts,
                                      correctAnswer:
                                        q.correctAnswer === opt
                                          ? nextOpts[0] || ""
                                          : q.correctAnswer,
                                      correctAnswers:
                                        nextCorrect.length > 0
                                          ? nextCorrect
                                          : nextOpts[0]
                                            ? [nextOpts[0]]
                                            : [],
                                    });
                                  }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {(q.options || []).length < 6 && (
                          <div>
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() =>
                                updateQuestion(qIdx, {
                                  options: [
                                    ...(q.options || []),
                                    `Option ${(q.options?.length || 0) + 1}`,
                                  ],
                                })
                              }
                            >
                              <Plus size={12} /> Add Option
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {q.type === "short_answer" && (
                      <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                        <label style={{ fontSize: "12px" }}>
                          Expected Correct Answer (Case-insensitive; separate acceptable
                          variations with commas)
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={
                            q.correctAnswers && q.correctAnswers.length > 0
                              ? q.correctAnswers.join(", ")
                              : q.correctAnswer || ""
                          }
                          onChange={(e) => {
                            const parts = e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            updateQuestion(qIdx, {
                              correctAnswer: parts[0] || e.target.value,
                              correctAnswers:
                                parts.length > 0 ? parts : [e.target.value],
                            });
                          }}
                          placeholder="e.g. Next.js App Router, App Router"
                        />
                      </div>
                    )}

                    <div>
                      <input
                        type="text"
                        className="input"
                        style={{ fontSize: "12px" }}
                        value={q.explanation || ""}
                        onChange={(e) =>
                          updateQuestion(qIdx, { explanation: e.target.value })
                        }
                        placeholder="Optional explanation shown to students after submitting..."
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="studio-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSave(buildUpdatedModule())}
          >
            <Check size={15} />
            Save Chapter Quiz ({quiz.questions.length} Questions)
          </button>
        </div>
      </div>
    </div>
  );
}

function QuizStudentPreviewModal({
  module,
  onClose,
  onEditQuiz,
}: {
  module: ShopCourseModule;
  onClose: () => void;
  onEditQuiz: () => void;
}) {
  const activeQuestions = useMemo(() => {
    const all = module.quiz?.questions || [];
    const req = module.quiz?.requiredQuestionsCount;
    if (typeof req === "number" && req > 0 && req < all.length) {
      return all.slice(0, req);
    }
    return all;
  }, [module.quiz]);

  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitted, setSubmitted] = useState(false);

  const previewResult = useMemo(() => {
    if (!submitted) return null;
    let correctCount = 0;
    const perQuestion = activeQuestions.map((q) => {
      const raw = answers[q.id];
      let isCorrect = false;
      if (q.type === "multiple_answer") {
        const sel = (Array.isArray(raw) ? raw : [])
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const exp = (q.correctAnswers || [q.correctAnswer || ""])
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        isCorrect =
          exp.length > 0 &&
          sel.length === exp.length &&
          exp.every((e) => sel.includes(e));
      } else {
        const text = (Array.isArray(raw) ? raw[0] || "" : raw || "")
          .trim()
          .toLowerCase();
        const acceptable = [q.correctAnswer || "", ...(q.correctAnswers || [])]
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        isCorrect =
          text.length > 0 &&
          acceptable.some(
            (a) =>
              a === text ||
              (q.type === "short_answer" && a.length >= 4 && text.includes(a)),
          );
      }
      if (isCorrect) correctCount += 1;
      return { question: q, isCorrect };
    });
    const total = activeQuestions.length;
    const incorrectCount = total - correctCount;
    const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    return {
      score: correctCount,
      total,
      correctCount,
      incorrectCount,
      percentage,
      passed: percentage >= 50,
      perQuestion,
    };
  }, [submitted, answers, activeQuestions]);

  return (
    <div className="studio-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="studio-modal-content"
        style={{ maxWidth: "760px", width: "95vw", maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="studio-modal-header">
          <div>
            <span className="eyebrow">INSTRUCTOR STUDENT PREVIEW</span>
            <h3>Quiz: {module.title}</h3>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={onEditQuiz}
            >
              <Edit3 size={14} /> Back to Quiz Editor
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="studio-modal-body">
          {previewResult && (
            <div
              style={{
                padding: "1rem 1.25rem",
                borderRadius: "12px",
                marginBottom: "1.25rem",
                background: previewResult.passed
                  ? "rgba(16, 185, 129, 0.12)"
                  : "rgba(239, 68, 68, 0.12)",
                border: previewResult.passed
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
                  gap: "0.75rem",
                }}
              >
                <div>
                  <h4 style={{ margin: 0 }}>
                    {previewResult.passed
                      ? "✅ Passed Chapter Quiz!"
                      : "❌ Did Not Pass (Minimum 50% Required)"}
                  </h4>
                  <p style={{ margin: "4px 0 0", fontSize: "13px" }}>
                    Score:{" "}
                    <strong>
                      {previewResult.score} / {previewResult.total}
                    </strong>{" "}
                    ({previewResult.percentage}%) • Correct:{" "}
                    <strong>{previewResult.correctCount}</strong> • Incorrect:{" "}
                    <strong>{previewResult.incorrectCount}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    setSubmitted(false);
                    setAnswers({});
                  }}
                >
                  Reset Preview
                </button>
              </div>
            </div>
          )}

          {activeQuestions.map((q, idx) => {
            const feedbackItem = previewResult?.perQuestion[idx];
            return (
              <div
                key={q.id}
                style={{
                  padding: "1rem",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.03)",
                  border: feedbackItem
                    ? feedbackItem.isCorrect
                      ? "1px solid rgba(16, 185, 129, 0.45)"
                      : "1px solid rgba(239, 68, 68, 0.45)"
                    : "1px solid rgba(255,255,255,0.1)",
                  marginBottom: "0.85rem",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "0.65rem" }}>
                  {idx + 1}. {q.question}
                </div>

                {(q.type === "multiple_choice" || q.type === "true_false") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {(q.options || ["True", "False"]).map((opt) => (
                      <label
                        key={opt}
                        className="checkbox-label"
                        style={{ cursor: "pointer", margin: 0 }}
                      >
                        <input
                          type="radio"
                          name={`prev_${q.id}`}
                          disabled={submitted}
                          checked={answers[q.id] === opt}
                          onChange={() =>
                            setAnswers((prev) => ({ ...prev, [q.id]: opt }))
                          }
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === "multiple_answer" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {(q.options || []).map((opt) => {
                      const curr = Array.isArray(answers[q.id])
                        ? (answers[q.id] as string[])
                        : [];
                      return (
                        <label
                          key={opt}
                          className="checkbox-label"
                          style={{ cursor: "pointer", margin: 0 }}
                        >
                          <input
                            type="checkbox"
                            disabled={submitted}
                            checked={curr.includes(opt)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...curr, opt]
                                : curr.filter((x) => x !== opt);
                              setAnswers((prev) => ({ ...prev, [q.id]: next }));
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
                    disabled={submitted}
                    placeholder="Type your short answer..."
                    value={typeof answers[q.id] === "string" ? answers[q.id] : ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                  />
                )}

                {feedbackItem && (
                  <div
                    style={{
                      marginTop: "0.65rem",
                      fontSize: "12px",
                      color: feedbackItem.isCorrect ? "#10b981" : "#f87171",
                    }}
                  >
                    {feedbackItem.isCorrect
                      ? "✓ Correct!"
                      : `✗ Incorrect — Correct Answer: ${
                          (q.correctAnswers || []).join(", ") || q.correctAnswer
                        }`}
                    {q.explanation && (
                      <div className="text-muted" style={{ marginTop: "2px" }}>
                        Explanation: {q.explanation}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="studio-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close Preview
          </button>
          {!submitted && activeQuestions.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setSubmitted(true)}
            >
              Submit Preview Attempt
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
