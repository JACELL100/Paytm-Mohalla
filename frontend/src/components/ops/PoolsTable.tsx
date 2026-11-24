"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { PackageCheck, Users } from "lucide-react";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { cn, inr, mmss, pct } from "@/lib/format";
import type { Pool } from "@/lib/types";
import { deliverAll, fillJoins } from "./actions";

const STATUS: Record<Pool["status"], { tone: "brand" | "ok" | "neutral" | "danger"; label: string }> = {
  open: { tone: "brand", label: "Open" },
  funded: { tone: "ok", label: "Funded" },
  settled: { tone: "neutral", label: "Settled" },
  failed: { tone: "danger", label: "Failed" },
  draft: { tone: "neutral", label: "Draft" },
};

function Row({ p, now, i }: { p: Pool; now: number; i: number }) {
  const [busy, setBusy] = useState(false);
  const frac = Math.min(1, p.committed_cases / p.target_cases);
  const left = new Date(p.deadline).getTime() - now;
  const st = STATUS[p.status];
  const act = async (fn: (p: Pool) => Promise<boolean>) => {
    setBusy(true);
    await fn(p);
    setBusy(false);
  };
  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.03, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="group border-t border-line transition-colors hover:bg-surface-2/60"
    >
      <td className="py-3.5 pl-5 pr-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-surface-2 text-[20px]" aria-hidden>
            {p.sku.emoji}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-ink">{p.sku.name}</p>
            <p className="truncate text-[12px] text-ink-3">{p.distributor.name}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3.5">
        <div className="w-[180px]">
          <div className="flex items-baseline justify-between text-[12.5px]">
            <span className="font-medium text-ink tabular">
              {p.committed_cases}
              <span className="text-ink-3">/{p.target_cases} cases</span>
            </span>
            <span className="text-ink-3 tabular">{Math.round(frac * 100)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <motion.div
              className={cn("h-full rounded-full", p.status === "failed" ? "bg-danger" : frac >= 1 ? "bg-ok" : "bg-brand")}
              initial={false}
              animate={{ width: `${frac * 100}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 22 }}
            />
          </div>
        </div>
      </td>
      <td className="px-3 py-3.5">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 tabular">
          <Users className="size-3.5 text-ink-3" />
          {p.member_count}
        </span>
      </td>
      <td className="px-3 py-3.5 text-[13px] tabular">
        <span className="font-medium text-ok">{pct(p.disc_bps)}</span>
        <span className="ml-1.5 text-ink-3">{inr(p.case_price_paise)}/case</span>
      </td>
      <td className="px-3 py-3.5">
        <Badge tone={st.tone} dot={p.status === "open"}>
          {st.label}
        </Badge>
      </td>
      <td className="px-3 py-3.5 text-[13px] tabular text-ink-2">
        {p.status === "open" ? (now ? (left > 0 ? mmss(left) : "closing…") : "—") : p.status === "funded" ? "Awaiting delivery" : "—"}
      </td>
      <td className="py-3.5 pl-3 pr-5 text-right">
        {p.status === "open" && (
          <Button size="sm" variant="outline" loading={busy} onClick={() => act(fillJoins)} aria-label={`Simulate joins for ${p.sku.name}`}>
            <Users className="size-3.5" /> Fill
          </Button>
        )}
        {p.status === "funded" && (
          <Button size="sm" variant="outline" loading={busy} onClick={() => act(deliverAll)} aria-label={`Simulate delivery for ${p.sku.name}`}>
            <PackageCheck className="size-3.5" /> Deliver
          </Button>
        )}
      </td>
    </motion.tr>
  );
}

export function PoolsTable({ pools, now }: { pools: Pool[] | undefined; now: number }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-surface hairline shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <div>
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Pools</p>
          <p className="text-[12.5px] text-ink-3">Every pool needs ≥5 shops · shop identities never shown to peers</p>
        </div>
        {pools && <span className="text-[12.5px] text-ink-3 tabular">{pools.length} total</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-3">
              <th className="pb-2 pl-5 pr-3 font-medium">SKU</th>
              <th className="px-3 pb-2 font-medium">Progress</th>
              <th className="px-3 pb-2 font-medium">Shops</th>
              <th className="px-3 pb-2 font-medium">Slab</th>
              <th className="px-3 pb-2 font-medium">Status</th>
              <th className="px-3 pb-2 font-medium">Closes in</th>
              <th className="pb-2 pl-3 pr-5 text-right font-medium">Director</th>
            </tr>
          </thead>
          <tbody>
            {pools
              ? pools.map((p, i) => <Row key={p.id} p={p} now={now} i={i} />)
              : Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-5 py-2">
                      <Skeleton className="h-12" />
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
