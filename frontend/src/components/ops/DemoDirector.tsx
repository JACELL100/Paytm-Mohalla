"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { ChevronUp, Clock, Cpu, PackageCheck, RotateCcw, Users, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { api } from "@/lib/api";
import { useDemoNow, useDemoState } from "@/lib/clock";
import { cn, fmtDemoTime } from "@/lib/format";
import type { Pool } from "@/lib/types";
import { heroPool, runDirector } from "./actions";

/** clock_offset_minutes = minutes since the demo start (26 Dec 09:00), including real time elapsed. */
function fmtOffset(raw: number) {
  const min = Math.round(raw);
  if (!min) return "T+0";
  const sign = min < 0 ? "−" : "+";
  let m = Math.abs(min);
  const d = Math.floor(m / 1440);
  m -= d * 1440;
  const h = Math.floor(m / 60);
  m -= h * 60;
  return `T${sign}${d ? `${d}d ` : ""}${h ? `${h}h ` : ""}${m ? `${m}m` : ""}`.trim();
}

function PoolSelect({ pools, value, onChange, label }: { pools: Pool[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={pools.length === 0}
      className="h-10 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[13px] text-ink outline-none hairline focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
    >
      {pools.length === 0 && <option value="">None available</option>}
      {pools.map((p) => (
        <option key={p.id} value={p.id}>
          {p.sku.emoji} {p.sku.name} · {p.committed_cases}/{p.target_cases}
        </option>
      ))}
    </select>
  );
}

export function DemoDirector({ pools }: { pools: Pool[] | undefined }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [armedReset, setArmedReset] = useState(false);
  const [custom, setCustom] = useState("");
  const now = useDemoNow();
  const demo = useDemoState();
  const offset = demo?.clock_offset_minutes ?? 0;

  const openPools = (pools ?? []).filter((p) => p.status === "open");
  const fundedPools = (pools ?? []).filter((p) => p.status === "funded");
  const [openSel, setOpenSel] = useState("");
  const [fundSel, setFundSel] = useState("");
  // The hero Cola pool expires ~3 real minutes after reset: surface Reset prominently when that happens.
  const heroExpired = !openPools.some((p) => /cola/i.test(p.sku.name)) && (pools ?? []).some((p) => /cola/i.test(p.sku.name) && p.status === "failed");
  const openPick = openPools.find((p) => p.id === openSel) ?? heroPool(pools, "open");
  const fundPick = fundedPools.find((p) => p.id === fundSel) ?? heroPool(pools, "funded");

  const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await fn();
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }, []);

  const nudge = useCallback(
    (mins: number, label: string) =>
      run(`clock${mins}`, () =>
        runDirector("Clock", () => api.demoClock({ advance_minutes: mins }), (s) => ({
          title: `Clock moved ${label}`,
          body: fmtDemoTime(s.now) + (s.closed_pools ? ` · ${s.closed_pools} pool${s.closed_pools === 1 ? "" : "s"} closed` : ""),
        })),
      ),
    [run],
  );

  const fill = useCallback(() => {
    if (!openPick) return toast("No open pool to fill", { tone: "error" });
    return run("fill", () =>
      runDirector("Simulate joins", () => api.simulateJoins(openPick.id, { fill: true }), () => ({
        title: `Shops joining ${openPick.sku.name}`,
        body: `${Math.max(0, openPick.target_cases - openPick.committed_cases)} cases to go — watch the progress bar`,
      })),
    );
  }, [openPick, run]);

  const deliver = useCallback(() => {
    if (!fundPick) return toast("No funded pool yet", { tone: "error", body: "Fill a pool first" });
    return run("deliver", () =>
      runDirector("Simulate delivery", () => api.simulateDelivery(fundPick.id), `Deliveries confirmed for ${fundPick.sku.name}`),
    );
  }, [fundPick, run]);

  const engine = useCallback(
    () =>
      run("engine", () =>
        runDirector("Pool engine", () => api.runPoolEngine(), (r) =>
          r.created.length
            ? { title: `${r.created.length} new ${r.created.length === 1 ? "pool" : "pools"} formed`, body: r.created.map((p) => `${p.sku.emoji} ${p.sku.name}`).join(", ") }
            : { title: "Pool engine ran", body: "No new clusters right now" },
        ),
      ),
    [run],
  );

  const reset = useCallback(() => {
    if (!armedReset) {
      setArmedReset(true);
      return;
    }
    setArmedReset(false);
    return run("reset", () => runDirector("Reset", () => api.demoReset(), () => ({ title: "Demo reset", body: "Seeded state restored — Cola pool back at 27/40, clock restarted. Reload merchant/distributor tabs from Home (pool ids change)." })));
  }, [armedReset, run]);

  useEffect(() => {
    if (!armedReset) return;
    const t = setTimeout(() => setArmedReset(false), 3500);
    return () => clearTimeout(t);
  }, [armedReset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "escape") setOpen(false);
      else if (k === "j") void fill();
      else if (k === "d") void deliver();
      else if (k === "e") void engine();
      else if (k === "r") {
        setOpen(true);
        void reset();
      } else if (k === "1") void nudge(15, "+15 min");
      else if (k === "2") void nudge(60, "+1 hour");
      else if (k === "3") void nudge(1440, "+1 day");
      else if (k === "`" || k === "g") setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fill, deliver, engine, reset, nudge]);

  const setCustomClock = () => {
    if (!custom) return;
    const iso = `${custom}:00+05:30`;
    void run("custom", () =>
      runDirector("Clock", () => api.demoClock({ iso }), (s) => ({ title: "Clock set", body: fmtDemoTime(s.now) })),
    );
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[1200] flex flex-col items-center px-4">
      <AnimatePresence>
        {open && (
          <motion.section
            aria-label="Demo Director"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="no-scrollbar pointer-events-auto mb-3 bg-surface/95 backdrop-blur-2xl max-h-[calc(100dvh-110px)] w-full max-w-[620px] origin-bottom overflow-y-auto rounded-[28px] p-5 shadow-[var(--shadow-float)] hairline"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink">Demo Director</p>
                <p className="mt-0.5 text-[17px] font-semibold tracking-[-0.02em] text-ink">Run the story on cue</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close Demo Director"
                className="grid size-8 place-items-center rounded-full text-ink-3 transition hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Clock */}
            <div className="mt-4 rounded-2xl bg-surface-2/70 p-4">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                  <Clock className="size-4 text-ink-3" /> Demo clock
                </p>
                <p className="text-[12.5px] text-ink-2 tabular">
                  {now ? fmtDemoTime(new Date(now).toISOString()) : "—"}
                  <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-3 hairline">{fmtOffset(offset)}</span>
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    [15, "+15 min", "1"],
                    [60, "+1 hour", "2"],
                    [1440, "+1 day", "3"],
                  ] as const
                ).map(([m, l, k]) => (
                  <Button key={m} size="sm" variant="outline" loading={busy[`clock${m}`]} onClick={() => nudge(m, l)}>
                    {l} <Kbd>{k}</Kbd>
                  </Button>
                ))}

              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="datetime-local"
                  aria-label="Set demo time (IST)"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-xl bg-surface px-3 text-[13px] text-ink outline-none hairline focus-visible:ring-2 focus-visible:ring-brand"
                />
                <Button size="md" variant="secondary" disabled={!custom} loading={busy.custom} onClick={setCustomClock}>
                  Set (IST)
                </Button>
              </div>
            </div>

            {/* Pools */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-surface-2/70 p-4">
                <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                  <Users className="size-4 text-ink-3" /> Other shops join
                </p>
                <div className="mt-3 flex gap-2">
                  <PoolSelect pools={openPools} value={openPick?.id ?? ""} onChange={setOpenSel} label="Open pool to fill" />
                </div>
                <Button className="mt-2 w-full" variant="brand" loading={busy.fill} disabled={!openPick} onClick={() => void fill()}>
                  Simulate joins (fill) <Kbd>J</Kbd>
                </Button>
              </div>
              <div className="rounded-2xl bg-surface-2/70 p-4">
                <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                  <PackageCheck className="size-4 text-ink-3" /> Distributor delivers
                </p>
                <div className="mt-3 flex gap-2">
                  <PoolSelect pools={fundedPools} value={fundPick?.id ?? ""} onChange={setFundSel} label="Funded pool to deliver" />
                </div>
                <Button className="mt-2 w-full" variant="success" loading={busy.deliver} disabled={!fundPick} onClick={() => void deliver()}>
                  Simulate delivery <Kbd>D</Kbd>
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" loading={busy.engine} onClick={() => void engine()}>
                <Cpu className="size-4" /> Run pool engine <Kbd>E</Kbd>
              </Button>
              <Button
                variant={armedReset ? "danger" : "ghost"}
                loading={busy.reset}
                onClick={() => void reset()}
                className={cn(armedReset && "ring-1 ring-danger/40")}
              >
                <RotateCcw className="size-4" />
                {armedReset ? "Click again to reset everything" : "Reset demo"} <Kbd>R</Kbd>
              </Button>
            </div>
            <p className="mt-3 text-center text-[11.5px] text-ink-3">
              Shortcuts work anywhere on this page · <Kbd>G</Kbd> toggles this panel
            </p>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Dock */}
      <motion.div
        layout
        className="glass pointer-events-auto flex items-center gap-1.5 rounded-full p-1.5 shadow-[var(--shadow-float)] hairline"
      >
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex h-10 items-center gap-2 rounded-full pl-3 pr-3.5 text-[13px] font-medium text-ink transition hover:bg-surface-2"
        >
          <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-brand to-navy text-white">
            <Wand2 className="size-3.5" />
          </span>
          Demo Director
          <span className="hidden text-ink-3 tabular sm:inline">· {now ? fmtDemoTime(new Date(now).toISOString()) : "—"}</span>
          <ChevronUp className={cn("size-4 text-ink-3 transition-transform", !open && "rotate-180")} />
        </button>
        <span className="h-6 w-px bg-line" />
        <Button size="sm" variant="ghost" loading={busy.clock15} onClick={() => nudge(15, "+15 min")} aria-label="Move clock forward 15 minutes">
          +15m
        </Button>
        <Button size="sm" variant="brand" loading={busy.fill} disabled={!openPick} onClick={() => void fill()}>
          <Users className="size-3.5" /> Fill
        </Button>
        <Button size="sm" variant="success" loading={busy.deliver} disabled={!fundPick} onClick={() => void deliver()}>
          <PackageCheck className="size-3.5" /> Deliver
        </Button>
        {(heroExpired || armedReset) && (
          <Button size="sm" variant="danger" loading={busy.reset} onClick={() => void reset()} className={cn(heroExpired && !armedReset && "animate-pulse")}>
            <RotateCcw className="size-3.5" /> {armedReset ? "Confirm reset" : "Pool expired · Reset"}
          </Button>
        )}
      </motion.div>
    </div>
  );
}
