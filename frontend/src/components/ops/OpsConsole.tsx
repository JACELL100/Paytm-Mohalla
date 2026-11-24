"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Moon, Sun } from "lucide-react";
import { RoleGate } from "@/components/RoleGate";
import { Logo } from "@/components/ui/Logo";
import { Skeleton } from "@/components/ui/primitives";
import { Toaster } from "@/components/ui/Toaster";
import { api } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { useDemoNow } from "@/lib/clock";
import { mocksEnabled } from "@/lib/config";
import { cn, fmtDemoTime } from "@/lib/format";
import { useQuery } from "@/lib/query";
import type { Health } from "@/lib/types";
import { DemoDirector } from "./DemoDirector";
import { GmvChart } from "./GmvChart";
import { HexMap } from "./HexMap";
import { KpiTiles } from "./KpiTiles";
import { PoolsTable } from "./PoolsTable";
import { TxFeed } from "./TxFeed";

const THEME_KEY = "mohalla.ops.theme";

function useOpsTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(THEME_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read persisted preference after hydration
      if (v === "light") setDark(false);
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = () =>
    setDark((d) => {
      try {
        window.localStorage.setItem(THEME_KEY, d ? "light" : "dark");
      } catch {
        /* ignore */
      }
      return !d;
    });
  return { dark, toggle };
}

function ChainPill({ health }: { health: Health | undefined }) {
  const [mocks, setMocks] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage flag is client-only
    setMocks(mocksEnabled());
  }, []);
  if (!health) return <Skeleton className="h-7 w-28 rounded-full" />;
  const label = health.chain_mode === "sepolia" ? "Sepolia" : health.chain_mode === "local" ? "Local chain" : "Chain off";
  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-full bg-surface-2 px-3 text-[12px] font-medium text-ink-2 hairline">
      <span className={cn("size-1.5 rounded-full", health.chain_mode === "off" ? "bg-ink-3" : "bg-ok")} />
      {label}
      {mocks && <span className="rounded-full bg-warn-soft px-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-warn">Mock</span>}
    </span>
  );
}

function Header({ dark, toggle }: { dark: boolean; toggle: () => void }) {
  const router = useRouter();
  const now = useDemoNow();
  const health = useQuery<Health>("health", api.health, { staleMs: 60000 });
  return (
    <header className="glass sticky top-0 z-[60] border-b border-line">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-3">
          <Logo size={28} />
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[11.5px] font-semibold tracking-wide text-brand-ink">OPS</span>
          <span className="hidden text-[13px] text-ink-3 md:inline">Built for Paytm merchants · Marol cluster</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2.5 rounded-full bg-surface-2 py-1.5 pl-3 pr-3.5 hairline sm:flex" aria-live="off">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-ok opacity-60" />
              <span className="relative size-2 rounded-full bg-ok" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Demo time</span>
            <span className="text-[13px] font-medium text-ink tabular">{now ? fmtDemoTime(new Date(now).toISOString()) : "—"}</span>
          </div>
          <ChainPill health={health.data} />
          <button
            onClick={toggle}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            className="grid size-9 place-items-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button
            onClick={async () => {
              await signOut("ops");
              router.push("/login");
            }}
            aria-label="Sign out"
            className="grid size-9 place-items-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

function Console({ dark }: { dark: boolean }) {
  const now = useDemoNow();
  const kpis = useQuery("ops:kpis", api.opsKpis, { interval: 3000 });
  const pools = useQuery("ops:pools", api.opsPools, { interval: 3000 });
  const txs = useQuery("ops:txs", api.opsTxs, { interval: 3000 });
  const hexes = useQuery("ops:hexes", api.opsHexes, { interval: 15000 });

  return (
    <main className="pb-32">
      <section className="mx-auto max-w-[1600px] px-6 pt-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-ink">Neighbourhood command centre</h1>
          <p className="mt-1 text-[14px] text-ink-2">Pooled demand, escrowed money and credit — live across Marol, Andheri East.</p>
        </motion.div>
        <div className="mt-6">
          <KpiTiles kpis={kpis.data} />
        </div>
      </section>

      <section className="mt-6 h-[58vh] min-h-[420px] border-y border-line" aria-label="Map">
        <HexMap hexes={hexes.data} pools={pools.data} dark={dark} />
      </section>

      <section className="mx-auto mt-6 grid max-w-[1600px] gap-4 px-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GmvChart kpis={kpis.data} />
        </div>
        <TxFeed txs={txs.data} now={now} />
      </section>

      <section className="mx-auto mt-4 max-w-[1600px] px-6">
        <PoolsTable pools={pools.data} now={now} />
      </section>

      <footer className="mx-auto mt-8 max-w-[1600px] px-6 text-[12px] text-ink-3">
        Data: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-ink-2 hover:underline">OpenStreetMap contributors</a> · Weather by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-ink-2 hover:underline">Open-Meteo.com</a> · Map tiles © OpenStreetMap
      </footer>

      <DemoDirector pools={pools.data} />
    </main>
  );
}

function ConsoleSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] px-6 pt-8">
      <Skeleton className="h-8 w-80" />
      <Skeleton className="mt-2 h-4 w-96" />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[124px] rounded-3xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-[58vh] rounded-3xl" />
    </div>
  );
}

export function OpsConsole() {
  const { dark, toggle } = useOpsTheme();
  return (
    <div className={cn(dark && "dark")}>
      <div className="min-h-dvh bg-bg text-ink">
        <Header dark={dark} toggle={toggle} />
        <RoleGate role="ops" fallback={<ConsoleSkeleton />}>
          <Console dark={dark} />
        </RoleGate>
        <Toaster />
      </div>
    </div>
  );
}
