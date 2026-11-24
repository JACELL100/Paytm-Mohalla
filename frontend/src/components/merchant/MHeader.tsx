"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ChevronLeft, LogOut } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { signOut } from "@/lib/auth";
import { clearQueries } from "@/lib/query";
import { cn } from "@/lib/format";

export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div role="group" aria-label="Language" className={cn("relative grid h-8 grid-cols-2 rounded-full bg-surface-2 p-0.5 text-[12.5px] font-semibold", className)}>
      {(["hi", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={cn("relative z-10 w-9 rounded-full transition-colors", lang === l ? "text-ink" : "text-ink-3")}
        >
          {lang === l && (
            <motion.span layoutId="lang-pill" className="absolute inset-0 -z-10 rounded-full bg-surface shadow-[var(--shadow-soft)]" transition={{ type: "spring", stiffness: 500, damping: 36 }} />
          )}
          <span className={l === "hi" ? "lang-hi" : ""}>{l === "hi" ? "हि" : "EN"}</span>
        </button>
      ))}
    </div>
  );
}

export function MHeader({
  title,
  subtitle,
  back,
  right,
  large,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: boolean;
  right?: React.ReactNode;
  large?: boolean;
}) {
  const router = useRouter();
  return (
    <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
      <div className="flex min-w-0 items-center gap-2">
        {back && (
          <button
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/m"))}
            aria-label="Back"
            className="-ml-2 grid size-10 shrink-0 place-items-center rounded-full text-ink transition hover:bg-surface-2 active:scale-95"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}
        <div className="min-w-0">
          {subtitle && <p className="truncate text-[13px] text-ink-3">{subtitle}</p>}
          {title && (
            <h1 className={cn("truncate font-semibold tracking-[-0.03em] text-ink", large ? "text-[28px] leading-tight" : "text-[19px]")}>{title}</h1>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-1">{right ?? <LangToggle />}</div>
    </header>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      aria-label="Sign out"
      onClick={async () => {
        await signOut("merchant");
        clearQueries();
        router.push("/login");
      }}
      className="grid size-8 place-items-center rounded-full bg-surface-2 text-ink-3 transition hover:text-ink"
    >
      <LogOut className="size-4" />
    </button>
  );
}
