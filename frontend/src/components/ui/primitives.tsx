"use client";

import { cn } from "@/lib/format";
import { animate, useInView, useMotionValue, useReducedMotion, useTransform, motion } from "motion/react";
import { useEffect, useRef } from "react";

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-3xl bg-surface hairline shadow-[var(--shadow-soft)]", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-surface-2", className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/5" />
    </div>
  );
}

type Tone = "neutral" | "brand" | "ok" | "warn" | "danger" | "navy";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  brand: "bg-brand-soft text-brand-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  navy: "bg-navy text-white",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium tracking-[-0.005em]",
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex size-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" />
          <span className="relative size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

/** Animated number that springs to new values. `format` renders the displayed value. */
export function NumberTicker({
  value,
  format = (n) => Math.round(n).toLocaleString("en-IN"),
  className,
  duration = 1.1,
  from,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
  duration?: number;
  from?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const mv = useMotionValue(from ?? value);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, inView, reduce, duration, mv]);
  return (
    <motion.span ref={ref} className={cn("tabular", className)}>
      {text}
    </motion.span>
  );
}

export function Hairline({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}

export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-end justify-between px-1", className)}>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">{children}</h2>
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
      {children}
    </kbd>
  );
}
