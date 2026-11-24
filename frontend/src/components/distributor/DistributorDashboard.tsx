"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boxes, CalendarClock, CheckCircle2, ChevronDown, Clock3, IndianRupee, LogOut, PackageOpen, QrCode, Timer, Truck, type LucideIcon } from "lucide-react";
import { RoleGate, useMe } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Badge, NumberTicker, Skeleton } from "@/components/ui/primitives";
import { Toaster } from "@/components/ui/Toaster";
import { api } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { cn, fmtDemoTime, inr, inrCompact, pct } from "@/lib/format";
import { useQuery } from "@/lib/query";
import type { DistributorOrder, DistributorSummary } from "@/lib/types";
import { QrModal, type QrTarget } from "./QrModal";

const DEMO_SHOP = /^Ramesh General Store$/i;

function Header() {
  const me = useMe();
  const router = useRouter();
  return (
    <header className="glass sticky top-0 z-[60] border-b border-line">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Logo size={28} />
          <span className="h-5 w-px bg-line-strong" />
          <span className="text-[14px] font-medium text-ink">{me?.distributor?.name ?? me?.profile.display_name}</span>
          <Badge tone="brand">Distributor</Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await signOut("distributor");
            router.push("/login");
          }}
        >
          <LogOut className="size-3.5" /> Sign out
        </Button>
      </div>
    </header>
  );
}

const TILES: { key: keyof DistributorSummary; label: string; icon: LucideIcon; fmt: (n: number) => string; sub: string }[] = [
  { key: "funded_pools", label: "Funded orders", icon: Boxes, fmt: (n) => Math.round(n).toString(), sub: "Money already in escrow" },
  { key: "cases_to_deliver", label: "Cases to deliver", icon: Truck, fmt: (n) => Math.round(n).toLocaleString("en-IN"), sub: "Across all shops" },
  { key: "received_paise", label: "Received", icon: CheckCircle2, fmt: (n) => inrCompact(n), sub: "Released on delivery scan" },
  { key: "pending_paise", label: "In escrow", icon: IndianRupee, fmt: (n) => inrCompact(n), sub: "Guaranteed on delivery" },
  { key: "on_time_rate", label: "On-time rate", icon: Timer, fmt: (n) => `${Math.round(n * 100)}%`, sub: "Feeds your supplier score" },
];

function Summary({ s }: { s: DistributorSummary | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {TILES.map((t, i) => {
        const Icon = t.icon;
        return s ? (
          <motion.div
            key={t.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -2 }}
            className="rounded-3xl bg-surface p-5 hairline shadow-[var(--shadow-soft)]"
          >
            <div className="flex items-center justify-between">
              <p className="text-[12.5px] font-medium text-ink-2">{t.label}</p>
              <Icon className="size-4 text-brand-ink" aria-hidden />
            </div>
            <NumberTicker value={s[t.key]} format={t.fmt} className="mt-3 block text-[28px] font-semibold leading-none tracking-[-0.03em] text-ink" />
            <p className="mt-2 text-[12px] text-ink-3">{t.sub}</p>
          </motion.div>
        ) : (
          <Skeleton key={t.key} className="h-[118px] rounded-3xl" />
        );
      })}
    </div>
  );
}

const DSTATUS = {
  pending: { tone: "warn" as const, label: "To deliver" },
  delivered: { tone: "ok" as const, label: "Delivered" },
  refunded: { tone: "neutral" as const, label: "Refunded" },
};

function OrderCard({ o, i, onQr }: { o: DistributorOrder; i: number; onQr: (t: QrTarget) => void }) {
  const [open, setOpen] = useState(o.pool.status === "funded");
  const pending = o.deliveries.filter((d) => d.status === "pending");
  const done = o.deliveries.length - pending.length;
  const total = o.deliveries.reduce((a, d) => a + d.amount_paise, 0);
  // Pending first; the demo shop (Ramesh) is pinned to the top so it's instant to find on stage.
  const rank = (d: (typeof o.deliveries)[number]) => (d.status === "pending" ? 0 : 2) + (DEMO_SHOP.test(d.merchant.name) ? 0 : 1);
  const rows = [...o.deliveries].sort((a, b) =>
    rank(a) !== rank(b) ? rank(a) - rank(b) : a.merchant.name.localeCompare(b.merchant.name),
  );
  const frac = o.deliveries.length ? done / o.deliveries.length : 0;
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.06, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-3xl bg-surface hairline shadow-[var(--shadow-soft)]"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-surface-2/50"
      >
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[28px]" aria-hidden>
          {o.pool.sku.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{o.pool.sku.name}</h3>
            <Badge tone={o.pool.status === "funded" ? "ok" : "neutral"} dot={o.pool.status === "funded"}>
              {o.pool.status === "funded" ? "Funded · ready to ship" : "Settled"}
            </Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
            <span className="tabular">
              {o.pool.target_cases} cases × {inr(o.pool.case_price_paise)}
            </span>
            <span className="text-ink-3">·</span>
            <span>{pct(o.pool.disc_bps)} slab</span>
            <span className="text-ink-3">·</span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5 text-ink-3" /> Deliver by {fmtDemoTime(o.pool.delivery_deadline)}
            </span>
          </p>
        </div>
        <div className="hidden w-48 shrink-0 sm:block">
          <div className="flex justify-between text-[12.5px]">
            <span className="text-ink-2 tabular">
              {done}/{o.deliveries.length} shops
            </span>
            <span className="font-medium text-ink tabular">{inr(total)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <motion.div className="h-full rounded-full bg-ok" initial={false} animate={{ width: `${frac * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 22 }} />
          </div>
        </div>
        <ChevronDown className={cn("size-5 shrink-0 text-ink-3 transition-transform duration-300", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <ul className="border-t border-line">
              {rows.map((d) => {
                const st = DSTATUS[d.status];
                return (
                  <motion.li
                    layout
                    key={d.merchant.id}
                    className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-b-0"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-semibold text-ink-2">
                      {d.merchant.name.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">{d.merchant.name}</p>
                      <p className="text-[12.5px] text-ink-3 tabular">
                        {d.cases} {d.cases === 1 ? "case" : "cases"} · {inr(d.amount_paise)}
                      </p>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <div className="w-[120px] text-right">
                      {d.status === "pending" && o.pool.status === "funded" ? (
                        <Button size="sm" variant="primary" onClick={() => onQr({ pool: o.pool, delivery: d })}>
                          <QrCode className="size-3.5" /> Show QR
                        </Button>
                      ) : d.status === "delivered" ? (
                        <span className="inline-flex items-center gap-1 text-[12.5px] text-ok">
                          <CheckCircle2 className="size-3.5" /> Paid
                        </span>
                      ) : null}
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function Dashboard() {
  const summary = useQuery("d:summary", api.dSummary, { interval: 3000 });
  const orders = useQuery("d:orders", api.dOrders, { interval: 3000 });
  const [target, setTarget] = useState<QrTarget | null>(null);

  const funded = orders.data?.filter((o) => o.pool.status === "funded") ?? [];
  const settled = orders.data?.filter((o) => o.pool.status !== "funded") ?? [];

  return (
    <main className="mx-auto max-w-[1240px] px-6 pb-24 pt-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
        <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-ink">Orders &amp; deliveries</h1>
        <p className="mt-1 max-w-2xl text-[14.5px] text-ink-2">
          Every order below is already paid into escrow. Show each shop its QR at handover — the scan releases that shop’s payment to you instantly.
        </p>
      </motion.div>

      <div className="mt-7">
        <Summary s={summary.data} />
      </div>

      <section className="mt-10" aria-labelledby="funded-h">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="funded-h" className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Ready to deliver
          </h2>
          {orders.data && <span className="text-[12.5px] text-ink-3">{funded.length} funded</span>}
        </div>
        {!orders.data ? (
          <div className="space-y-3">
            <Skeleton className="h-[96px] rounded-3xl" />
            <Skeleton className="h-[96px] rounded-3xl" />
          </div>
        ) : funded.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center rounded-3xl border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center"
          >
            <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand-ink">
              <PackageOpen className="size-6" />
            </span>
            <p className="mt-4 text-[16px] font-semibold text-ink">No funded orders yet</p>
            <p className="mt-1 max-w-sm text-[13.5px] text-ink-2">Orders appear here when a pool is funded — the money is locked in escrow before you ship a single case.</p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <Clock3 className="size-3.5" /> Checking every few seconds
            </p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {funded.map((o, i) => (
              <OrderCard key={o.pool.id} o={o} i={i} onQr={setTarget} />
            ))}
          </div>
        )}
      </section>

      {settled.length > 0 && (
        <section className="mt-10" aria-labelledby="settled-h">
          <h2 id="settled-h" className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Completed
          </h2>
          <div className="space-y-3">
            {settled.map((o, i) => (
              <OrderCard key={o.pool.id} o={o} i={i} onQr={setTarget} />
            ))}
          </div>
        </section>
      )}

      <QrModal target={target} orders={orders.data} onClose={() => setTarget(null)} />
    </main>
  );
}

function DashSkeleton() {
  return (
    <div className="mx-auto max-w-[1240px] px-6 pt-10">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="mt-2 h-4 w-[480px] max-w-full" />
      <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-3xl" />
        ))}
      </div>
      <Skeleton className="mt-10 h-[96px] rounded-3xl" />
    </div>
  );
}

export function DistributorDashboard() {
  return (
    <div className="min-h-dvh bg-bg">
      <RoleGate role="distributor" fallback={<DashSkeleton />}>
        <Header />
        <Dashboard />
      </RoleGate>
      <Toaster />
    </div>
  );
}
