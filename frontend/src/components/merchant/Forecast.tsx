"use client";

import { motion } from "motion/react";
import { TrendingUp, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { useLang } from "@/lib/i18n";
import { cn, fmtDay, inr } from "@/lib/format";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/primitives";
import type { ForecastDetail, ForecastSummary } from "@/lib/types";

export function ForecastCard({ f, onOpen, index }: { f: ForecastSummary; onOpen: () => void; index: number }) {
  const { lang, t } = useLang();
  const hot = f.uplift >= 2;
  return (
    <motion.button
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.07, type: "spring", stiffness: 260, damping: 26 }}
      whileTap={{ scale: 0.97 }}
      onClick={onOpen}
      className="flex w-[168px] shrink-0 snap-start flex-col rounded-[24px] bg-surface p-4 text-left hairline shadow-[var(--shadow-soft)]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[28px] leading-none">{f.emoji}</span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold", hot ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand-ink")}>
          <TrendingUp className="size-3" /> {f.uplift.toFixed(1)}×
        </span>
      </div>
      <p className="mt-3 text-[15px] font-semibold tracking-[-0.01em] text-ink">{lang === "hi" ? f.label_hi : f.label_en}</p>
      <p className="mt-0.5 line-clamp-1 text-[12.5px] text-ink-3">{f.event ?? t("this_week")}</p>
      <div className="mt-3 flex items-end gap-1">
        <span className="tabular text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink">{f.uplift.toFixed(1)}×</span>
        <span className="pb-0.5 text-[11.5px] text-ink-3">{t("vs_normal")}</span>
      </div>
      {f.need_cases != null && (
        <p className="mt-2 text-[12.5px] font-medium text-brand-ink">
          +{f.need_cases} {t("need_cases")}
        </p>
      )}
    </motion.button>
  );
}

function BandChart({ d }: { d: ForecastDetail }) {
  const W = 340;
  const H = 150;
  const hist = d.history.slice(-21);
  const fc = d.forecast.slice(0, 14);
  const all = [...hist.map((h) => h.value_paise), ...fc.map((f) => f.p90_paise)];
  const max = Math.max(...all) * 1.08;
  const n = hist.length + fc.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - (v / max) * H;
  const histPath = hist.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.value_paise).toFixed(1)}`).join(" ");
  const o = hist.length - 1;
  const p50 = [`M${x(o)},${y(hist[o].value_paise)}`, ...fc.map((f, i) => `L${x(o + 1 + i).toFixed(1)},${y(f.p50_paise).toFixed(1)}`)].join(" ");
  const band =
    fc.map((f, i) => `${i ? "L" : "M"}${x(o + 1 + i).toFixed(1)},${y(f.p90_paise).toFixed(1)}`).join(" ") +
    " " +
    [...fc].reverse().map((f, i) => `L${x(o + fc.length - i).toFixed(1)},${y(f.p10_paise).toFixed(1)}`).join(" ") +
    " Z";
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label="Sales history and forecast">
      <defs>
        <linearGradient id="fc-band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22C6FF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22C6FF" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke="var(--line)" />
      ))}
      <line x1={x(o)} x2={x(o)} y1={0} y2={H} stroke="var(--line-strong)" strokeDasharray="3 3" />
      <motion.path d={band} fill="url(#fc-band)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }} />
      <motion.path d={histPath} fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: "easeOut" }} />
      <motion.path d={p50} fill="none" stroke="#0A84D6" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.7, duration: 0.8, ease: "easeOut" }} />
      <text x={2} y={H + 14} fontSize="10" fill="var(--ink-3)">{fmtDay(hist[0].day)}</text>
      <text x={x(o)} y={H + 14} fontSize="10" fill="var(--ink-2)" textAnchor="middle">Today</text>
      <text x={W - 2} y={H + 14} fontSize="10" fill="var(--ink-3)" textAnchor="end">{fmtDay(fc[fc.length - 1].day)}</text>
    </svg>
  );
}

export function ForecastSheet({ category, onClose }: { category: string | null; onClose: () => void }) {
  const { lang, t } = useLang();
  const q = useQuery<ForecastDetail>(category ? `forecast:${category}` : null, () => api.forecast(category!), { staleMs: 60000 });
  const d = q.data && q.data.category === category ? q.data : null;
  const peak = useMemo(() => (d ? Math.max(...d.forecast.slice(0, 7).map((f) => f.p50_paise)) : 0), [d]);
  return (
    <Sheet open={!!category} onClose={onClose} title={d ? (lang === "hi" ? d.label_hi : d.label_en) : " "}>
      {!d ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-16" />
        </div>
      ) : (
        <div>
          <BandChart d={d} />
          <div className="mt-2 flex items-center gap-4 text-[12px] text-ink-3">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-ink-3" /> {lang === "hi" ? "पिछली बिक्री" : "Past sales"}</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#0A84D6]" /> {lang === "hi" ? "अनुमान" : "Forecast"}</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-brand/25" /> p10–p90</span>
          </div>
          <div className="mt-5 rounded-2xl bg-brand-soft p-4">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-ink">
              <Sparkles className="size-3.5" /> {t("forecast_why")}
            </p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{lang === "hi" ? d.reason.explanation_hi : d.reason.explanation_en}</p>
          </div>
          <p className="mt-4 text-[13px] text-ink-2">
            {lang === "hi" ? "सबसे व्यस्त दिन की अनुमानित बिक्री" : "Busiest day forecast"}: <b className="tabular text-ink">{inr(peak)}</b>
          </p>
        </div>
      )}
    </Sheet>
  );
}
