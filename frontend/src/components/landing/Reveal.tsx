"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { easeOutExpo } from "@/lib/motion";

/** Fade-and-rise once when scrolled into view. */
export function Reveal({
  delay = 0,
  y = 18,
  children,
  ...rest
}: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.8, ease: easeOutExpo, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[13px] font-semibold uppercase tracking-[0.14em] text-brand-ink ${className}`}>{children}</p>
  );
}
