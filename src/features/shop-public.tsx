"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Download,
  GraduationCap,
  Clock,
  PlayCircle,
  CheckCircle2,
  FileText,
  Tag,
  Search,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  X,
  Lock,
  Layers,
  Award,
} from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/public-site";
import { useAcademy } from "@/components/academy-provider";
import { useRecords } from "@/lib/hooks";
import { api } from "@/lib/api";
import { getVideoEmbed } from "@/lib/video";
import type { ShopItem, ShopCourseLesson } from "@/lib/types";

export function ShopCatalogPage() {
  const { data: items, loading, error } = useRecords<ShopItem>("shopItems", [
    ["published", "==", true],
  ]);

  const [activeTab, setActiveTab] = useState<"all" | "course" | "digital_product">("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        if (activeTab !== "all" && item.type !== activeTab) return false;
        if (selectedCategory !== "all" && item.category !== selectedCategory) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = item.title.toLowerCase().includes(q);
          const matchSubtitle = (item.subtitle || "").toLowerCase().includes(q);
          const matchCat = (item.category || "").toLowerCase().includes(q);
          const matchTags = (item.tags || []).some((t) => t.toLowerCase().includes(q));
          if (!matchTitle && !matchSubtitle && !matchCat && !matchTags) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
  }, [items, activeTab, selectedCategory, searchQuery]);

  return (
    <>
      <PublicHeader />
      <main className="shop-catalog-main">
        <section className="shop-hero container">
          <div className="shop-hero-badge">
            <span>EA ACADEMY STORE</span>
          </div>
          <h1 className="shop-hero-title">
            Professional Courses &<br />
            Digital Learning Resources
          </h1>
          <p className="shop-hero-desc">
            Acquire high-impact technical, AI, and digital creative capabilities.
            Explore standalone masterclasses, verified certifications, production
            toolkits, and comprehensive design & code templates.
          </p>

          <div className="shop-search-bar">
            <Search size={18} className="shop-search-icon" />
            <input
              type="text"
              placeholder="Search courses, guides, topics, or software…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="shop-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="shop-search-clear"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </section>

        <section className="container shop-filter-section">
          <div className="shop-tabs">
            <button
              type="button"
              className={`shop-tab ${activeTab === "all" ? "active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All Store Items
              <span className="shop-tab-count">{items.length}</span>
            </button>
            <button
              type="button"
              className={`shop-tab ${activeTab === "course" ? "active" : ""}`}
              onClick={() => setActiveTab("course")}
            >
              <BookOpen size={15} />
              Courses
              <span className="shop-tab-count">
                {items.filter((i) => i.type === "course").length}
              </span>
            </button>
            <button
              type="button"
              className={`shop-tab ${activeTab === "digital_product" ? "active" : ""}`}
              onClick={() => setActiveTab("digital_product")}
            >
              <Download size={15} />
              Digital Materials & PDFs
              <span className="shop-tab-count">
                {items.filter((i) => i.type === "digital_product").length}
              </span>
            </button>
          </div>

          {categories.length > 0 && (
            <div className="shop-categories-row">
              <button
                type="button"
                className={`shop-category-chip ${selectedCategory === "all" ? "active" : ""}`}
                onClick={() => setSelectedCategory("all")}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`shop-category-chip ${selectedCategory === cat ? "active" : ""}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="container shop-grid-section">
          {loading ? (
            <div className="shop-loading-grid">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className="shop-card-skeleton" />
              ))}
            </div>
          ) : error ? (
            <div className="shop-empty-state">
              <p>Unable to load products. Please check your connection and try again.</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="shop-empty-state">
              <BookOpen size={48} className="shop-empty-icon" />
              <h3>No items found</h3>
              <p>
                {searchQuery || selectedCategory !== "all" || activeTab !== "all"
                  ? "Try resetting your search query or filters to find what you need."
                  : "New courses and materials are currently being prepared. Check back shortly!"}
              </p>
              {(searchQuery || selectedCategory !== "all" || activeTab !== "all") && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setActiveTab("all");
                    setSelectedCategory("all");
                    setSearchQuery("");
                  }}
                >
                  Reset all filters
                </button>
              )}
            </div>
          ) : (
            <div className="shop-grid">
              {filteredItems.map((item) => (
                <ShopProductCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>

        <section className="shop-value-banner container">
          <div className="shop-value-grid">
            <div className="shop-value-item">
              <div className="shop-value-icon">
                <PlayCircle size={22} />
              </div>
              <div>
                <h4>Lifetime Access</h4>
                <p>Stream your courses and re-download materials anytime from your personal library.</p>
              </div>
            </div>
            <div className="shop-value-item">
              <div className="shop-value-icon">
                <Award size={22} />
              </div>
              <div>
                <h4>Verified Certificates</h4>
                <p>Earn an industry-ready credential signed by EA Academy upon course completion.</p>
              </div>
            </div>
            <div className="shop-value-item">
              <div className="shop-value-icon">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h4>Instant Delivery</h4>
                <p>Automatic unlock immediately after secure checkout with Paystack cards or transfers.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}

function ShopProductCard({ item }: { item: ShopItem }) {
  const isCourse = item.type === "course";
  const discountPercent =
    item.compareAtPrice && item.compareAtPrice > item.price
      ? Math.round(((item.compareAtPrice - item.price) / item.compareAtPrice) * 100)
      : null;

  const totalLessons = useMemo(() => {
    if (!isCourse || !Array.isArray(item.curriculum)) return 0;
    return item.curriculum.reduce((acc, mod) => acc + (mod.lessons?.length || 0), 0);
  }, [isCourse, item.curriculum]);

  return (
    <article className="shop-card">
      <Link href={`/shop/${item.slug}`} className="shop-card-image-wrap">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnailUrl}
            alt={item.title}
            className="shop-card-image"
            loading="lazy"
          />
        ) : (
          <div className="shop-card-image-fallback">
            {isCourse ? <BookOpen size={36} /> : <FileText size={36} />}
          </div>
        )}
        <div className="shop-card-badge-container">
          <span className={`shop-card-type-badge ${isCourse ? "course" : "product"}`}>
            {isCourse ? "Course" : "Digital Asset"}
          </span>
          {item.badge && <span className="shop-card-custom-badge">{item.badge}</span>}
          {discountPercent && (
            <span className="shop-card-discount-badge">{discountPercent}% OFF</span>
          )}
        </div>
      </Link>

      <div className="shop-card-content">
        <div className="shop-card-meta-top">
          <span className="shop-card-category">{item.category}</span>
          {isCourse && item.level && (
            <span className="shop-card-level">{item.level}</span>
          )}
        </div>

        <h3 className="shop-card-title">
          <Link href={`/shop/${item.slug}`}>{item.title}</Link>
        </h3>
        <p className="shop-card-subtitle">{item.subtitle}</p>

        <div className="shop-card-specs">
          {isCourse ? (
            <>
              {totalLessons > 0 && (
                <span className="shop-spec-item">
                  <PlayCircle size={14} />
                  {totalLessons} lessons
                </span>
              )}
              {item.totalDuration && (
                <span className="shop-spec-item">
                  <Clock size={14} />
                  {item.totalDuration}
                </span>
              )}
              {item.certificateEnabled && (
                <span className="shop-spec-item certificate">
                  <GraduationCap size={14} />
                  Certificate
                </span>
              )}
            </>
          ) : (
            <>
              {item.fileFormat && (
                <span className="shop-spec-item format">
                  <FileText size={14} />
                  {item.fileFormat}
                </span>
              )}
              {item.fileSize && (
                <span className="shop-spec-item">
                  <Download size={14} />
                  {item.fileSize}
                </span>
              )}
              <span className="shop-spec-item instant">
                <CheckCircle2 size={14} />
                Instant access
              </span>
            </>
          )}
        </div>

        <div className="shop-card-footer">
          <div className="shop-card-pricing">
            <span className="shop-price-current">
              ₦{item.price.toLocaleString("en-NG")}
            </span>
            {item.compareAtPrice && item.compareAtPrice > item.price && (
              <span className="shop-price-compare">
                ₦{item.compareAtPrice.toLocaleString("en-NG")}
              </span>
            )}
          </div>
          <Link href={`/shop/${item.slug}`} className="btn btn-secondary shop-card-btn">
            {isCourse ? "View course" : "View material"}
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function ShopProductDetailPage({ item }: { item: ShopItem }) {
  const { user } = useAcademy();
  const router = useRouter();
  const [buying, setBuying] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [openModuleIds, setOpenModuleIds] = useState<Record<string, boolean>>({
    [item.curriculum?.[0]?.id || ""]: true,
  });
  const [previewLesson, setPreviewLesson] = useState<ShopCourseLesson | null>(null);

  const isCourse = item.type === "course";
  const discountPercent =
    item.compareAtPrice && item.compareAtPrice > item.price
      ? Math.round(((item.compareAtPrice - item.price) / item.compareAtPrice) * 100)
      : null;

  const totalLessons = useMemo(() => {
    if (!isCourse || !Array.isArray(item.curriculum)) return 0;
    return item.curriculum.reduce((acc, mod) => acc + (mod.lessons?.length || 0), 0);
  }, [isCourse, item.curriculum]);

  const toggleModule = (id: string) => {
    setOpenModuleIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  async function handleBuyNow() {
    if (!user) {
      // Direct visitor to signup/login while remembering their intent
      const returnUrl = `/shop/${item.slug}`;
      router.push(`/signup?redirect=${encodeURIComponent(returnUrl)}&buy=${encodeURIComponent(item.id)}`);
      return;
    }

    try {
      setBuying(true);
      setCheckoutError(null);
      const res = await api<{ authorizationUrl?: string; url?: string }>("billing.checkout", {
        kind: "shop_item",
        itemId: item.id,
      });
      const targetUrl = res.authorizationUrl || res.url;
      if (targetUrl) {
        window.location.href = targetUrl;
      } else {
        throw new Error("Could not initialize Paystack checkout.");
      }
    } catch (err: unknown) {
      setBuying(false);
      setCheckoutError(err instanceof Error ? err.message : "Unable to initiate payment.");
    }
  }

  const trailerEmbed = item.previewVideoUrl ? getVideoEmbed(item.previewVideoUrl) : null;
  const previewLessonEmbed = previewLesson?.videoUrl ? getVideoEmbed(previewLesson.videoUrl) : null;

  return (
    <>
      <PublicHeader />
      <main className="shop-detail-main">
        <div className="shop-detail-breadcrumb container">
          <Link href="/shop">Shop</Link>
          <span>/</span>
          <span className="shop-detail-breadcrumb-current">{item.title}</span>
        </div>

        <div className="container shop-detail-container">
          {/* Left / Main Column */}
          <div className="shop-detail-content">
            <div className="shop-detail-header">
              <div className="shop-card-badge-container static">
                <span className={`shop-card-type-badge ${isCourse ? "course" : "product"}`}>
                  {isCourse ? "Professional Course" : "Digital Asset & Material"}
                </span>
                {item.badge && <span className="shop-card-custom-badge">{item.badge}</span>}
                <span className="shop-card-category">{item.category}</span>
              </div>

              <h1 className="shop-detail-title">{item.title}</h1>
              <p className="shop-detail-subtitle">{item.subtitle}</p>

              <div className="shop-detail-instructor-row">
                <div className="shop-instructor-avatar">EA</div>
                <div>
                  <span className="shop-instructor-name">EA Academy Production</span>
                  <span className="shop-instructor-role">Curated by Emmanuel Amadin</span>
                </div>
              </div>
            </div>

            {/* Trailer preview on mobile if present */}
            {trailerEmbed && trailerEmbed.embedUrl && (
              <div className="shop-trailer-container mobile-only">
                {trailerEmbed.isDirectVideo ? (
                  <video
                    src={trailerEmbed.embedUrl}
                    controls
                    className="shop-trailer-video"
                    poster={item.thumbnailUrl}
                  />
                ) : (
                  <iframe
                    src={trailerEmbed.embedUrl}
                    title="Course Preview Trailer"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="shop-trailer-iframe"
                  />
                )}
              </div>
            )}

            {/* What you will learn */}
            {item.whatYouWillLearn && item.whatYouWillLearn.length > 0 && (
              <section className="shop-detail-section highlight-box">
                <h2 className="shop-section-title">
                  <CheckCircle2 size={20} className="section-title-icon" />
                  What you will learn & achieve
                </h2>
                <div className="shop-outcomes-grid">
                  {item.whatYouWillLearn.map((outcome, idx) => (
                    <div key={idx} className="shop-outcome-item">
                      <CheckCircle2 size={16} className="shop-outcome-check" />
                      <span>{outcome}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Full Course Curriculum (Accordion) */}
            {isCourse && item.curriculum && item.curriculum.length > 0 && (
              <section className="shop-detail-section">
                <div className="shop-curriculum-header">
                  <div>
                    <h2 className="shop-section-title">
                      <Layers size={20} className="section-title-icon" />
                      Curriculum Structure
                    </h2>
                    <p className="shop-curriculum-summary">
                      {item.curriculum.length} modules • {totalLessons} lessons
                      {item.totalDuration ? ` • ${item.totalDuration} total duration` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => {
                      const allOpen = Object.keys(openModuleIds).length === item.curriculum!.length;
                      if (allOpen) setOpenModuleIds({});
                      else {
                        const next: Record<string, boolean> = {};
                        item.curriculum!.forEach((m) => (next[m.id] = true));
                        setOpenModuleIds(next);
                      }
                    }}
                  >
                    {Object.keys(openModuleIds).length === item.curriculum.length
                      ? "Collapse all"
                      : "Expand all"}
                  </button>
                </div>

                <div className="shop-curriculum-accordion">
                  {item.curriculum.map((mod, modIdx) => {
                    const isOpen = !!openModuleIds[mod.id];
                    return (
                      <div key={mod.id} className="shop-module-card">
                        <button
                          type="button"
                          className="shop-module-header"
                          onClick={() => toggleModule(mod.id)}
                          aria-expanded={isOpen}
                        >
                          <div className="shop-module-header-left">
                            <span className="shop-module-number">
                              Module {modIdx + 1}
                            </span>
                            <h4>{mod.title}</h4>
                          </div>
                          <div className="shop-module-header-right">
                            <span className="shop-module-count">
                              {mod.lessons?.length || 0} lessons
                            </span>
                            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </div>
                        </button>

                        {isOpen && (
                          <div className="shop-module-body">
                            {mod.description && (
                              <p className="shop-module-desc">{mod.description}</p>
                            )}
                            <div className="shop-lesson-list">
                              {(mod.lessons || []).map((lesson, lesIdx) => (
                                <div key={lesson.id} className="shop-lesson-row">
                                  <div className="shop-lesson-row-left">
                                    <span className="shop-lesson-idx">
                                      {lesIdx + 1}
                                    </span>
                                    {lesson.isFreePreview ? (
                                      <PlayCircle size={16} className="lesson-icon-preview" />
                                    ) : (
                                      <Lock size={15} className="lesson-icon-lock" />
                                    )}
                                    <span className="shop-lesson-title">
                                      {lesson.title}
                                    </span>
                                  </div>
                                  <div className="shop-lesson-row-right">
                                    {lesson.isFreePreview && lesson.videoUrl && (
                                      <button
                                        type="button"
                                        className="shop-preview-btn"
                                        onClick={() => setPreviewLesson(lesson)}
                                      >
                                        Free Preview
                                      </button>
                                    )}
                                    {lesson.duration && (
                                      <span className="shop-lesson-duration">
                                        {lesson.duration}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Digital Product Deliverables */}
            {!isCourse && item.includes && item.includes.length > 0 && (
              <section className="shop-detail-section">
                <h2 className="shop-section-title">
                  <Download size={20} className="section-title-icon" />
                  What is included in this download
                </h2>
                <div className="shop-deliverables-list">
                  {item.includes.map((deliverable, idx) => (
                    <div key={idx} className="shop-deliverable-row">
                      <FileText size={18} className="shop-deliverable-icon" />
                      <span>{deliverable}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Full Detailed Description */}
            <section className="shop-detail-section">
              <h2 className="shop-section-title">Course & Material Overview</h2>
              <div className="shop-markdown-body whitespace-pre-line">
                {item.description}
              </div>
            </section>

            {/* Requirements & Target Audience */}
            {(item.requirements?.length || item.targetAudience?.length) ? (
              <section className="shop-detail-section shop-prereqs-grid">
                {item.requirements && item.requirements.length > 0 && (
                  <div>
                    <h3 className="shop-subsection-title">Requirements & Prerequisites</h3>
                    <ul className="shop-bullet-list">
                      {item.requirements.map((req, idx) => (
                        <li key={idx}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {item.targetAudience && item.targetAudience.length > 0 && (
                  <div>
                    <h3 className="shop-subsection-title">Who this is for</h3>
                    <ul className="shop-bullet-list">
                      {item.targetAudience.map((target, idx) => (
                        <li key={idx}>{target}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ) : null}
          </div>

          {/* Right Column: Sticky Purchase Box */}
          <aside className="shop-detail-sidebar">
            <div className="shop-purchase-card">
              {/* Media Preview / Trailer */}
              {trailerEmbed && trailerEmbed.embedUrl ? (
                <div className="shop-trailer-container">
                  {trailerEmbed.isDirectVideo ? (
                    <video
                      src={trailerEmbed.embedUrl}
                      controls
                      className="shop-trailer-video"
                      poster={item.thumbnailUrl}
                    />
                  ) : (
                    <iframe
                      src={trailerEmbed.embedUrl}
                      title="Course Preview Trailer"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="shop-trailer-iframe"
                    />
                  )}
                  <div className="shop-trailer-caption">
                    <PlayCircle size={14} />
                    <span>Watch Free Preview Trailer</span>
                  </div>
                </div>
              ) : item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnailUrl}
                  alt={item.title}
                  className="shop-purchase-card-thumbnail"
                />
              ) : null}

              <div className="shop-purchase-inner">
                <div className="shop-price-wrap">
                  <div className="shop-price-main">
                    <span className="shop-price-big">
                      ₦{item.price.toLocaleString("en-NG")}
                    </span>
                    {item.compareAtPrice && item.compareAtPrice > item.price && (
                      <span className="shop-price-strike">
                        ₦{item.compareAtPrice.toLocaleString("en-NG")}
                      </span>
                    )}
                  </div>
                  {discountPercent && (
                    <span className="shop-discount-pill">
                      Save {discountPercent}%
                    </span>
                  )}
                </div>

                <p className="shop-purchase-note">
                  One-time purchase • Lifetime access to all course materials & updates.
                </p>

                {checkoutError && (
                  <div className="shop-checkout-error">
                    <p>{checkoutError}</p>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-primary shop-buy-btn"
                  onClick={handleBuyNow}
                  disabled={buying}
                >
                  {buying
                    ? "Connecting to Paystack…"
                    : user
                    ? `Buy now for ₦${item.price.toLocaleString("en-NG")}`
                    : "Enroll & Buy Now"}
                  <ArrowRight size={16} />
                </button>

                {!user && (
                  <p className="shop-account-tip">
                    Purchases are linked to your free student workspace for permanent access & certificates.
                  </p>
                )}

                <div className="shop-guarantees-list">
                  <div className="shop-guarantee-item">
                    <ShieldCheck size={16} className="guarantee-icon" />
                    <span>Instant automatic enrollment & download</span>
                  </div>
                  {isCourse && item.certificateEnabled && (
                    <div className="shop-guarantee-item">
                      <Award size={16} className="guarantee-icon" />
                      <span>Official Certificate of Completion</span>
                    </div>
                  )}
                  {isCourse ? (
                    <div className="shop-guarantee-item">
                      <PlayCircle size={16} className="guarantee-icon" />
                      <span>Universal streaming (Desktop, Tablet & Mobile)</span>
                    </div>
                  ) : (
                    <div className="shop-guarantee-item">
                      <Download size={16} className="guarantee-icon" />
                      <span>Direct file download in your library</span>
                    </div>
                  )}
                </div>

                <div className="shop-payment-badges">
                  <span>Secured by Paystack (Card, Transfer, USSD)</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Free Lesson Preview Modal */}
        {previewLesson && (
          <div
            className="shop-preview-modal-backdrop"
            onClick={() => setPreviewLesson(null)}
            role="presentation"
          >
            <div
              className="shop-preview-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="shop-preview-modal-header">
                <div>
                  <span className="eyebrow">FREE SAMPLE LESSON</span>
                  <h3>{previewLesson.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewLesson(null)}
                  className="icon-btn"
                  aria-label="Close lesson preview"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="shop-preview-modal-video">
                {previewLessonEmbed?.embedUrl ? (
                  previewLessonEmbed.isDirectVideo ? (
                    <video
                      src={previewLessonEmbed.embedUrl}
                      controls
                      autoPlay
                      className="shop-modal-player"
                    />
                  ) : (
                    <iframe
                      src={previewLessonEmbed.embedUrl}
                      title={previewLesson.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="shop-modal-player"
                    />
                  )
                ) : (
                  <div className="shop-no-video">Video preview unavailable.</div>
                )}
              </div>

              {previewLesson.content && (
                <div className="shop-preview-modal-notes">
                  <h4>Lesson Notes</h4>
                  <p className="whitespace-pre-line">{previewLesson.content}</p>
                </div>
              )}

              <div className="shop-preview-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPreviewLesson(null)}
                >
                  Close preview
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setPreviewLesson(null);
                    void handleBuyNow();
                  }}
                >
                  Get full course
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <PublicFooter />
    </>
  );
}
