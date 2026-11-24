"use client";

import { motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { cn, fmtDay, inr, inrCompact } from "@/lib/format";
import type { OpsKpis } from "@/lib/types";

type Metric = "gmv" | "savings";
const META: Record<Metric, { label: string; color: string; key: "gmv_paise" | "savings_paise" }> = {
  gmv: { label: "Pooled GMV", color: "var(--brand)", key: "gmv_paise" },
  savings: { label: "Merchant savings", color: "var(--ok)", key: "savings_paise" },
};

/** Monotone-ish smooth path through points (Catmull-Rom → cubic Bézier, tension-limited). */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const H = 240;
const pad = { l: 56, r: 12, t: 16, b: 28 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * exp;
}

export function GmvChart({ kpis }: { kpis: OpsKpis | undefined }) {
  const [metric, setMetric] = useState<Metric>("gmv");
  const [hover, setHover] = useState<number | null>(null);
  const [w, setW] = useState(640);
  const wrap = useRef<HTMLDivElement>(null);
  const gid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const series = useMemo(() => kpis?.series ?? [], [kpis]);
  const m = META[metric];

  const geo = useMemo(() => {
    if (series.length < 2) return null;
    const vals = series.map((s) => s[m.key]);
    const max = niceMax(Math.max(...vals) * 1.08);
    const x = (i: number) => pad.l + (i / (series.length - 1)) * (w - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
    const pts = vals.map((v, i) => [x(i), y(v)] as [number, number]);
    const line = smoothPath(pts);
    const area = `${line} L${x(series.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: max * f, y: y(max * f) }));
    return { pts, line, area, ticks, x };
  }, [series, m.key, w]);

  const totals = useMemo(
    () => ({
      gmv: series.reduce((a, s) => a + s.gmv_paise, 0),
      savings: series.reduce((a, s) => a + s.savings_paise, 0),
    }),
    [series],
  );

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!geo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * w;
    const i = Math.round(((px - pad.l) / (w - pad.l - pad.r)) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  }

  return (
    <div className="rounded-3xl bg-surface p-5 hairline shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-8">
          {(Object.keys(META) as Metric[]).map((k) => (
            <div key={k}>
              <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
                <span className="size-2 rounded-full" style={{ background: META[k].color }} />
                {META[k].label} · 30d
              </p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-ink tabular">
                {kpis ? inrCompact(totals[k]) : "—"}
              </p>
            </div>
          ))}
        </div>
        <div className="flex rounded-full bg-surface-2 p-1" role="tablist" aria-label="Chart metric">
          {(Object.keys(META) as Metric[]).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={metric === k}
              onClick={() => setMetric(k)}
              className={cn(
                "relative h-8 rounded-full px-3.5 text-[12.5px] font-medium transition-colors",
                metric === k ? "text-ink" : "text-ink-3 hover:text-ink-2",
              )}
            >
              {metric === k && (
                <motion.span
                  layoutId="ops-chart-tab"
                  className="absolute inset-0 rounded-full bg-surface shadow-[var(--shadow-soft)] hairline"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative">{k === "gmv" ? "GMV" : "Savings"}</span>
            </button>
          ))}
        </div>
      </div>

      <div ref={wrap} className="relative mt-4">
        {!geo ? (
          <Skeleton className="h-[240px]" />
        ) : (
          <>
            <svg
              width={w}
              height={H}
              viewBox={`0 0 ${w} ${H}`}
              className="block touch-none"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              role="img"
              aria-label={`${m.label} over the last 30 days`}
            >
              <defs>
                <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={m.color} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={m.color} stopOpacity="0" />
                </linearGradient>
              </defs>
              {geo.ticks.map((t) => (
                <g key={t.v}>
                  <line x1={pad.l} x2={w - pad.r} y1={t.y} y2={t.y} stroke="var(--line)" strokeDasharray={t.v === 0 ? undefined : "2 4"} />
                  <text x={pad.l - 10} y={t.y + 4} textAnchor="end" className="fill-ink-3 text-[11px] tabular">
                    {inrCompact(t.v)}
                  </text>
                </g>
              ))}
              {series.map((s, i) =>
                (i % 7 === 0 && series.length - 1 - i >= 4) || i === series.length - 1 ? (
                  <text key={s.day} x={geo.x(i)} y={H - 8} textAnchor={i === series.length - 1 ? "end" : "middle"} className="fill-ink-3 text-[11px]">
                    {i === series.length - 1 ? "Today" : fmtDay(s.day)}
                  </text>
                ) : null,
              )}
              <motion.path
                key={`a-${metric}`}
                d={geo.area}
                fill={`url(#g-${gid})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.9, delay: 0.3 }}
              />
              <motion.path
                key={`l-${metric}`}
                d={geo.line}
                fill="none"
                stroke={m.color}
                strokeWidth={2.25}
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              />
              {/* live endpoint */}
              <circle cx={geo.pts.at(-1)![0]} cy={geo.pts.at(-1)![1]} r={4} fill={m.color} />
              <circle cx={geo.pts.at(-1)![0]} cy={geo.pts.at(-1)![1]} r={9} fill={m.color} opacity={0.18} />
              {hover !== null && (
                <g>
                  <line x1={geo.pts[hover][0]} x2={geo.pts[hover][0]} y1={pad.t} y2={H - pad.b} stroke="var(--line-strong)" />
                  <circle cx={geo.pts[hover][0]} cy={geo.pts[hover][1]} r={5} fill="var(--surface)" stroke={m.color} strokeWidth={2.5} />
                </g>
              )}
            </svg>
            {hover !== null && (
              <div
                className="pointer-events-none absolute top-0 rounded-xl bg-surface px-3 py-2 text-[12px] shadow-[var(--shadow-lift)] hairline"
                style={{
                  left: Math.min(Math.max(geo.pts[hover][0] - 70, 0), w - 150),
                  transform: "translateY(-4px)",
                }}
              >
                <p className="text-ink-3">{hover === series.length - 1 ? "Today (live)" : fmtDay(series[hover].day)}</p>
                <p className="mt-0.5 font-semibold text-ink tabular">{inr(series[hover].gmv_paise)} GMV</p>
                <p className="text-ok tabular">{inr(series[hover].savings_paise)} saved</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
