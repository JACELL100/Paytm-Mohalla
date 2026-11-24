"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Banknote, HandCoins, Landmark, Layers, PiggyBank, ShieldCheck, type LucideIcon } from "lucide-react";
import { NumberTicker, Skeleton } from "@/components/ui/primitives";
import { cn, inrCompact } from "@/lib/format";
import type { OpsKpis } from "@/lib/types";

interface TileDef {
  key: keyof OpsKpis;
  label: string;
  icon: LucideIcon;
  money?: boolean;
  sub: (k: OpsKpis) => string;
  accent: string;
}

const TILES: TileDef[] = [
  { key: "pooled_gmv_paise", label: "Pooled GMV", icon: Layers, money: true, sub: () => "B2B orders via pools", accent: "text-brand-ink" },
  { key: "merchant_savings_paise", label: "Merchant savings", icon: PiggyBank, money: true, sub: () => "From unlocked slabs", accent: "text-ok" },
  { key: "loans_paise", label: "Pool Credit issued", icon: HandCoins, money: true, sub: () => "Via lending partners", accent: "text-brand-ink" },
  { key: "fee_revenue_paise", label: "Paytm fee revenue", icon: Banknote, money: true, sub: () => "1% on delivered GMV", accent: "text-brand-ink" },
  { key: "active_pools", label: "Active pools", icon: Landmark, sub: (k) => `${k.funded_pools} funded · ${k.merchants} shops`, accent: "text-brand-ink" },
  { key: "avg_trust", label: "Avg Trust Score", icon: ShieldCheck, sub: () => "300–900 · EAS-backed", accent: "text-ok" },
];

function Tile({ def, kpis, i }: { def: TileDef; kpis: OpsKpis; i: number }) {
  const value = kpis[def.key] as number;
  const [prev, setPrev] = useState(value);
  const [delta, setDelta] = useState<{ v: number; id: number } | null>(null);
  if (value !== prev) {
    setPrev(value);
    if (value > prev) setDelta({ v: value - prev, id: (delta?.id ?? 0) + 1 });
  }
  useEffect(() => {
    if (!delta) return;
    const t = setTimeout(() => setDelta(null), 2800);
    return () => clearTimeout(t);
  }, [delta]);

  const fmt = def.money ? (n: number) => inrCompact(n) : (n: number) => Math.round(n).toLocaleString("en-IN");
  const Icon = def.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2 }}
      className={cn(
        "relative overflow-hidden rounded-3xl bg-surface p-5 hairline shadow-[var(--shadow-soft)] transition-shadow duration-500",
        delta && "shadow-[0_0_0_1px_var(--ok),0_12px_40px_-12px_var(--ok)]",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-medium text-ink-2">{def.label}</p>
        <Icon className={cn("size-4", def.accent)} aria-hidden />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <NumberTicker value={value} format={fmt} className="text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink" />
        <AnimatePresence>
          {delta && (
            <motion.span
              key={delta.id}
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-full bg-ok-soft px-2 py-0.5 text-[11.5px] font-semibold text-ok tabular"
            >
              +{fmt(delta.v)}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">{def.sub(kpis)}</p>
    </motion.div>
  );
}

export function KpiTiles({ kpis }: { kpis: OpsKpis | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {TILES.map((t, i) =>
        kpis ? <Tile key={t.key} def={t} kpis={kpis} i={i} /> : <Skeleton key={t.key} className="h-[124px] rounded-3xl" />,
      )}
    </div>
  );
}
