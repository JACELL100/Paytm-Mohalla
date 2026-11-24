import type { Transition, Variants } from "motion/react";

export const spring: Transition = { type: "spring", stiffness: 380, damping: 32, mass: 0.9 };
export const springSoft: Transition = { type: "spring", stiffness: 220, damping: 28 };
export const springBouncy: Transition = { type: "spring", stiffness: 420, damping: 22 };
export const easeOutExpo = [0.16, 1, 0.3, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOutExpo } },
};

export const stagger = (gap = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});
