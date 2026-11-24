"use client";

import { motion } from "motion/react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { useLang } from "@/lib/i18n";
import { fmtDay, shortHash } from "@/lib/format";
import { MHeader } from "@/components/merchant/MHeader";
import { NumberTicker, Skeleton } from "@/components/ui/primitives";
import type { TrustResponse } from "@/lib/types";

function Gauge({ score }: { score: number }) {
  const W = 280;
  const R = 116;
  const cx = W / 2;
  const cy = 132;
  const frac = Math.max(0, Math.min(1, (score - 300) / 600));
  const arc = (f: number) => {
    const a = Math.PI * (1 - f);
    return [cx + R * Math.cos(a), cy - R * Math.sin(a)] as const;
  };
  const [ex, ey] = arc(1);
  const [sx, sy] = arc(0);
  const path = `M${sx},${sy} A${R},${R} 0 0 1 ${ex},${ey}`;
  const [kx, ky] = arc(frac);
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <svg viewBox={`0 0 ${W} 150`} className="w-full" role="img" aria-label={`Trust score ${score} of 900`}>
        <defs>
          <linearGradient id="gauge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#E5484D" />
            <stop offset="40%" stopColor="#FFB224" />
            <stop offset="70%" stopColor="#22C6FF" />
            <stop offset="100%" stopColor="#12A150" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke="var(--surface-3)" strokeWidth={16} strokeLinecap="round" />
        <motion.path d={path} fill="none" stroke="url(#gauge)" strokeWidth={16} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: frac }} transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.15 }} />
        <motion.circle cx={kx} cy={ky} r={11} fill="var(--surface)" stroke="var(--ink)" strokeWidth={3} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.3, type: "spring", stiffness: 400, damping: 18 }} style={{ transformOrigin: `${kx}px ${ky}px` }} />
        <text x={sx} y={cy + 18} fontSize="11" fill="var(--ink-3)" textAnchor="middle">300</text>
        <text x={ex} y={cy + 18} fontSize="11" fill="var(--ink-3)" textAnchor="middle">900</text>
      </svg>
      <div className="absolute inset-x-0 top-[52px] text-center">
        <p className="text-[56px] font-semibold leading-none tracking-[-0.05em] text-ink">
          <NumberTicker value={score} from={300} duration={1.5} />
        </p>
      </div>
    </div>
  );
}

function Spark({ data }: { data: { date: string; score: number }[] }) {
  const W = 320;
  const H = 80;
  const pts = data.slice(-14);
  const min = Math.min(...pts.map((p) => p.score)) - 10;
  const max = Math.max(...pts.map((p) => p.score)) + 10;
  const x = (i: number) => (i / Math.max(1, pts.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H + 4}`} className="w-full overflow-visible" role="img" aria-label="Score history">
      <defs>
        <linearGradient id="spark-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#12A150" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#12A150" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={area} fill="url(#spark-a)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} />
      <motion.path d={line} fill="none" stroke="var(--ok)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: "easeOut" }} />
      {last && <circle cx={x(pts.length - 1)} cy={y(last.score)} r={4.5} fill="var(--ok)" stroke="var(--surface)" strokeWidth={2} />}
    </svg>
  );
}

export default function TrustPage() {
  const { lang, t } = useLang();
  const q = useQuery<TrustResponse>("m:trust", api.trustMe, { interval: 8000 });
  const d = q.data;
  const comps = useMemo(
    () =>
      d
        ? [
            { k: t("honoured"), v: d.components.honoured_rate, label: `${Math.round(d.components.honoured_rate * 100)}%`, w: "50%" },
            { k: t("pools_joined"), v: Math.min(1, d.components.pools_joined / 10), label: String(d.components.pools_joined), w: "20%" },
            { k: t("stability"), v: d.components.sales_stability, label: `${Math.round(d.components.sales_stability * 100)}%`, w: "20%" },
            { k: t("tenure_paytm"), v: Math.min(1, d.components.tenure_months / 24), label: `${d.components.tenure_months} ${t("months")}`, w: "10%" },
          ]
        : [],
    [d, t],
  );

  return (
    <div>
      <MHeader title={t("trust_score")} subtitle="Trade Trust Score" />
      <div className="space-y-4 px-4">
        {!d ? (
          <>
            <Skeleton className="h-60 rounded-[30px]" />
            <Skeleton className="h-48" />
          </>
        ) : (
          <>
            <section className="rounded-[30px] bg-surface px-5 pb-5 pt-6 hairline shadow-[var(--shadow-soft)]">
              <Gauge score={d.score} />
              <div className="-mt-1 flex justify-center">
                <span className="rounded-full bg-ok-soft px-3 py-1 text-[13px] font-semibold text-ok">{d.band}</span>
              </div>
              <p className="mx-auto mt-4 max-w-[300px] text-center text-[13px] leading-relaxed text-ink-2">{t("trust_explain")}</p>
            </section>

            <section className="rounded-[26px] bg-surface p-5 hairline shadow-[var(--shadow-soft)]">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">{t("components")}</h2>
              <ul className="mt-3 space-y-4">
                {comps.map((c, i) => (
                  <li key={c.k}>
                    <div className="flex items-baseline justify-between text-[14px]">
                      <span className="text-ink">
                        {c.k} <span className="text-[11.5px] text-ink-3">· {c.w}</span>
                      </span>
                      <span className="tabular font-semibold text-ink">{c.label}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
                      <motion.div
                        className="h-full w-full rounded-full bg-[linear-gradient(90deg,#22C6FF,#12A150)]"
                        initial={{ x: "-100%" }}
                        animate={{ x: `${(c.v - 1) * 100}%` }}
                        transition={{ delay: 0.2 + i * 0.08, type: "spring", stiffness: 90, damping: 18 }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-[26px] bg-surface p-5 hairline shadow-[var(--shadow-soft)]">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">{t("history")}</h2>
                {d.history.length > 1 && (
                  <span className="tabular text-[13px] font-semibold text-ok">+{d.score - d.history[Math.max(0, d.history.length - 14)].score}</span>
                )}
              </div>
              <div className="mt-4">
                <Spark data={d.history} />
              </div>
            </section>

            <section className="rounded-[26px] bg-surface p-5 hairline shadow-[var(--shadow-soft)]">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">{t("attestations")}</h2>
              <ul className="mt-2">
                {d.attestations.map((a, i) => {
                  const label = /deliver/i.test(a.kind)
                    ? lang === "hi" ? "समय पर delivery" : "On-time delivery"
                    : /commit/i.test(a.kind)
                      ? lang === "hi" ? "वादा निभाया" : "Commitment honoured"
                      : a.kind;
                  const body = (
                    <>
                      <span className="grid size-9 place-items-center rounded-xl bg-ok-soft text-ok">
                        <ShieldCheck className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium text-ink">{label}</span>
                        <span className="block truncate font-mono text-[11.5px] text-ink-3">
                          {fmtDay(a.created_at)} · {a.url ? shortHash(a.url.split("/").pop(), 10) : `pool ${a.pool_id.slice(0, 8)}`}
                        </span>
                      </span>
                      {a.url ? (
                        <>
                          <span className="text-[12px] font-medium text-ink-2">EASScan</span>
                          <ExternalLink className="size-3.5 text-ink-3" />
                        </>
                      ) : (
                        <span className="text-[11.5px] text-ink-3">{lang === "hi" ? "रिकॉर्डेड" : "Recorded"}</span>
                      )}
                    </>
                  );
                  return (
                    <motion.li key={`${a.pool_id}-${a.kind}-${i}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }} className="border-b border-line last:border-0">
                      {a.url ? (
                        <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-3">
                          {body}
                        </a>
                      ) : (
                        <div className="flex items-center gap-3 py-3">{body}</div>
                      )}
                    </motion.li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
