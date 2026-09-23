"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Eye,
  MousePointerClick,
  Percent,
  Play,
  Plus,
  Radio,
  RotateCcw,
  SkipForward,
  Sparkles,
  Trash2,
  Tv,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useAcademy } from "@/components/academy-provider";
import { api } from "@/lib/api";
import { TRACKS } from "@/lib/types";
import type { VideoAd, VideoAdMediaType, VideoAdPriority } from "@/lib/types";

const DEFAULT_AD_FORM: Partial<VideoAd> = {
  title: "",
  subtitle: "",
  mediaType: "banner",
  mediaUrl: "",
  ctaText: "Learn More",
  destinationUrl: "/app/membership",
  active: true,
  priority: "normal",
  targetTracks: [],
  skipDurationSeconds: 5,
};

const MIGRATION_SQL = `-- Run this in your Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.video_ads (
  id text PRIMARY KEY,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  media_type text NOT NULL CHECK (media_type IN ('video', 'banner')),
  media_url text NOT NULL,
  cta_text text NOT NULL DEFAULT 'Learn More',
  destination_url text NOT NULL DEFAULT '/app/membership',
  active boolean NOT NULL DEFAULT true,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  target_tracks text[] NOT NULL DEFAULT '{}'::text[],
  skip_duration_seconds integer NOT NULL DEFAULT 5,
  impressions_count integer NOT NULL DEFAULT 0,
  clicks_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY video_ads_public_read ON public.video_ads
  FOR SELECT TO anon, authenticated
  USING (active = true OR (SELECT private.is_admin()));

CREATE POLICY video_ads_admin_insert ON public.video_ads
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY video_ads_admin_update ON public.video_ads
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY video_ads_admin_delete ON public.video_ads
  FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()));

GRANT SELECT ON TABLE public.video_ads TO anon, authenticated;
GRANT ALL ON TABLE public.video_ads TO service_role;`;

export default function AdStudio() {
  const { user } = useAcademy();
  const [ads, setAds] = useState<VideoAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [tableMissing, setTableMissing] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [editingAd, setEditingAd] = useState<Partial<VideoAd> | null>(null);
  const [previewAd, setPreviewAd] = useState<VideoAd | null>(null);

  const fetchAds = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api<{ ads: VideoAd[]; tableMissing?: boolean }>(
        "ad.admin.list",
        {},
      );
      setAds(res.ads || []);
      setTableMissing(Boolean(res.tableMissing));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load ads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAds();
  }, []);

  if (user?.role !== "Admin") {
    return (
      <div className="card" style={{ padding: "40px", textAlign: "center" }}>
        <h2>Administrator Access Required</h2>
        <p className="muted">
          Only the academy administrator can manage advertisements and sponsorships.
        </p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAd) return;
    try {
      setSaving(true);
      setError(null);
      await api("ad.admin.save", { ad: editingAd });
      setSuccessMessage("Ad saved successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
      setEditingAd(null);
      fetchAds();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save ad");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      await api("ad.admin.delete", { id });
      setSuccessMessage("Ad deleted.");
      setTimeout(() => setSuccessMessage(null), 3000);
      fetchAds();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete ad");
    }
  };

  const handleToggleActive = async (ad: VideoAd) => {
    try {
      await api("ad.admin.save", {
        ad: { ...ad, active: !ad.active },
      });
      fetchAds();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update ad");
    }
  };

  // Metrics
  const totalAds = ads.length;
  const activeAdsCount = ads.filter((a) => a.active).length;
  const totalImpressions = ads.reduce(
    (sum, a) => sum + (a.impressionsCount || 0),
    0,
  );
  const totalClicks = ads.reduce((sum, a) => sum + (a.clicksCount || 0), 0);
  const avgCtr =
    totalImpressions > 0
      ? ((totalClicks / totalImpressions) * 100).toFixed(1)
      : "0.0";

  return (
    <div style={{ maxWidth: "1140px", margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "28px",
        }}
      >
        <div>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 800,
              color: "#0284c7",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            MONETIZATION & SPONSORSHIPS
          </span>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 800,
              color: "#0f172a",
              margin: "4px 0",
            }}
          >
            Video Ad Studio
          </h1>
          <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>
            Manage skippable pre-roll ads, gear sponsorships, and track
            promotions for free plan learners.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setEditingAd({ ...DEFAULT_AD_FORM })}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "#0284c7",
            color: "#ffffff",
            border: "none",
            borderRadius: "10px",
            padding: "10px 20px",
            fontWeight: 700,
            fontSize: "14px",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(2, 132, 199, 0.25)",
          }}
        >
          <Plus size={18} />
          Create New Ad
        </button>
      </div>

      {/* Alerts */}
      {tableMissing && (
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "12px",
            padding: "20px 24px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 800,
                  color: "#1e40af",
                  margin: "0 0 4px",
                }}
              >
                Database Table Setup Required for Custom Ads
              </h3>
              <p style={{ fontSize: "13px", color: "#3b82f6", margin: 0 }}>
                To save and manage your own custom sponsor campaigns, run this quick SQL script in your Supabase SQL Editor.
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(MIGRATION_SQL);
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2500);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: copiedSql ? "#16a34a" : "#1d4ed8",
                  color: "#ffffff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {copiedSql ? <Check size={14} /> : <Copy size={14} />}
                {copiedSql ? "Copied SQL!" : "Copy SQL Script"}
              </button>
              <a
                href="https://supabase.com/dashboard/project/cyzpgofxanjfxmdqvned/sql/new"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "#ffffff",
                  border: "1px solid #93c5fd",
                  color: "#1d4ed8",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Open Supabase SQL Editor <ExternalLink size={13} />
              </a>
            </div>
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "#1e3a8a",
              background: "rgba(255, 255, 255, 0.7)",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid rgba(191, 219, 254, 0.6)",
            }}
          >
            💡 Note: In the meantime, your free learners automatically see the default <strong>EA Academy Premium House Ad</strong>, so video playback is working smoothly.
          </div>
        </div>
      )}

      {error && !tableMissing && (
        <div
          style={{
            background: "#fef2f2",
            color: "#b91c1c",
            border: "1px solid #fecaca",
            padding: "12px 16px",
            borderRadius: "8px",
            marginBottom: "20px",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          style={{
            background: "#f0fdf4",
            color: "#15803d",
            border: "1px solid #bbf7d0",
            padding: "12px 16px",
            borderRadius: "8px",
            marginBottom: "20px",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Check size={16} />
          {successMessage}
        </div>
      )}

      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#64748b" }}>
              Active Ads
            </span>
            <Radio size={18} color="#0284c7" />
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>
            {activeAdsCount}
            <span style={{ fontSize: "14px", fontWeight: 500, color: "#94a3b8" }}>
              {" "}
              / {totalAds} total
            </span>
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#64748b" }}>
              Total Impressions
            </span>
            <Eye size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>
            {totalImpressions.toLocaleString()}
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#64748b" }}>
              Clicks Delivered
            </span>
            <MousePointerClick size={18} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>
            {totalClicks.toLocaleString()}
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#64748b" }}>
              Click-Through Rate
            </span>
            <Percent size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>
            {avgCtr}%
          </div>
        </div>
      </div>

      {/* House Ad Info Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#ffffff",
          padding: "18px 24px",
          borderRadius: "12px",
          marginBottom: "28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              background: "rgba(56, 189, 248, 0.2)",
              padding: "10px",
              borderRadius: "10px",
              color: "#38bdf8",
            }}
          >
            <Sparkles size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#f8fafc" }}>
              Automatic House Ad Fallback Enabled
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#94a3b8",
                marginTop: "2px",
              }}
            >
              When no custom sponsor ads match a free learner, the system
              automatically promotes your <strong>Premium Membership (₦3,000/mo)</strong>.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            setPreviewAd({
              id: "house-premium",
              title: "Unlock 1-on-1 Mentorship & Ad-Free Learning",
              subtitle:
                "Join EA Academy Premium for ₦3,000/mo. Get unlimited instructor reviews, certificates, and zero interruptions.",
              mediaType: "banner",
              mediaUrl:
                "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=1200&q=80",
              ctaText: "Upgrade to Premium",
              destinationUrl: "/app/membership",
              active: true,
              priority: "normal",
              skipDurationSeconds: 5,
              createdAt: "",
              updatedAt: "",
            })
          }
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "#ffffff",
            padding: "8px 16px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Preview House Ad
        </button>
      </div>

      {/* Ads List */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2
            style={{
              fontSize: "17px",
              fontWeight: 700,
              color: "#0f172a",
              margin: 0,
            }}
          >
            Configured Ads & Sponsorships ({ads.length})
          </h2>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
            Loading ads…
          </div>
        ) : ads.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <Tv size={40} color="#94a3b8" style={{ marginBottom: "12px" }} />
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>
              No custom ads created yet
            </h3>
            <p
              style={{
                color: "#64748b",
                fontSize: "14px",
                maxWidth: "420px",
                margin: "4px auto 20px",
              }}
            >
              Your free learners currently see the default House Ad. Click below
              to add your first video sponsor or promotion!
            </p>
            <button
              type="button"
              onClick={() => setEditingAd({ ...DEFAULT_AD_FORM })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Plus size={16} /> Create First Ad
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                    color: "#64748b",
                    fontSize: "12px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  <th style={{ padding: "14px 20px" }}>Ad / Sponsor</th>
                  <th style={{ padding: "14px 16px" }}>Type</th>
                  <th style={{ padding: "14px 16px" }}>Targeting</th>
                  <th style={{ padding: "14px 16px" }}>Priority</th>
                  <th style={{ padding: "14px 16px" }}>Performance</th>
                  <th style={{ padding: "14px 16px" }}>Status</th>
                  <th style={{ padding: "14px 20px", textAlign: "right" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => (
                  <tr
                    key={ad.id}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      transition: "background 0.15s ease",
                    }}
                  >
                    <td style={{ padding: "16px 20px" }}>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <div
                          style={{
                            width: "48px",
                            height: "32px",
                            borderRadius: "6px",
                            background: "#0f172a",
                            overflow: "hidden",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {ad.mediaType === "video" ? (
                            <Play size={16} color="#38bdf8" />
                          ) : (
                            <img
                              src={ad.mediaUrl}
                              alt=""
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          )}
                        </div>
                        <div>
                          <div
                            style={{
                              fontWeight: 700,
                              color: "#0f172a",
                              lineHeight: 1.3,
                            }}
                          >
                            {ad.title}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#64748b",
                              marginTop: "2px",
                            }}
                          >
                            CTA: <strong>{ad.ctaText}</strong> →{" "}
                            <span style={{ color: "#0284c7" }}>
                              {ad.destinationUrl}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: "16px 16px" }}>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: "4px",
                          background:
                            ad.mediaType === "video" ? "#e0f2fe" : "#f1f5f9",
                          color:
                            ad.mediaType === "video" ? "#0369a1" : "#475569",
                          textTransform: "capitalize",
                        }}
                      >
                        {ad.mediaType}
                      </span>
                    </td>

                    <td style={{ padding: "16px 16px" }}>
                      {ad.targetTracks && ad.targetTracks.length > 0 ? (
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                          {ad.targetTracks.map((tid) => (
                            <span
                              key={tid}
                              style={{
                                fontSize: "11px",
                                background: "#f8fafc",
                                border: "1px solid #cbd5e1",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                color: "#334155",
                              }}
                            >
                              {TRACKS.find((t) => t.id === tid)?.short || tid}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: "13px", color: "#64748b" }}>
                          All Tracks
                        </span>
                      )}
                    </td>

                    <td style={{ padding: "16px 16px" }}>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color:
                            ad.priority === "high"
                              ? "#b45309"
                              : ad.priority === "normal"
                                ? "#0f766e"
                                : "#64748b",
                          textTransform: "capitalize",
                        }}
                      >
                        {ad.priority}
                      </span>
                    </td>

                    <td style={{ padding: "16px 16px" }}>
                      <div style={{ fontSize: "13px", color: "#0f172a" }}>
                        <strong>{(ad.impressionsCount || 0).toLocaleString()}</strong>{" "}
                        <span style={{ color: "#64748b" }}>views</span>
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#64748b",
                          marginTop: "2px",
                        }}
                      >
                        <strong>{(ad.clicksCount || 0).toLocaleString()}</strong> clicks
                        {ad.impressionsCount && ad.impressionsCount > 0 ? (
                          <span>
                            {" "}
                            (
                            {(
                              ((ad.clicksCount || 0) / ad.impressionsCount) *
                              100
                            ).toFixed(1)}
                            %)
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td style={{ padding: "16px 16px" }}>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(ad)}
                        style={{
                          background: ad.active ? "#dcfce7" : "#f1f5f9",
                          color: ad.active ? "#15803d" : "#64748b",
                          border: "none",
                          borderRadius: "20px",
                          padding: "4px 12px",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: ad.active ? "#22c55e" : "#94a3b8",
                          }}
                        />
                        {ad.active ? "Active" : "Paused"}
                      </button>
                    </td>

                    <td style={{ padding: "16px 20px", textAlign: "right" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setPreviewAd(ad)}
                          title="Preview Ad in Player"
                          style={{
                            background: "transparent",
                            border: "1px solid #cbd5e1",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            color: "#475569",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingAd({ ...ad })}
                          title="Edit Ad"
                          style={{
                            background: "#f1f5f9",
                            border: "none",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            color: "#0f172a",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ad.id, ad.title)}
                          title="Delete Ad"
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: "6px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            color: "#ef4444",
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {editingAd && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "600px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              padding: "28px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <h2
                style={{
                  fontSize: "20px",
                  fontWeight: 800,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                {editingAd.id ? "Edit Ad Campaign" : "Create New Ad Campaign"}
              </h2>
              <button
                type="button"
                onClick={() => setEditingAd(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#64748b",
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: "grid", gap: "16px" }}>
              {/* Title */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Ad Headline *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Video Editing in 30 Days"
                  value={editingAd.title || ""}
                  onChange={(e) =>
                    setEditingAd({ ...editingAd, title: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "14px",
                  }}
                />
              </div>

              {/* Subtitle */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Subtitle / Description
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Get 20% off all creative accessories and asset packs with code EA20."
                  value={editingAd.subtitle || ""}
                  onChange={(e) =>
                    setEditingAd({ ...editingAd, subtitle: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "14px",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Media Type & URL */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 2fr",
                  gap: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Media Type
                  </label>
                  <select
                    value={editingAd.mediaType || "banner"}
                    onChange={(e) =>
                      setEditingAd({
                        ...editingAd,
                        mediaType: e.target.value as VideoAdMediaType,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                      background: "#ffffff",
                    }}
                  >
                    <option value="banner">Banner Image</option>
                    <option value="video">Video (MP4)</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Media URL (HTTPS) *
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://example.com/banner.jpg"
                    value={editingAd.mediaUrl || ""}
                    onChange={(e) =>
                      setEditingAd({ ...editingAd, mediaUrl: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                    }}
                  />
                </div>
              </div>

              {/* CTA Text & Destination Link */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 2fr",
                  gap: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Button Text
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Claim Offer"
                    value={editingAd.ctaText || ""}
                    onChange={(e) =>
                      setEditingAd({ ...editingAd, ctaText: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Destination Link *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="/app/membership or https://sponsor.com"
                    value={editingAd.destinationUrl || ""}
                    onChange={(e) =>
                      setEditingAd({
                        ...editingAd,
                        destinationUrl: e.target.value,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                    }}
                  />
                </div>
              </div>

              {/* Priority & Skip Seconds */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Rotation Priority
                  </label>
                  <select
                    value={editingAd.priority || "normal"}
                    onChange={(e) =>
                      setEditingAd({
                        ...editingAd,
                        priority: e.target.value as VideoAdPriority,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                      background: "#ffffff",
                    }}
                  >
                    <option value="high">High (3x Rotation Weight)</option>
                    <option value="normal">Normal (2x Rotation Weight)</option>
                    <option value="low">Low (1x Rotation Weight)</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Skip Countdown (Seconds)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={editingAd.skipDurationSeconds ?? 5}
                    onChange={(e) =>
                      setEditingAd({
                        ...editingAd,
                        skipDurationSeconds: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                    }}
                  />
                </div>
              </div>

              {/* Track Targeting */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "8px",
                  }}
                >
                  Track Targeting (Leave blank to show on All Tracks)
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {TRACKS.map((t) => {
                    const isSelected = (editingAd.targetTracks || []).includes(
                      t.id,
                    );
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          const current = editingAd.targetTracks || [];
                          const updated = isSelected
                            ? current.filter((x) => x !== t.id)
                            : [...current, t.id];
                          setEditingAd({ ...editingAd, targetTracks: updated });
                        }}
                        style={{
                          background: isSelected ? "#0284c7" : "#f1f5f9",
                          color: isSelected ? "#ffffff" : "#334155",
                          border: "none",
                          borderRadius: "6px",
                          padding: "6px 12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {isSelected ? "✓ " : "+ "}
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px",
                  background: "#f8fafc",
                  borderRadius: "8px",
                }}
              >
                <input
                  type="checkbox"
                  id="ad-active"
                  checked={editingAd.active ?? true}
                  onChange={(e) =>
                    setEditingAd({ ...editingAd, active: e.target.checked })
                  }
                  style={{ width: "18px", height: "18px", cursor: "pointer" }}
                />
                <label
                  htmlFor="ad-active"
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#0f172a",
                    cursor: "pointer",
                  }}
                >
                  Active Campaign (Will be eligible for delivery)
                </label>
              </div>

              {/* Modal Buttons */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "12px",
                  marginTop: "8px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setEditingAd(null)}
                  style={{
                    background: "transparent",
                    border: "1px solid #cbd5e1",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#475569",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: "#0284c7",
                    border: "none",
                    padding: "10px 22px",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  {saving ? "Saving…" : "Save Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INTERACTIVE PREVIEW SIMULATOR MODAL */}
      {previewAd && (
        <PreviewSimulatorModal
          ad={previewAd}
          onClose={() => setPreviewAd(null)}
        />
      )}
    </div>
  );
}

function PreviewSimulatorModal({
  ad,
  onClose,
}: {
  ad: VideoAd;
  onClose: () => void;
}) {
  const [seconds, setSeconds] = useState(ad.skipDurationSeconds || 5);
  const [skipped, setSkipped] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    setSeconds(ad.skipDurationSeconds || 5);
    setSkipped(false);
  }, [ad]);

  useEffect(() => {
    if (skipped || seconds <= 0) return;
    const t = setInterval(() => {
      setSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [skipped, seconds]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "#0f172a",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "800px",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "#ffffff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Tv size={18} color="#38bdf8" />
            <span style={{ fontWeight: 700, fontSize: "14px" }}>
              Live Player Ad Simulator
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              onClick={() => {
                setSeconds(ad.skipDurationSeconds || 5);
                setSkipped(false);
              }}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "none",
                color: "#e2e8f0",
                fontSize: "12px",
                padding: "4px 8px",
                borderRadius: "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <RotateCcw size={13} /> Replay
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 16:9 Frame */}
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 9",
            background: "#000000",
            overflow: "hidden",
          }}
        >
          {skipped ? (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#38bdf8",
                background: "#070d18",
              }}
            >
              <Play size={48} style={{ marginBottom: "12px" }} />
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#ffffff" }}>
                Lesson Video Playing Seamlessly!
              </div>
              <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "4px" }}>
                Ad completed / skipped. Student is now watching the lesson.
              </div>
            </div>
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              {/* Media */}
              <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
                {ad.mediaType === "video" ? (
                  <video
                    src={ad.mediaUrl}
                    autoPlay
                    playsInline
                    muted={isMuted}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      backgroundImage: `linear-gradient(to top, rgba(5, 11, 20, 0.95) 0%, rgba(5, 11, 20, 0.4) 50%, rgba(5, 11, 20, 0.85) 100%), url(${ad.mediaUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                )}
              </div>

              {/* Top Banner */}
              <div
                style={{
                  position: "relative",
                  zIndex: 10,
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background:
                    "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      background: "#f59e0b",
                      color: "#000000",
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      padding: "3px 8px",
                      borderRadius: "4px",
                    }}
                  >
                    SPONSORED
                  </span>
                  <span
                    style={{
                      color: "rgba(255,255,255,0.7)",
                      fontSize: "12px",
                      fontWeight: 500,
                    }}
                  >
                    Video will play after ad
                  </span>
                </div>

                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "#38bdf8",
                    fontSize: "12px",
                    fontWeight: 600,
                    background: "rgba(15, 23, 42, 0.75)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    padding: "6px 12px",
                    borderRadius: "20px",
                  }}
                >
                  <Sparkles size={13} />
                  Go Ad-Free with Premium
                </div>
              </div>

              {/* Bottom Banner */}
              <div
                style={{
                  position: "relative",
                  zIndex: 10,
                  padding: "20px 24px",
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                  gap: "16px",
                  background:
                    "linear-gradient(to top, rgba(5,11,20,0.95) 0%, rgba(5,11,20,0.6) 60%, transparent 100%)",
                }}
              >
                <div style={{ maxWidth: "60%" }}>
                  <h3
                    style={{
                      color: "#ffffff",
                      fontSize: "18px",
                      fontWeight: 700,
                      margin: "0 0 4px",
                    }}
                  >
                    {ad.title}
                  </h3>
                  {ad.subtitle && (
                    <p
                      style={{
                        color: "rgba(255,255,255,0.8)",
                        fontSize: "13px",
                        margin: "0 0 12px",
                      }}
                    >
                      {ad.subtitle}
                    </p>
                  )}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginTop: "8px",
                    }}
                  >
                    <a
                      href={ad.destinationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "#0284c7",
                        color: "#ffffff",
                        fontSize: "13px",
                        fontWeight: 700,
                        padding: "8px 18px",
                        borderRadius: "8px",
                        textDecoration: "none",
                      }}
                    >
                      {ad.ctaText || "Learn More"}
                      <ExternalLink size={14} />
                    </a>
                    {ad.mediaType === "video" && (
                      <button
                        type="button"
                        onClick={() => setIsMuted(!isMuted)}
                        style={{
                          background: "rgba(255,255,255,0.15)",
                          border: "1px solid rgba(255,255,255,0.2)",
                          color: "#ffffff",
                          borderRadius: "50%",
                          width: "36px",
                          height: "36px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  {seconds <= 0 ? (
                    <button
                      type="button"
                      onClick={() => setSkipped(true)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        background: "rgba(255, 255, 255, 0.95)",
                        color: "#0f172a",
                        border: "none",
                        padding: "10px 22px",
                        borderRadius: "8px",
                        fontSize: "14px",
                        fontWeight: 800,
                        cursor: "pointer",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                      }}
                    >
                      Skip Ad
                      <SkipForward size={16} />
                    </button>
                  ) : (
                    <div
                      style={{
                        background: "rgba(0, 0, 0, 0.75)",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        color: "#e2e8f0",
                        padding: "8px 16px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: 600,
                      }}
                    >
                      Skip in {seconds}s
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
