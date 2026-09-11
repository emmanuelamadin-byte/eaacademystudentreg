"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Download,
  GraduationCap,
  PlayCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Award,
  ArrowRight,
  FileText,
  ShoppingBag,
} from "lucide-react";
import { useAcademy } from "@/components/academy-provider";
import { api } from "@/lib/api";
import type {
  ShopItem,
  ShopPurchase,
  ShopCourseProgress,
} from "@/lib/types";

interface LibraryCourseItem {
  purchase: ShopPurchase;
  item: ShopItem | null;
  progress: ShopCourseProgress | null;
  totalLessons: number;
  completedCount: number;
  percent: number;
}

interface LibraryProductItem {
  purchase: ShopPurchase;
  item: ShopItem | null;
}

interface LibraryData {
  courses: LibraryCourseItem[];
  digitalProducts: LibraryProductItem[];
}

export function StudentLibrary() {
  const { user } = useAcademy();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref =
    searchParams.get("ref") ||
    searchParams.get("reference") ||
    searchParams.get("trxref");
  const verifiedRef = useRef<string | null>(null);

  const [data, setData] = useState<LibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchaseNotice, setPurchaseNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "courses" | "products">("all");

  const fetchLibrary = async () => {
    try {
      setLoading(true);
      const res = await api<LibraryData>("shop.library");
      setData(res);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load your library.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLibrary();
  }, []);

  useEffect(() => {
    if (!ref || !user || verifiedRef.current === ref) return;
    verifiedRef.current = ref;
    setPurchaseNotice("Confirming your purchase with Paystack…");
    api("billing.verify", { reference: ref })
      .then(() => {
        setPurchaseNotice("Purchase confirmed! Your item is now available in your library.");
        if (typeof window !== "undefined" && window.history?.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        return fetchLibrary();
      })
      .catch((err) => {
        setPurchaseNotice(null);
        setError(err instanceof Error ? err.message : "Unable to verify purchase.");
      });
  }, [ref, user]);

  const totalCourses = data?.courses.length || 0;
  const totalProducts = data?.digitalProducts.length || 0;
  const completedCourses =
    data?.courses.filter((c) => c.percent === 100 || c.progress?.completed).length || 0;

  return (
    <div className="library-page">
      <div className="workspace-hero">
        <div>
          <span className="eyebrow">PURCHASED ASSETS & COURSES</span>
          <h1>My Digital Library</h1>
          <p>
            Access your permanent standalone masterclasses, streaming classroom players,
            verified completion certificates, and downloadable digital assets.
          </p>
        </div>
        <div className="workspace-inline">
          <Link
            href="/shop"
            scroll={true}
            onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
            className="btn btn-secondary"
          >
            <ShoppingBag size={16} />
            Browse Shop
          </Link>
        </div>
      </div>

      {purchaseNotice && (
        <div className="alert alert-success" role="status" style={{ marginBottom: "1.5rem" }}>
          {purchaseNotice}
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: "1.5rem" }}>
          {error}
        </div>
      )}

      {/* Stats row */}
      <div className="library-stats-grid">
        <div className="library-stat-card">
          <div className="stat-icon courses">
            <BookOpen size={20} />
          </div>
          <div>
            <span className="stat-number">{totalCourses}</span>
            <span className="stat-label">Enrolled Courses</span>
          </div>
        </div>
        <div className="library-stat-card">
          <div className="stat-icon products">
            <Download size={20} />
          </div>
          <div>
            <span className="stat-number">{totalProducts}</span>
            <span className="stat-label">Digital Downloads</span>
          </div>
        </div>
        <div className="library-stat-card">
          <div className="stat-icon certificates">
            <Award size={20} />
          </div>
          <div>
            <span className="stat-number">{completedCourses}</span>
            <span className="stat-label">Certificates Earned</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="library-tabs-row">
        <div className="library-tabs">
          <button
            type="button"
            className={`pill ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All Items ({totalCourses + totalProducts})
          </button>
          <button
            type="button"
            className={`pill ${activeTab === "courses" ? "active" : ""}`}
            onClick={() => setActiveTab("courses")}
          >
            My Courses ({totalCourses})
          </button>
          <button
            type="button"
            className={`pill ${activeTab === "products" ? "active" : ""}`}
            onClick={() => setActiveTab("products")}
          >
            Digital Downloads ({totalProducts})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="library-loading">Loading your library…</div>
      ) : error ? (
        <div className="library-empty">
          <p>{error}</p>
        </div>
      ) : totalCourses === 0 && totalProducts === 0 ? (
        <div className="library-empty">
          <ShoppingBag size={48} className="empty-icon" />
          <h3>Your library is empty</h3>
          <p>
            You have not purchased any standalone courses or digital products yet.
            Visit our shop to explore masterclasses, templates, and downloadable guides.
          </p>
          <Link
            href="/shop"
            scroll={true}
            onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
            className="btn btn-primary"
            style={{ marginTop: "1rem" }}
          >
            Explore Academy Shop
            <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <div className="library-content-container">
          {/* Purchased Courses Section */}
          {(activeTab === "all" || activeTab === "courses") && totalCourses > 0 && (
            <div className="library-section">
              <h3 className="library-section-title">
                <BookOpen size={18} />
                My Enrolled Courses ({totalCourses})
              </h3>
              <div className="library-grid">
                {data!.courses.map(({ purchase, item, progress, totalLessons, completedCount, percent }) => {
                  const title = item?.title || purchase.itemTitle || "Course";
                  const thumb = item?.thumbnailUrl;
                  const isCompleted = percent === 100 || progress?.completed;

                  return (
                    <div key={purchase.id} className="library-course-card">
                      <div className="library-card-thumb-wrap">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt={title} className="library-card-thumb" />
                        ) : (
                          <div className="library-card-fallback">
                            <BookOpen size={36} />
                          </div>
                        )}
                        <span className="library-card-badge">
                          {isCompleted ? "Completed" : `${percent}% complete`}
                        </span>
                      </div>

                      <div className="library-card-body">
                        <span className="library-card-category">
                          {item?.category || "Professional Course"}
                        </span>
                        <h4 className="library-card-title">{title}</h4>

                        {/* Progress bar */}
                        <div className="library-progress-container">
                          <div className="library-progress-bar">
                            <div
                              className="library-progress-fill"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <div className="library-progress-labels">
                            <span>
                              {completedCount} of {totalLessons} lessons completed
                            </span>
                            <span>{percent}%</span>
                          </div>
                        </div>

                        <div className="library-card-actions">
                          <Link
                            href={`/app/learn-course/${purchase.itemId}`}
                            className="btn btn-primary btn-small library-resume-btn"
                          >
                            <PlayCircle size={15} />
                            {completedCount === 0
                              ? "Start Course"
                              : isCompleted
                              ? "Revisit Classroom"
                              : "Resume Learning"}
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Purchased Digital Materials Section */}
          {(activeTab === "all" || activeTab === "products") && totalProducts > 0 && (
            <div className="library-section">
              <h3 className="library-section-title">
                <Download size={18} />
                My Digital Products & Downloads ({totalProducts})
              </h3>
              <div className="library-grid">
                {data!.digitalProducts.map(({ purchase, item }) => {
                  const title = item?.title || purchase.itemTitle || "Digital Product";
                  const thumb = item?.thumbnailUrl;
                  const fileUrl = item?.fileUrl;
                  const fileFormat = item?.fileFormat || "PDF";
                  const fileSize = item?.fileSize;

                  return (
                    <div key={purchase.id} className="library-product-card">
                      <div className="library-card-thumb-wrap product">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt={title} className="library-card-thumb" />
                        ) : (
                          <div className="library-card-fallback product">
                            <FileText size={36} />
                          </div>
                        )}
                        <span className="library-card-badge format">
                          {fileFormat}
                        </span>
                      </div>

                      <div className="library-card-body">
                        <span className="library-card-category">
                          {item?.category || "Digital Download"}
                        </span>
                        <h4 className="library-card-title">{title}</h4>
                        <p className="library-card-subtitle">
                          {item?.subtitle || "Digital material & reference package."}
                        </p>

                        <div className="library-product-specs">
                          {fileSize && (
                            <span className="library-spec-tag">
                              Size: {fileSize}
                            </span>
                          )}
                          <span className="library-spec-tag">
                            Purchased:{" "}
                            {new Date(purchase.purchasedAt).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="library-card-actions">
                          {fileUrl ? (
                            <a
                              href={fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              download
                              className="btn btn-secondary btn-small library-download-btn"
                            >
                              <Download size={15} />
                              Download {fileFormat}
                            </a>
                          ) : (
                            <span className="library-no-link">
                              Link updating. Check back shortly.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
