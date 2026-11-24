"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertCircle, Info, Sparkles } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/format";

type Tone = "success" | "error" | "info" | "join";
interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: Tone;
}

let toasts: Toast[] = [];
const subs = new Set<() => void>();
let seq = 0;
const emit = () => subs.forEach((s) => s());

export function toast(title: string, opts: { body?: string; tone?: Tone; duration?: number } = {}) {
  const t: Toast = { id: ++seq, title, body: opts.body, tone: opts.tone ?? "info" };
  toasts = [...toasts.slice(-3), t];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, opts.duration ?? 3600);
}

const icons = { success: CheckCircle2, error: AlertCircle, info: Info, join: Sparkles };
const iconTone = { success: "text-ok", error: "text-danger", info: "text-brand-ink", join: "text-brand-ink" };

/** `contained` positions toasts inside the nearest relative container (the phone frame). */
export function Toaster({ contained = false, position = "top" }: { contained?: boolean; position?: "top" | "bottom" }) {
  const list = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none z-[1300] flex flex-col items-center gap-2 px-4",
        contained ? "absolute inset-x-0" : "fixed inset-x-0",
        position === "top" ? (contained ? "top-14" : "top-4") : "bottom-6",
      )}
    >
      <AnimatePresence initial={false}>
        {list.map((t) => {
          const Icon = icons[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: position === "top" ? -16 : 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="glass pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 shadow-[var(--shadow-lift)] hairline"
            >
              <Icon className={cn("mt-0.5 size-[18px] shrink-0", iconTone[t.tone])} aria-hidden />
              <div className="min-w-0">
                <p className="text-[14px] font-medium leading-snug text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{t.body}</p>}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
