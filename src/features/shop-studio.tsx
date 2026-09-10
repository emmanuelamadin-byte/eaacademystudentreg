"use client";

import { useEffect, useState, useId, useMemo } from "react";
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
  Sparkles,
  ExternalLink,
  PlayCircle,
  HelpCircle,
  Clock,
  Tag,
  Lock,
  Globe,
  AlertCircle,
  Paperclip,
  CheckCircle2,
} from "lucide-react";
import { api, uploadFile } from "@/lib/api";
import { useAction } from "@/features/admin/shared";
import { getVideoEmbed } from "@/lib/video";
import type {
  ShopItem,
  ShopCourseModule,
  ShopCourseLesson,
  ShopCourseLessonResource,
} from "@/lib/types";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
  curriculum: [
    {
      id: "module-1",
      title: "Module 1: Orientation & Foundations",
      description: "Setting up your tools, workspace, and core fundamentals.",
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
  const [activeTab, setActiveTab] = useState<"info" | "curriculum" | "outcomes">("info");
  const [selectedLessonEdit, setSelectedLessonEdit] = useState<{
    moduleId: string;
    lesson: ShopCourseLesson;
  } | null>(null);

  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "course" | "digital_product">("all");

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterType !== "all" && item.type !== filterType) return false;
      return true;
    });
  }, [items, filterType]);

  const handleCreateNew = (type: "course" | "digital_product") => {
    const base = type === "course" ? { ...DEFAULT_COURSE } : { ...DEFAULT_PRODUCT };
    setActiveItem(base);
    setActiveTab("info");
    setSelectedLessonEdit(null);
  };

  const handleEditItem = (item: ShopItem) => {
    setActiveItem(JSON.parse(JSON.stringify(item)));
    setActiveTab("info");
    setSelectedLessonEdit(null);
  };

  const handleSave = async (publishNow?: boolean) => {
    if (!activeItem) return;

    if (!activeItem.title?.trim()) {
      alert("Please enter a title.");
      return;
    }

    const payload: Partial<ShopItem> = {
      ...activeItem,
      slug: activeItem.slug?.trim() || slugify(activeItem.title || "product"),
      published: publishNow !== undefined ? publishNow : !!activeItem.published,
    };

    await action.run(async () => {
      await api("shop.admin.save", { item: payload });
      await fetchItems();
      setActiveItem(null);
      setSelectedLessonEdit(null);
    }, "Shop item saved successfully!");
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
      if (activeItem) {
        setActiveItem({ ...activeItem, thumbnailUrl: res.url });
      }
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
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleSave()}
              disabled={action.busy}
            >
              Save draft
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleSave(!activeItem.published)}
              disabled={action.busy}
            >
              {activeItem.published ? "Update & Keep Live" : "Save & Publish"}
            </button>
          </div>
        </div>

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
                )}
              </section>

              <section className="studio-section-card">
                <h3>Cover Thumbnail Image</h3>
                <div className="form-group">
                  <label>Image URL</label>
                  <input
                    type="url"
                    className="input"
                    placeholder="https://..."
                    value={activeItem.thumbnailUrl || ""}
                    onChange={(e) =>
                      setActiveItem({ ...activeItem, thumbnailUrl: e.target.value })
                    }
                  />
                </div>
                <div className="studio-upload-box">
                  <label className="btn btn-secondary btn-small">
                    <Upload size={14} />
                    {uploadingThumb ? "Uploading…" : "Upload from Device"}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleThumbnailUpload(file);
                      }}
                      disabled={uploadingThumb}
                    />
                  </label>
                </div>
                {activeItem.thumbnailUrl && (
                  <div className="studio-thumbnail-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={activeItem.thumbnailUrl} alt="Thumbnail preview" />
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
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbnailUrl} alt={item.title} />
                  ) : (
                    <div className="studio-card-fallback">
                      {isCourse ? <BookOpen size={30} /> : <Download size={30} />}
                    </div>
                  )}
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
