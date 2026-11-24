"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/format";
import { OverlayPortal } from "./OverlayPortal";

/**
 * Bottom sheet (mobile) — positioned inside the nearest `relative` container so it stays in the phone frame.
 */
export function Sheet({
  open,
  onClose,
  children,
  title,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <OverlayPortal>
    <AnimatePresence>
      {open && (
        <div className="pointer-events-auto absolute inset-0 z-[60] flex items-end" role="dialog" aria-modal="true">
          <motion.button
            aria-label="Close"
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
            className={cn(
              "relative z-10 max-h-[92%] w-full overflow-y-auto rounded-t-[28px] bg-surface px-5 pb-8 pt-3 shadow-[var(--shadow-float)]",
              className,
            )}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-3" />
            {title && <div className="mb-4 text-[19px] font-semibold tracking-[-0.02em] text-ink">{title}</div>}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </OverlayPortal>
  );
}

/** Centered modal for desktop screens. */
export function Modal({
  open,
  onClose,
  children,
  className,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1250] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={label}>
          <motion.div
            className="absolute inset-0 bg-[#020611]/55 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.16 } }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={cn(
              "relative z-10 w-full max-w-lg rounded-[28px] bg-surface p-6 shadow-[var(--shadow-float)] hairline",
              className,
            )}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-ink-3 transition hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-[18px]" />
            </button>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
