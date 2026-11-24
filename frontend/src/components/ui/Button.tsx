"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/format";

type Variant = "primary" | "brand" | "secondary" | "ghost" | "success" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "xl" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-navy text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_20px_-8px_rgba(0,46,110,0.6)] hover:bg-navy-2 dark:bg-brand dark:text-[#00142e] dark:hover:brightness-110",
  brand:
    "bg-brand text-[#00213f] shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_8px_24px_-10px_rgba(0,186,242,0.9)] hover:brightness-105",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3",
  ghost: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
  outline: "bg-surface text-ink hairline hover:bg-surface-2",
  success:
    "bg-ok text-white shadow-[0_1px_0_rgba(255,255,255,0.2)_inset,0_8px_20px_-8px_rgba(18,161,80,0.7)] hover:brightness-105",
  danger: "bg-danger-soft text-danger hover:bg-danger/15",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-full gap-1.5",
  md: "h-10 px-4 text-sm rounded-full gap-2",
  lg: "h-12 px-5 text-[15px] rounded-2xl gap-2",
  xl: "h-14 px-6 text-base rounded-2xl gap-2.5",
  icon: "h-10 w-10 rounded-full",
};

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex select-none items-center justify-center font-medium tracking-[-0.01em] transition-[background-color,filter,opacity,color] duration-200 disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </motion.button>
  );
});
