"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function NavigationScrollHandler() {
  const pathname = usePathname();

  useEffect(() => {
    // If the URL has no anchor hash, ensure the viewport resets cleanly to top on navigation
    if (typeof window !== "undefined" && !window.location.hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      const raf = requestAnimationFrame(() => {
        if (!window.location.hash) {
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        }
      });
      const timeoutId = setTimeout(() => {
        if (!window.location.hash) {
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        }
      }, 50);

      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timeoutId);
      };
    }
  }, [pathname]);

  return null;
}
