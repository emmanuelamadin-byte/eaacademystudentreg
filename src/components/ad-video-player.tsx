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

  // Robust countdown timer for skipping
  useEffect(() => {
    if (!showAd) return;

    const duration =
      typeof ad?.skipDurationSeconds === "number"
        ? ad.skipDurationSeconds
        : 5;

    if (duration <= 0) {
      setSecondsLeft(0);
      setCanSkip(true);
      return;
    }

    setSecondsLeft(duration);
    setCanSkip(false);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, duration - elapsed);
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        setCanSkip(true);
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [showAd, ad?.id, ad?.skipDurationSeconds]);

  // Ensure video playback starts properly on mobile browsers
  useEffect(() => {
    if (showAd && adVideoRef.current && ad?.mediaType === "video") {
      adVideoRef.current.defaultMuted = true;
      adVideoRef.current.muted = isMuted;
      adVideoRef.current.play().catch(() => {
        // Autoplay may be restricted by mobile browser policy
      });
    }
  }, [showAd, isMuted, ad?.mediaType, ad?.mediaUrl]);

  const handleSkip = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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
        <div className="ad-overlay">
          {/* Ad Media (Video or Banner) */}
          <div className="ad-media-layer">
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
              />
            ) : (
              <div
                className="ad-banner-bg"
                style={{
                  backgroundImage: `linear-gradient(to top, rgba(5, 11, 20, 0.95) 0%, rgba(5, 11, 20, 0.4) 50%, rgba(5, 11, 20, 0.85) 100%), url(${ad.mediaUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            )}
          </div>

          {/* Top Bar: Sponsor Label + Remove Ads Link */}
          <div className="ad-top-bar">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
              <span className="ad-badge-sponsored">SPONSORED</span>
              <span className="ad-top-hint">Video will play after ad</span>
            </div>

            <Link
              href="/app/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="ad-premium-link"
            >
              <Zap size={13} style={{ flexShrink: 0 }} />
              <span className="ad-premium-label-full">Go Ad-Free with Premium</span>
              <span className="ad-premium-label-short">Go Ad-Free</span>
            </Link>
          </div>

          {/* Bottom Bar: Ad Info & CTA (Leaves space on right for skip button) */}
          <div className="ad-info-bar">
            <div className="ad-info-content">
              <h3 className="ad-title">{ad.title}</h3>
              {ad.subtitle && (
                <p className="ad-subtitle">{ad.subtitle}</p>
              )}

              <div className="ad-actions-row">
                <a
                  href={ad.destinationUrl}
                  target={
                    ad.destinationUrl.startsWith("/") ? "_self" : "_blank"
                  }
                  rel="noopener noreferrer"
                  onClick={handleAdClick}
                  className="ad-cta-btn"
                >
                  {ad.ctaText || "Learn More"}
                  <ExternalLink size={13} />
                </a>

                {/* Sound unmute toggle for video ads */}
                {ad.mediaType === "video" && (
                  <button
                    type="button"
                    onClick={() => setIsMuted(!isMuted)}
                    className="ad-mute-btn"
                    title={isMuted ? "Unmute audio" : "Mute audio"}
                    aria-label={isMuted ? "Unmute audio" : "Mute audio"}
                  >
                    {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Dedicated Absolute Skip Button / Countdown Slot (Always visible on mobile & desktop) */}
          <div className="ad-skip-slot">
            {canSkip ? (
              <button
                type="button"
                onClick={handleSkip}
                className="ad-skip-btn"
              >
                Skip Ad
                <SkipForward size={14} />
              </button>
            ) : (
              <div className="ad-countdown-pill">
                Skip in {secondsLeft}s
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
