"use client";

import { useEffect, useState } from "react";

interface ViewerWatermarkProps {
  name?: string;
  className?: string;
}

const WATERMARK_POSITIONS: Array<React.CSSProperties> = [
  { top: "8%", right: "8%", bottom: "auto", left: "auto" },
  { top: "12%", left: "8%", bottom: "auto", right: "auto" },
  { bottom: "20%", right: "10%", top: "auto", left: "auto" },
  { bottom: "22%", left: "10%", top: "auto", right: "auto" },
  { top: "9%", left: "40%", bottom: "auto", right: "auto" },
];

/**
 * Non-intrusive viewer name watermark overlay.
 * Faintly overlays the student's name on top of video streams to deter
 * screen recording, unauthorized redistribution, and leaking.
 * Smoothly shifts position across safe zones every 28 seconds.
 */
export function ViewerWatermark({ name, className = "" }: ViewerWatermarkProps) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const cleanName = (name || "").trim();

  useEffect(() => {
    if (!cleanName) return;

    const interval = setInterval(() => {
      setVisible(false);
      const timer = setTimeout(() => {
        setIndex((prev) => (prev + 1) % WATERMARK_POSITIONS.length);
        setVisible(true);
      }, 1200);

      return () => clearTimeout(timer);
    }, 28000);

    return () => clearInterval(interval);
  }, [cleanName]);

  if (!cleanName) return null;

  return (
    <div
      className={`viewer-watermark ${className}`}
      aria-hidden="true"
      style={{
        position: "absolute",
        ...WATERMARK_POSITIONS[index],
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 15,
        transition: "opacity 1.2s ease, transform 1.2s ease",
        opacity: visible ? 0.2 : 0,
        transform: visible ? "scale(1)" : "scale(0.96)",
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.5px",
        color: "#ffffff",
        textShadow:
          "0 1px 2px rgba(0, 0, 0, 0.8), 0 0 1px rgba(0, 0, 0, 0.95)",
        padding: "3px 8px",
        borderRadius: "4px",
        background: "rgba(0, 0, 0, 0.12)",
        backdropFilter: "blur(0.5px)",
        whiteSpace: "nowrap",
      }}
    >
      {cleanName}
    </div>
  );
}
