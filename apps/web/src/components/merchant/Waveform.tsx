"use client";

import { useEffect, useRef } from "react";

/**
 * Audio-reactive waveform. When `analyser` is given it draws live frequency bars;
 * when `active` without an analyser it draws a synthetic voice-like motion; idle is a calm line.
 */
export function Waveform({ analyser, active, className }: { analyser: AnalyserNode | null; active: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
    };
    resize();
    const bins = 40;
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const smooth = new Float32Array(bins);
    let raf = 0;
    const draw = (t: number) => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      if (analyser && data) analyser.getByteFrequencyData(data);
      const gap = W / bins;
      const bw = Math.max(2 * dpr, gap * 0.48);
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, "#0A6BD6");
      grad.addColorStop(0.5, "#22C6FF");
      grad.addColorStop(1, "#0A6BD6");
      ctx.fillStyle = grad;
      for (let i = 0; i < bins; i++) {
        let v: number;
        const centre = 1 - Math.abs(i - bins / 2) / (bins / 2);
        if (analyser && data) {
          const idx = Math.floor(2 + (i < bins / 2 ? bins / 2 - i : i - bins / 2) * (data.length / 2 / (bins / 2)) * 0.5);
          v = (data[idx] ?? 0) / 255;
          v = Math.pow(v, 1.3) * (0.6 + centre * 0.6);
        } else if (active && !reduce) {
          v = (0.25 + 0.55 * Math.abs(Math.sin(t / 180 + i * 0.55) * Math.sin(t / 420 + i * 0.21))) * (0.4 + centre * 0.7);
        } else {
          v = 0.04 + (reduce ? 0 : 0.03 * Math.sin(t / 700 + i * 0.4));
        }
        smooth[i] += (v - smooth[i]) * 0.28;
        const h = Math.max(3 * dpr, smooth[i] * H * 0.92);
        const x = i * gap + (gap - bw) / 2;
        const y = (H - h) / 2;
        const r = bw / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, bw, h, r);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [analyser, active]);
  return <canvas ref={ref} className={className} aria-hidden />;
}
