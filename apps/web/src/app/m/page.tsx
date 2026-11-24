"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, ChevronRight, Clock, Users, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { useLang } from "@/lib/i18n";
import { useDemoNow } from "@/lib/clock";
import { cn, inr, mmss, pct } from "@/lib/format";
import { NumberTicker, Skeleton } from "@/components/ui/primitives";
import { SoundboxCard } from "@/components/merchant/SoundboxCard";
import { ForecastCard, ForecastSheet } from "@/components/merchant/Forecast";
import { MiniProgress, TrustRing } from "@/components/merchant/bits";
import { LangToggle, SignOutButton } from "@/components/merchant/MHeader";
import type { HomeResponse, Pool } from "@/lib/types";

const rise = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.55, ease: [0.16, 1, 0.3, 1] as const } }),
};

export default function MerchantHome() {
  const { lang, t } = useLang();
  const home = useQuery<HomeResponse>("m:home", api.home, { interval: 5000 });
  const [fc, setFc] = useState<string | null>(null);
  const now = useDemoNow();
  const h = home.data;

  const hour = now ? Number(new Date(now).toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" })) : 9;
  const greet = hour < 12 ? t("greeting_morning") : hour < 17 ? t("greeting_afternoon") : t("greeting_evening");
  const first = h?.merchant.owner_name.split(" ")[0] ?? "";

  return (
    <div className="px-4">
      <header className="flex items-start justify-between px-1 pb-4 pt-4">
        <div className="min-w-0">
          <p className="text-[13px] text-ink-3">{h?.merchant.name ?? " "}</p>
          <h1 className="mt-0.5 text-[26px] font-semibold leading-tight tracking-[-0.03em] text-ink">
            {greet}, {first} {t("ji")}
          </h1>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <LangToggle />
          <SignOutButton />
        </div>
      </header>

      {!h ? (
        <div className="space-y-4">
          <Skeleton className="h-[240px] rounded-[30px]" />
          <div className="grid grid-cols-3 gap-2.5">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-44 rounded-[26px]" />
        </div>
      ) : (
        <motion.div initial="hidden" animate="show" className="space-y-6">
          <motion.div custom={0} variants={rise}>
            <SoundboxCard nudges={h.nudges} />
          </motion.div>

          {/* stats */}
          <motion.div custom={1} variants={rise} className="grid grid-cols-[1.25fr_1fr] gap-2.5">
            <div className="relative overflow-hidden rounded-[24px] bg-surface p-4 hairline shadow-[var(--shadow-soft)]">
              <div aria-hidden className="absolute -right-6 -top-8 size-24 rounded-full bg-ok-soft blur-xl" />
              <p className="text-[12.5px] font-medium text-ink-3">{t("saved_total")}</p>
              <p className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.035em] text-ok">
                <NumberTicker value={h.savings.total_paise} format={(v) => inr(v)} />
              </p>
              <p className="mt-2 text-[12px] text-ink-3">
                {h.savings.pools_joined} {t("across_pools")}
              </p>
            </div>
            <Link href="/m/trust" className="group flex items-center gap-3 rounded-[24px] bg-surface p-3.5 hairline shadow-[var(--shadow-soft)] transition active:scale-[0.98]">
              <TrustRing score={h.trust.score} size={58} stroke={5.5}>
                <span className="tabular text-[15px] font-semibold tracking-[-0.02em] text-ink">{h.trust.score}</span>
              </TrustRing>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-ink-3">{t("trust_score")}</p>
                <p className="text-[14px] font-semibold text-ink">{h.trust.band}</p>
              </div>
            </Link>
          </motion.div>

          {/* invites */}
          {h.invites.length > 0 && (
            <motion.section custom={2} variants={rise}>
              <h2 className="mb-2.5 px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">{t("pool_invite")}</h2>
              <div className="space-y-3">
                {h.invites.map((p, i) => (
                  <InviteCard key={p.id} pool={p} now={now} featured={i === 0} />
                ))}
              </div>
            </motion.section>
          )}

          {h.active_pools.length > 0 && (
            <motion.section custom={3} variants={rise}>
              <h2 className="mb-2.5 px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">{t("your_pools")}</h2>
              <div className="space-y-2.5">
                {h.active_pools.map((p) => (
                  <ActivePoolRow key={p.id} pool={p} />
                ))}
              </div>
            </motion.section>
          )}

          {/* forecasts */}
          <motion.section custom={4} variants={rise}>
            <h2 className="mb-2.5 px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">{t("this_week")}</h2>
            <div className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1">
              {h.forecasts.map((f, i) => (
                <ForecastCard key={f.category} f={f} index={i} onOpen={() => setFc(f.category)} />
              ))}
            </div>
          </motion.section>

          <motion.div custom={5} variants={rise} className="flex items-center justify-between rounded-[24px] bg-surface p-4 hairline shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-brand-soft text-brand-ink">
                <Wallet className="size-5" />
              </span>
              <div>
                <p className="text-[12.5px] font-medium text-ink-3">{t("wallet")}</p>
                <p className="tabular text-[17px] font-semibold tracking-[-0.02em] text-ink">
                  <NumberTicker value={h.wallet.balance_paise} format={(v) => inr(v)} />
                </p>
              </div>
            </div>
            <span className={cn("text-[12px] text-ink-3", lang === "hi" && "lang-hi")}>{lang === "hi" ? "Paytm से जुड़ा" : "Linked to Paytm"}</span>
          </motion.div>
        </motion.div>
      )}
      <ForecastSheet category={fc} onClose={() => setFc(null)} />
    </div>
  );
}

function InviteCard({ pool: p, now, featured }: { pool: Pool; now: number; featured: boolean }) {
  const { t } = useLang();
  const left = now ? new Date(p.deadline).getTime() - now : 0;
  const nextSlab = p.slabs.find((s) => s.min_cases > p.committed_cases);
  return (
    <Link href={`/m/pools/${p.id}`} className="block">
      <motion.div
        whileTap={{ scale: 0.985 }}
        className={cn(
          "relative overflow-hidden rounded-[26px] p-4 hairline shadow-[var(--shadow-soft)]",
          featured ? "bg-[linear-gradient(150deg,#ffffff_0%,#eef9ff_100%)] dark:bg-surface" : "bg-surface",
        )}
      >
        {featured && <div aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full bg-brand/15 blur-2xl" />}
        <div className="relative flex items-start gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-white text-[30px] shadow-[var(--shadow-soft)] hairline">{p.sku.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[17px] font-semibold tracking-[-0.02em] text-ink">{p.sku.name}</p>
              <span className="shrink-0 rounded-full bg-ok-soft px-2 py-0.5 text-[12px] font-semibold text-ok">−{pct(p.disc_bps)}</span>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2">
              <Users className="size-3.5" /> {p.member_count} {t("shops_pooling")}
              <span className="text-ink-3">·</span>
              <Clock className="size-3.5" /> <span className="tabular">{now ? mmss(left) : "--:--"}</span>
            </p>
          </div>
        </div>
        <div className="relative mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
            <span className="tabular font-semibold text-ink">
              {p.committed_cases}
              <span className="font-normal text-ink-3"> / {p.target_cases} {t("cases")}</span>
            </span>
            {nextSlab && <span className="text-ink-3">{nextSlab.min_cases - p.committed_cases} {t("left")}</span>}
          </div>
          <MiniProgress value={p.committed_cases} max={p.target_cases} />
        </div>
        <div className="relative mt-4 flex items-center justify-between">
          <div>
            <p className="text-[12px] text-ink-3">{t("you_save")}</p>
            <p className="tabular text-[16px] font-semibold text-ok">
              {inr(p.savings_per_case_paise * (p.mine?.suggested_cases ?? 1))}
              {p.mine?.suggested_cases ? (
                <span className="ml-1 text-[12px] font-normal text-ink-3">
                  · {p.mine.suggested_cases} {t("cases")}
                </span>
              ) : null}
            </p>
          </div>
          <span className="inline-flex h-10 items-center gap-1.5 rounded-full bg-navy px-4 text-[14px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(0,46,110,0.6)]">
            {t("join_pool")} <ArrowRight className="size-4" />
          </span>
        </div>
      </motion.div>
    </Link>
  );
}

function ActivePoolRow({ pool: p }: { pool: Pool }) {
  const { t } = useLang();
  const funded = p.status === "funded";
  return (
    <Link href={`/m/pools/${p.id}`} className="flex items-center gap-3 rounded-[22px] bg-surface p-3.5 hairline shadow-[var(--shadow-soft)] transition active:scale-[0.985]">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[22px]">{p.sku.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="truncate text-[15px] font-semibold text-ink">{p.sku.name}</p>
          <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", funded ? "bg-ok-soft text-ok" : "bg-brand-soft text-brand-ink")}>
            {funded ? t("funded") : `${p.committed_cases}/${p.target_cases}`}
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          {p.mine?.committed_cases} {t("cases")} · {inr(p.mine?.amount_paise ?? 0)}
        </p>
        {!funded && <MiniProgress value={p.committed_cases} max={p.target_cases} className="mt-2 h-1.5" />}
      </div>
      <ChevronRight className="size-4 shrink-0 text-ink-3" />
    </Link>
  );
}
