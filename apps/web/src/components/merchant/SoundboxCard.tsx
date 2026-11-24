"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speak, type SpeakHandle } from "@/lib/speech";
import { useLang } from "@/lib/i18n";
import { api } from "@/lib/api";
import { cn, relTime } from "@/lib/format";
import { useDemoNow } from "@/lib/clock";
import type { Nudge } from "@/lib/types";

const autoplayed = new Set<string>();

function Grille({ playing }: { playing: boolean }) {
  const dots = useMemo(() => {
    const out: { x: number; y: number; r: number }[] = [];
    for (let y = -5; y <= 5; y++)
      for (let x = -5; x <= 5; x++) {
        const d = Math.hypot(x, y);
        if (d <= 5.2) out.push({ x: 50 + x * 8, y: 50 + y * 8, r: 2.3 - d * 0.12 });
      }
    return out;
  }, []);
  return (
    <div className="relative grid size-[92px] shrink-0 place-items-center">
      {/* sound-wave rings */}
      {playing &&
        [0, 1, 2].map((i) => (
          <span
            key={i}
            className="absolute inset-0 animate-pulse-ring rounded-full border border-[#22C6FF]/60"
            style={{ animationDelay: `${i * 0.8}s` }}
          />
        ))}
      <motion.div
        animate={playing ? { scale: [1, 1.035, 1] } : { scale: 1 }}
        transition={playing ? { duration: 0.45, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
        className="relative size-[92px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#2a3346,#0b0f18_70%)] shadow-[inset_0_2px_6px_rgba(0,0,0,0.6),inset_0_-1px_0_rgba(255,255,255,0.06),0_8px_20px_-6px_rgba(0,0,0,0.6)]"
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0" aria-hidden>
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#05070c" stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />
          ))}
        </svg>
        <span
          className={cn(
            "absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-500",
            playing ? "bg-[#22C6FF] shadow-[0_0_16px_4px_rgba(34,198,255,0.7)]" : "bg-[#22C6FF]/40",
          )}
        />
      </motion.div>
    </div>
  );
}

function Karaoke({ text, progress, active }: { text: string; progress: number; active: boolean }) {
  const words = useMemo(
    () =>
      text.split(/\s+/).reduce<{ w: string; start: number }[]>((acc, w) => {
        const prev = acc[acc.length - 1];
        const from = prev ? prev.start + prev.w.length : 0;
        acc.push({ w, start: text.indexOf(w, from) });
        return acc;
      }, []),
    [text],
  );
  const cursor = progress * text.length;
  return (
    <p className="text-[17px] font-medium leading-[1.6] tracking-[-0.005em]">
      {words.map(({ w, start }, i) => {
        const spoken = !active || cursor >= start + w.length * 0.5;
        const current = active && cursor >= start && cursor < start + w.length + 1;
        return (
          <span
            key={i}
            className={cn(
              "transition-colors duration-200",
              current ? "text-[#5fd6ff]" : spoken ? "text-white" : "text-white/35",
            )}
          >
            {w}{" "}
          </span>
        );
      })}
    </p>
  );
}

export function SoundboxCard({ nudges }: { nudges: Nudge[] }) {
  const { lang, t } = useLang();
  const now = useDemoNow();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const nudge = nudges[Math.min(index, nudges.length - 1)];
  const [playingRaw, setPlaying] = useState(false);
  const [progressRaw, setProgress] = useState(0);
  const [playLang, setPlayLang] = useState(lang);
  // switching language stops playback (see effect below); derive the visible state from it
  const playing = playingRaw && playLang === lang;
  const progress = playLang === lang ? progressRaw : 0;
  const handle = useRef<SpeakHandle | null>(null);
  const text = nudge ? (lang === "hi" ? nudge.text_hi : nudge.text_en) : "";

  const stop = useCallback(() => {
    handle.current?.stop();
    handle.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (!nudge) return;
    handle.current?.stop();
    setPlaying(true);
    setProgress(0);
    setPlayLang(lang);
    handle.current = speak({
      text,
      lang,
      audioUrl: lang === "hi" ? nudge.audio_url : null,
      onProgress: setProgress,
      onEnd: () => {
        setPlaying(false);
        handle.current = null;
      },
    });
    if (!nudge.heard) api.nudgeHeard(nudge.id).catch(() => {});
  }, [nudge, text, lang]);

  // Newest unheard nudge auto-plays once, if the browser allows audio (user already interacted).
  const newest = nudges[0];
  useEffect(() => {
    if (!newest || newest.heard || autoplayed.has(newest.id)) return;
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    autoplayed.add(newest.id);
    const id = setTimeout(() => {
      setIndex(0);
      play();
    }, 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest?.id]);

  useEffect(() => () => handle.current?.stop(), []);
  // language switch while speaking: stop
  useEffect(() => {
    handle.current?.stop();
    handle.current = null;
  }, [lang]);

  if (!nudge) return null;

  return (
    <section
      aria-label={t("soundbox")}
      className="relative overflow-hidden rounded-[30px] bg-[linear-gradient(160deg,#0d1a33_0%,#071022_55%,#04070f_100%)] p-5 text-white shadow-[0_24px_50px_-20px_rgba(0,20,60,0.7),inset_0_1px_0_rgba(255,255,255,0.08)]"
    >
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[radial-gradient(circle,rgba(34,198,255,0.25),transparent_65%)]" />
      <div className="relative flex items-center gap-4">
        <Grille playing={playing && !reduce} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("size-1.5 rounded-full", playing ? "bg-[#2fd176] shadow-[0_0_8px_#2fd176]" : "bg-white/30")} />
            <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/60">{t("soundbox")}</span>
          </div>
          <p className="mt-1.5 text-[13px] text-white/50">
            {now ? relTime(nudge.created_at, now, lang) : ""}
            {!nudge.heard && (
              <span className="ml-2 rounded-full bg-[#22C6FF]/20 px-2 py-0.5 text-[11px] font-semibold text-[#7fdcff]">{t("new_message")}</span>
            )}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={playing ? stop : play}
              aria-label={playing ? t("stop") : t("play")}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white pl-3.5 pr-4 text-[14px] font-semibold text-[#071022] shadow-[0_6px_16px_-6px_rgba(34,198,255,0.7)]"
            >
              {playing ? <Pause className="size-4 fill-current" /> : progress >= 1 ? <RotateCcw className="size-4" /> : <Play className="size-4 fill-current" />}
              {playing ? t("stop") : progress >= 1 ? t("replay") : t("play")}
            </motion.button>
            {nudges.length > 1 && (
              <div className="ml-auto flex gap-1" role="tablist" aria-label="Messages">
                {nudges.slice(0, 5).map((n, i) => (
                  <button
                    key={n.id}
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Message ${i + 1}`}
                    onClick={() => {
                      stop();
                      setProgress(0);
                      setIndex(i);
                    }}
                    className="grid h-6 w-4 place-items-center"
                  >
                    <span className={cn("h-1.5 rounded-full transition-all duration-300", i === index ? "w-4 bg-white" : "w-1.5 bg-white/30")} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={nudge.id + lang}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3 }}
          className="relative mt-4"
        >
          <Karaoke text={text} progress={progress} active={playing || (progress > 0 && progress < 1)} />
          {nudge.pool_id && (
            <Link
              href={`/m/pools/${nudge.pool_id}`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-white/15"
            >
              {t("view_pool")} <ArrowRight className="size-3.5" />
            </Link>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
