"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Play,
  SkipForward,
  Zap,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAcademy } from "@/components/academy-provider";
import { getVideoEmbed } from "@/lib/video";
import type { VideoAd } from "@/lib/types";

interface AdVideoPlayerProps {
  videoUrl: string;
  title: string;
  poster?: string;
  trackId?: string;
  courseId?: string;
  className?: string;
}

const AD_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes session cooldown

export function AdVideoPlayer({
  videoUrl,
  title,
  poster,
  trackId,
  courseId,
  className = "",
}: AdVideoPlayerProps) {
  const { user } = useAcademy();
  const [ad, setAd] = useState<VideoAd | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [canSkip, setCanSkip] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isAdLoaded, setIsAdLoaded] = useState(false);
  const adVideoRef = useRef<HTMLVideoElement>(null);

  // Check and fetch ad
  useEffect(() => {
    // If no video attached, don't serve ads
    if (!videoUrl) return;

    // Staff and paying users never see ads
    const isStaff = user?.role === "Admin" || user?.role === "Instructor";
    const isPremium =
      user?.membershipPlan === "Premium" ||
      user?.premiumGranted ||
      (user?.premiumUntil && Date.parse(user.premiumUntil) > Date.now());

    if (isStaff || isPremium) {
      setShowAd(false);
      return;
    }

    // Check cooldown from sessionStorage
    try {
      const lastServed = Number(
        sessionStorage.getItem("ea_ad_last_served") || 0,
      );
      if (Date.now() - lastServed < AD_COOLDOWN_MS) {
        setShowAd(false);
        return;
      }
    } catch {
      // Ignore sessionStorage errors
    }

    let isMounted = true;

    async function checkAd() {
      try {
        const res = await api<{ hasAd: boolean; ad?: VideoAd }>("ad.serve", {
          trackId,
          courseId,
        });

        if (isMounted && res.hasAd && res.ad) {
          setAd(res.ad);
          setShowAd(true);
          const duration =
            typeof res.ad.skipDurationSeconds === "number"
              ? res.ad.skipDurationSeconds
              : 5;
          setSecondsLeft(duration);
          setCanSkip(duration <= 0);
          try {
            sessionStorage.setItem("ea_ad_last_served", String(Date.now()));
          } catch {
            // Ignore
          }
        } else if (isMounted) {
          setShowAd(false);
        }
      } catch {
        if (isMounted) setShowAd(false);
      }
    }

    checkAd();

    return () => {
      isMounted = false;
    };
  }, [user, trackId, courseId, videoUrl]);

  // Countdown timer for skipping
  useEffect(() => {
    if (!showAd || secondsLeft <= 0) {
      if (showAd && secondsLeft <= 0) setCanSkip(true);
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showAd, secondsLeft]);

  const handleSkip = () => {
    setShowAd(false);
  };

  const handleAdClick = () => {
    if (ad && ad.id) {
      api("ad.click", { id: ad.id }).catch(() => {});
    }
  };

  const { embedUrl, isDirectVideo } = getVideoEmbed(videoUrl);

  return (
    <div
      className={`ad-player-wrapper ${className}`}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 9",
        background: "#000000",
        borderRadius: "14px",
        overflow: "hidden",
      }}
    >
      {/* Underlying Lesson Video Player */}
      {videoUrl ? (
        isDirectVideo ? (
          <video
            src={embedUrl || videoUrl}
            controls={!showAd}
            className="classroom-player-element"
            poster={poster}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : embedUrl ? (
          <iframe
            src={showAd ? "about:blank" : embedUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="classroom-player-element"
            style={{
              width: "100%",
              height: "100%",
              border: 0,
              display: "block",
            }}
          />
        ) : (
          <div className="classroom-no-video">
            <Play size={44} />
            <p>Unable to embed this video.</p>
          </div>
        )
      ) : (
        <div className="classroom-no-video">
          <Play size={44} />
          <p>No video attached to this lesson.</p>
        </div>
      )}

      {/* Skippable Pre-Roll Ad Overlay */}
      {showAd && ad && (
        <div
          className="ad-overlay"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 30,
            background: "#050b14",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            overflow: "hidden",
          }}
        >
          {/* Ad Media (Video or Banner) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              pointerEvents: "none",
            }}
          >
            {ad.mediaType === "video" ? (
              <video
                ref={adVideoRef}
                src={ad.mediaUrl}
                autoPlay
                playsInline
                muted={isMuted}
                onLoadedData={() => setIsAdLoaded(true)}
                onError={() => handleSkip()}
                onEnded={() => handleSkip()}
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

          {/* Top Bar: Sponsor Label + Remove Ads Link */}
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
                  textTransform: "uppercase",
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

            <Link
              href="/app/membership"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                color: "#38bdf8",
                fontSize: "12px",
                fontWeight: 600,
                textDecoration: "none",
                background: "rgba(15, 23, 42, 0.75)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                padding: "6px 12px",
                borderRadius: "20px",
                backdropFilter: "blur(4px)",
              }}
            >
              <Zap size={13} />
              Go Ad-Free with Premium
            </Link>
          </div>

          {/* Bottom Bar: Ad Info, CTA & Skip Button */}
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
            {/* Left: Headline & Call To Action */}
            <div style={{ maxWidth: "60%" }}>
              <h3
                style={{
                  color: "#ffffff",
                  fontSize: "18px",
                  fontWeight: 700,
                  margin: "0 0 4px",
                  textShadow: "0 2px 4px rgba(0,0,0,0.6)",
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
                    lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
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
                  target={
                    ad.destinationUrl.startsWith("/") ? "_self" : "_blank"
                  }
                  rel="noopener noreferrer"
                  onClick={handleAdClick}
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
                    boxShadow: "0 4px 12px rgba(2, 132, 199, 0.4)",
                  }}
                >
                  {ad.ctaText || "Learn More"}
                  <ExternalLink size={14} />
                </a>

                {/* Sound unmute toggle for video ads */}
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
                    title={isMuted ? "Unmute audio" : "Mute audio"}
                  >
                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                )}
              </div>
            </div>

            {/* Right: Skip Countdown & Button */}
            <div style={{ display: "flex", alignItems: "center" }}>
              {canSkip ? (
                <button
                  type="button"
                  onClick={handleSkip}
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
                    transition: "all 0.2s ease",
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
                    backdropFilter: "blur(4px)",
                  }}
                >
                  Skip in {secondsLeft}s
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
