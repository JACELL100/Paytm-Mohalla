"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/** Lenis smooth scrolling for the landing page. Skipped under prefers-reduced-motion. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      autoRaf: true,
      anchors: { offset: -72 },
    });
    return () => lenis.destroy();
  }, []);
  return null;
}
