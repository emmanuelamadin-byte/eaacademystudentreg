"use client";

import { useEffect, useId, useRef, useState } from "react";
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
import {
  buildAdEmbedUrl,
  getVideoEmbed,
  getYouTubeThumbnailUrl,
  isKnownVideoUrl,
} from "@/lib/video";
import type { VideoAd } from "@/lib/types";

interface AdVideoPlayerProps {
  videoUrl: string;
  title: string;
  poster?: string;
  trackId?: string;
  courseId?: string;
  className?: string;
}

function withLessonAutoplay(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("autoplay", "1");
    parsed.searchParams.set("playsinline", "1");
    return parsed.toString();
  } catch {
    return url;
  }
}

export function AdVideoPlayer({
  videoUrl,
  title,
  poster,
  trackId,
  courseId,
  className = "",
}: AdVideoPlayerProps) {
  const { user } = useAcademy();
  const playerId = useId();
  const [ad, setAd] = useState<VideoAd | null>(null);
  const [adPhase, setAdPhase] = useState<
    "checking" | "ready" | "playing" | "done"
  >("checking");
  const [hadAd, setHadAd] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [canSkip, setCanSkip] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [, setIsAdLoaded] = useState(false);
  const adVideoRef = useRef<HTMLVideoElement>(null);
  const adIframeRef = useRef<HTMLIFrameElement>(null);
  const lessonVideoRef = useRef<HTMLVideoElement>(null);

  const showAd = adPhase === "playing";
  const isWaitingToStart = adPhase === "checking" || adPhase === "ready";

  const adEmbed = ad ? getVideoEmbed(ad.mediaUrl) : null;
  const isVideoAd = Boolean(
    ad && (ad.mediaType === "video" || isKnownVideoUrl(ad.mediaUrl)),
  );
  const isEmbeddedVideoAd = Boolean(
    isVideoAd && adEmbed && !adEmbed.isDirectVideo && adEmbed.embedUrl,
  );

  // Check and fetch ad whenever the lesson video changes
  useEffect(() => {
    try {
      sessionStorage.removeItem("ea_ad_last_served");
    } catch {
      // Ignore sessionStorage errors
    }

    if (!videoUrl) {
      setAd(null);
      setHadAd(false);
      setAdPhase("done");
      return;
    }

    // Staff and paying users never see ads
    const isStaff = user?.role === "Admin" || user?.role === "Instructor";
    const isPremium =
      user?.membershipPlan === "Premium" ||
      user?.premiumGranted ||
      (user?.premiumUntil && Date.parse(user.premiumUntil) > Date.now());

    if (isStaff || isPremium) {
      setAd(null);
      setHadAd(false);
      setAdPhase("done");
      return;
    }

    let isMounted = true;
    setAdPhase("checking");
    setHadAd(false);

    async function checkAd() {
      try {
        const res = await api<{ hasAd: boolean; ad?: VideoAd }>("ad.serve", {
          trackId,
          courseId,
        });

        if (isMounted && res.hasAd && res.ad) {
          setAd(res.ad);
          setIsMuted(true);
          const duration =
            typeof res.ad.skipDurationSeconds === "number"
              ? res.ad.skipDurationSeconds
              : 5;
          setSecondsLeft(duration);
          setCanSkip(duration <= 0);
          // Wait for the user to click Play on this specific video before starting the ad
          setAdPhase("ready");
        } else if (isMounted) {
          setAd(null);
          setAdPhase("done");
        }
      } catch {
        if (isMounted) {
          setAd(null);
          setAdPhase("done");
        }
      }
    }

    void checkAd();

    return () => {
      isMounted = false;
    };
  }, [user, trackId, courseId, videoUrl, title]);

  // Robust countdown timer — only runs while THIS video's ad is actively playing
  useEffect(() => {
    if (adPhase !== "playing") return;

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
  }, [adPhase, ad?.id, ad?.skipDurationSeconds]);

  // Ensure direct HTML5 ad video playback starts properly when adPhase === "playing"
  useEffect(() => {
    if (
      adPhase === "playing" &&
      adVideoRef.current &&
      isVideoAd &&
      !isEmbeddedVideoAd
    ) {
      adVideoRef.current.defaultMuted = true;
      adVideoRef.current.muted = isMuted;
      adVideoRef.current.play().catch(() => {
        // Autoplay may be restricted by mobile browser policy
      });
    }
  }, [adPhase, isMuted, isVideoAd, isEmbeddedVideoAd, ad?.mediaUrl]);

  // Auto-play direct HTML5 lesson video once the pre-roll ad finishes or is skipped
  useEffect(() => {
    if (adPhase === "done" && hadAd && lessonVideoRef.current) {
      lessonVideoRef.current.play().catch(() => {
        // Ignore if browser requires manual play
      });
    }
  }, [adPhase, hadAd]);

  // Sync mute/unmute state with embedded YouTube / Vimeo iframe via postMessage
  useEffect(() => {
    if (
      adPhase !== "playing" ||
      !isEmbeddedVideoAd ||
      !adIframeRef.current?.contentWindow
    ) {
      return;
    }
    const win = adIframeRef.current.contentWindow;
    try {
      if (adEmbed?.provider === "youtube") {
        win.postMessage(
          JSON.stringify({
            event: "command",
            func: isMuted ? "mute" : "unMute",
            args: [],
          }),
          "*",
        );
        if (!isMuted) {
          win.postMessage(
            JSON.stringify({
              event: "command",
              func: "setVolume",
              args: [100],
            }),
            "*",
          );
          win.postMessage(
            JSON.stringify({
              event: "command",
              func: "playVideo",
              args: [],
            }),
            "*",
          );
        }
      } else if (adEmbed?.provider === "vimeo") {
        win.postMessage(
          JSON.stringify({
            method: "setMuted",
            value: isMuted,
          }),
          "*",
        );
        if (!isMuted) {
          win.postMessage(
            JSON.stringify({
              method: "setVolume",
              value: 1,
            }),
            "*",
          );
        }
      }
    } catch {
      // Ignore cross-origin errors
    }
  }, [adPhase, isMuted, isEmbeddedVideoAd, adEmbed?.provider]);

  // Listen for YouTube / Vimeo completion events ONLY from this player's iframe
  useEffect(() => {
    if (adPhase !== "playing" || !isEmbeddedVideoAd) return;

    const handleMessage = (event: MessageEvent) => {
      // Strictly ensure the message came from THIS specific ad player's iframe
      if (
        !adIframeRef.current?.contentWindow ||
        event.source !== adIframeRef.current.contentWindow
      ) {
        return;
      }
      if (!event.data) return;
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (
          (data?.event === "infoDelivery" && data?.info?.playerState === 0) ||
          (data?.event === "onStateChange" && data?.info === 0) ||
          data?.event === "ended" ||
          data?.event === "finish"
        ) {
          setAdPhase("done");
        }
      } catch {
        // Ignore non-JSON postMessages
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [adPhase, isEmbeddedVideoAd]);

  const handleStartVideo = () => {
    if (ad) {
      setHadAd(true);
      setAdPhase("playing");
    } else {
      setAdPhase("done");
    }
  };

  const handleSkip = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setAdPhase("done");
  };

  const handleAdClick = () => {
    if (ad && ad.id) {
      api("ad.click", { id: ad.id }).catch(() => {});
    }
  };

  const { embedUrl, isDirectVideo } = getVideoEmbed(videoUrl);
  const coverImage = poster || getYouTubeThumbnailUrl(videoUrl) || "";
  const activeLessonEmbedUrl =
    hadAd && embedUrl ? withLessonAutoplay(embedUrl) : embedUrl;

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
            ref={lessonVideoRef}
            src={embedUrl || videoUrl}
            controls={adPhase === "done"}
            className="classroom-player-element"
            poster={poster}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : embedUrl ? (
          <iframe
            src={adPhase === "done" ? activeLessonEmbedUrl : "about:blank"}
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

      {/* Ready-to-Play Gate: Ensures each video only starts its ad when the user clicks to watch it */}
      {videoUrl && isWaitingToStart && (
        <button
          type="button"
          onClick={handleStartVideo}
          disabled={adPhase === "checking"}
          aria-label={`Play ${title || "video"}`}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 25,
            width: "100%",
            height: "100%",
            border: "none",
            padding: 0,
            cursor: adPhase === "checking" ? "wait" : "pointer",
            background: coverImage
              ? `linear-gradient(to top, rgba(5, 11, 20, 0.88) 0%, rgba(5, 11, 20, 0.35) 50%, rgba(5, 11, 20, 0.65) 100%), url(${coverImage}) center / cover no-repeat`
              : "radial-gradient(circle at center, #1e293b 0%, #050b14 100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            color: "#ffffff",
          }}
        >
          <div
            style={{
              width: "68px",
              height: "68px",
              borderRadius: "50%",
              background: "rgba(2, 132, 199, 0.95)",
              boxShadow: "0 8px 28px rgba(2, 132, 199, 0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid rgba(255, 255, 255, 0.85)",
              transition: "transform 0.15s ease",
            }}
          >
            <Play
              size={30}
              fill="#ffffff"
              color="#ffffff"
              style={{ marginLeft: "3px" }}
            />
          </div>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "#f8fafc",
              background: "rgba(5, 11, 20, 0.75)",
              padding: "5px 14px",
              borderRadius: "999px",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(4px)",
            }}
          >
            {adPhase === "checking" ? "Loading video…" : "Click to Play Video"}
          </span>
        </button>
      )}

      {/* Skippable Pre-Roll Ad Overlay */}
      {showAd && ad && (
        <div className="ad-overlay">
          {/* Ad Media (YouTube/Embedded Video, Direct MP4 Video, or Banner) */}
          <div className="ad-media-layer">
            {isVideoAd ? (
              isEmbeddedVideoAd && adEmbed ? (
                <iframe
                  ref={adIframeRef}
                  src={buildAdEmbedUrl(adEmbed.embedUrl, adEmbed.provider)}
                  title={ad.title || "Sponsored Video"}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  onLoad={() => {
                    setIsAdLoaded(true);
                    try {
                      adIframeRef.current?.contentWindow?.postMessage(
                        JSON.stringify({
                          event: "listening",
                          id: playerId,
                          channel: "widget",
                        }),
                        "*",
                      );
                      adIframeRef.current?.contentWindow?.postMessage(
                        JSON.stringify({
                          event: "command",
                          func: "addEventListener",
                          args: ["onStateChange"],
                          id: playerId,
                          channel: "widget",
                        }),
                        "*",
                      );
                    } catch {
                      // Ignore cross-origin errors
                    }
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    border: 0,
                    display: "block",
                    pointerEvents: "auto",
                  }}
                />
              ) : (
                <video
                  ref={adVideoRef}
                  src={adEmbed?.embedUrl || ad.mediaUrl}
                  autoPlay
                  playsInline
                  muted={isMuted}
                  onLoadedData={() => setIsAdLoaded(true)}
                  onError={() => handleSkip()}
                  onEnded={() => handleSkip()}
                />
              )
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
                {isVideoAd && (
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
