"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { Minus, Plus } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/format";

/** Circular trust gauge for the 300–900 scale. */
export function TrustRing({
  score,
  size = 64,
  stroke = 6,
  className,
  children,
  from,
}: {
  score: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
  from?: number;
}) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = (s: number) => Math.max(0, Math.min(1, (s - 300) / 600));
  const mv = useMotionValue(frac(from ?? 300));
  const dash = useTransform(mv, (v) => `${v * c * 0.75} ${c}`);
  useEffect(() => {
    if (reduce) {
      mv.set(frac(score));
      return;
    }
    const a = animate(mv, frac(score), { duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.15 });
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, reduce]);
  const id = `tr-${size}`;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[135deg]" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22C6FF" />
            <stop offset="100%" stopColor="#12A150" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} strokeDasharray={`${c * 0.75} ${c}`} strokeLinecap="round" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round" style={{ strokeDasharray: dash }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-300", checked ? "bg-ok" : "bg-surface-3")}
    >
      <motion.span
        className="absolute top-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)]"
        animate={{ left: checked ? 22 : 2 }}
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
      />
    </button>
  );
}

export function Stepper({ value, onChange, min = 1, max, label }: { value: number; onChange: (v: number) => void; min?: number; max: number; label: string }) {
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <motion.button
        whileTap={{ scale: 0.9 }}
        aria-label="Decrease"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink transition disabled:opacity-35"
      >
        <Minus className="size-5" />
      </motion.button>
      <div className="relative w-14 overflow-hidden text-center">
        <motion.span
          key={value}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="tabular block text-[34px] font-semibold tracking-[-0.03em] text-ink"
          aria-live="polite"
        >
          {value}
        </motion.span>
      </div>
      <motion.button
        whileTap={{ scale: 0.9 }}
        aria-label="Increase"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink transition disabled:opacity-35"
      >
        <Plus className="size-5" />
      </motion.button>
    </div>
  );
}

/** Thin progress bar used in lists. */
export function MiniProgress({ value, max, tone = "brand", className }: { value: number; max: number; tone?: "brand" | "ok"; className?: string }) {
  const p = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <motion.div
        className={cn("h-full w-full rounded-full", tone === "ok" ? "bg-ok" : "bg-[linear-gradient(90deg,#22C6FF,#0A6BD6)]")}
        initial={{ x: "-100%" }}
        animate={{ x: `${(p - 1) * 100}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 22 }}
      />
    </div>
  );
}
