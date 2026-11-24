"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BadgeCheck, CircleDollarSign, Clock, ExternalLink, EyeOff, Sparkles, Store, Truck, Users, PartyPopper, XCircle } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { useLang } from "@/lib/i18n";
import { useDemoNow } from "@/lib/clock";
import { cn, inr, mmss, pct, relTime, shortHash } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { TxBadge } from "@/components/ui/TxBadge";
import { toast } from "@/components/ui/Toaster";
import { MHeader } from "@/components/merchant/MHeader";
import { PoolProgress } from "@/components/merchant/PoolProgress";
import { ConfirmCard } from "@/components/merchant/ConfirmCard";
import { Stepper, Switch } from "@/components/merchant/bits";
import type { CreditOffer, DeliveryStatus, HomeResponse, PendingAction, Pool } from "@/lib/types";

async function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = (await import("canvas-confetti")).default;
  const el = document.getElementById("m-scroll");
  const r = el?.getBoundingClientRect();
  const origin = r
    ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height * 0.3) / window.innerHeight }
    : { x: 0.5, y: 0.3 };
  const colors = ["#22C6FF", "#0A6BD6", "#2fd176", "#ffffff", "#002E6E"];
  confetti({ particleCount: 90, spread: 70, startVelocity: 38, origin, colors, scalar: 0.9, ticks: 220, disableForReducedMotion: true });
  setTimeout(() => confetti({ particleCount: 60, spread: 110, startVelocity: 28, origin, colors, scalar: 0.75, ticks: 200, disableForReducedMotion: true }), 250);
}

export default function PoolPage() {
  const { id } = useParams<{ id: string }>();
  const { lang, t } = useLang();
  const now = useDemoNow();
  const reduce = useReducedMotion();
  const q = useQuery<Pool>(`pool:${id}`, () => api.pool(id), { interval: 1500, staleMs: 0 });
  const home = useQuery<HomeResponse>("m:home", api.home, { staleMs: 10000 });
  const pool = q.data && q.data.id === id ? q.data : undefined;

  const [casesSel, setCases] = useState<number | null>(null);
  const [creditSel, setCredit] = useState<boolean | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [joining, setJoining] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const myJoinAt = useRef(0);

  const remaining = pool ? Math.max(0, pool.target_cases - pool.committed_cases) : 0;
  const suggested = pool?.mine?.suggested_cases ?? 1;
  const cases = Math.max(1, Math.min(casesSel ?? suggested, Math.max(1, remaining)));
  const amount = pool ? cases * pool.case_price_paise : 0;
  const wallet = home.data?.wallet.balance_paise ?? 0;
  const walletLow = !!home.data && wallet < amount;
  const useCredit = creditSel ?? walletLow;
  const offer = useQuery<CreditOffer>(pool && useCredit && amount ? `credit:${amount}` : null, () => api.creditOffer(amount), { staleMs: 30000 });

  // Live "a shop just joined" toasts + funded celebration.
  const seen = useRef<{ at: string | null; status: string | null }>({ at: null, status: null });
  useEffect(() => {
    if (!pool) return;
    const newest = pool.recent_joins[0]?.at ?? null;
    const s = seen.current;
    if (s.at !== null && newest && newest > s.at) {
      const fresh = pool.recent_joins.filter((j) => j.at > s.at!);
      fresh.slice(0, 2).forEach((j) => {
        if (Date.now() - myJoinAt.current < 6000 && j.cases === pool.mine?.committed_cases) return;
        toast(`${t("shop_joined")} · +${j.cases} ${t("cases")}`, { tone: "join", duration: 2600 });
      });
    }
    if (s.status === "open" && pool.status === "funded") {
      setCelebrating(true);
      void celebrate();
      if ("vibrate" in navigator) navigator.vibrate?.([30, 60, 30]);
    }
    seen.current = { at: newest ?? s.at ?? "", status: pool.status };
  }, [pool, t]);

  const join = async () => {
    if (!pool) return;
    setJoining(true);
    try {
      const a = await api.commit(pool.id, cases, useCredit);
      setAction(a);
    } catch (e) {
      toast(lang === "hi" ? "जुड़ नहीं पाए" : "Couldn't join", { body: errorMessage(e), tone: "error" });
    } finally {
      setJoining(false);
    }
  };

  const joinsList = useMemo(() => pool?.recent_joins.slice(0, 6) ?? [], [pool]);

  if (!pool) {
    return (
      <div className="pt-0">
        <MHeader back />
        <div className="px-4">
        {q.error ? (
          <div className="mt-12 text-center">
            <p className="text-[16px] font-semibold text-ink">{lang === "hi" ? "यह pool अब नहीं मिला" : "This pool isn't available"}</p>
            <p className="mt-1 text-[13.5px] text-ink-2">{errorMessage(q.error)}</p>
            <Link href="/m" className="mt-5 inline-flex h-10 items-center rounded-full bg-navy px-5 text-[14px] font-medium text-white">
              {t("home")}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <Skeleton className="h-72 rounded-[28px]" />
            <Skeleton className="h-24" />
            <Skeleton className="h-64 rounded-[28px]" />
          </div>
        )}
        </div>
      </div>
    );
  }

  const left = now ? new Date(pool.deadline).getTime() - now : 0;
  const mine = pool.mine;
  const committed = (mine?.committed_cases ?? 0) > 0;
  const open = pool.status === "open";
  const funded = pool.status === "funded" || pool.status === "settled";
  const urgent = open && left > 0 && left < 60000;

  return (
    <div className="pb-4">
      <MHeader back title={pool.sku.name} subtitle={pool.distributor.name} />

      <div className="space-y-4 px-4">
        {/* hero */}
        <section
          className={cn(
            "relative overflow-hidden rounded-[30px] bg-surface p-5 hairline shadow-[var(--shadow-soft)] transition-shadow duration-700",
            celebrating && "shadow-[0_0_0_2px_rgba(18,161,80,0.5),0_20px_60px_-20px_rgba(18,161,80,0.55)]",
          )}
        >
          <div aria-hidden className={cn("absolute -right-16 -top-16 size-56 rounded-full blur-3xl transition-colors duration-700", funded ? "bg-ok/20" : "bg-brand/15")} />
          <div className="relative flex items-start justify-between">
            <motion.span
              className="grid size-[68px] place-items-center rounded-[22px] bg-white text-[38px] shadow-[var(--shadow-lift)] hairline"
              animate={reduce ? undefined : { y: [0, -4, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              {pool.sku.emoji}
            </motion.span>
            <StatusPill pool={pool} />
          </div>
          <div className="relative mt-5">
            <PoolProgress pool={pool} pendingMine={open && !action ? cases : 0} />
          </div>
          <div className="relative mt-1 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
                <span className="relative flex size-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-ok opacity-70" />
                  <span className="relative size-1.5 rounded-full bg-ok" />
                </span>
                {t("shops_pooling")}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[20px] font-semibold tracking-[-0.02em] text-ink">
                <Users className="size-4 text-ink-3" />
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span key={pool.member_count} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className="tabular">
                    {pool.member_count}
                  </motion.span>
                </AnimatePresence>
              </p>
            </div>
            <div className={cn("rounded-2xl px-3.5 py-3 transition-colors", urgent ? "bg-warn-soft" : "bg-surface-2")}>
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
                <Clock className="size-3" /> {open ? t("ends_in") : t("deadline")}
              </p>
              <p className={cn("tabular mt-0.5 text-[20px] font-semibold tracking-[-0.02em]", urgent ? "text-warn" : "text-ink")}>
                {open ? (now ? mmss(left) : "--:--") : funded ? "✓" : "—"}
              </p>
            </div>
          </div>
        </section>

        {/* funded / failed banners */}
        <AnimatePresence>
          {funded && (
            <motion.section
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className="relative overflow-hidden rounded-[26px] bg-[linear-gradient(135deg,#0f9f55,#2fd176)] p-5 text-white shadow-[0_18px_40px_-16px_rgba(18,161,80,0.7)]"
            >
              <div aria-hidden className="absolute -right-8 -top-10 size-40 rounded-full bg-white/15 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-white/20">
                  {pool.status === "settled" ? <BadgeCheck className="size-6" /> : <PartyPopper className="size-6" />}
                </span>
                <div>
                  <p className="text-[19px] font-semibold tracking-[-0.02em]">{pool.status === "settled" ? t("settled") : t("funded")}</p>
                  <p className="text-[13.5px] text-white/85">{t("funded_sub")}</p>
                </div>
              </div>
            </motion.section>
          )}
          {pool.status === "failed" && (
            <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 rounded-[24px] bg-surface-2 p-4">
              <XCircle className="size-6 text-ink-3" />
              <div>
                <p className="text-[16px] font-semibold text-ink">{t("failed")}</p>
                <p className="text-[13px] text-ink-2">{t("failed_sub")}</p>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* price */}
        <section className="grid grid-cols-3 gap-2 rounded-[26px] bg-surface p-4 hairline shadow-[var(--shadow-soft)]">
          <div>
            <p className="text-[11.5px] font-medium text-ink-3">{t("base_price")}</p>
            <p className="tabular mt-1 text-[16px] font-medium text-ink-3 line-through decoration-1">{inr(pool.base_case_price_paise)}</p>
          </div>
          <div>
            <p className="text-[11.5px] font-medium text-ink-3">{t("pool_price")}</p>
            <p className="tabular mt-1 text-[16px] font-semibold text-ink">{inr(pool.case_price_paise)}</p>
          </div>
          <div>
            <p className="text-[11.5px] font-medium text-ink-3">{t("you_save")}</p>
            <p className="tabular mt-1 text-[16px] font-semibold text-ok">
              {inr(pool.savings_per_case_paise)}
              <span className="text-[11px] font-normal text-ink-3">/{t("case_one")}</span>
            </p>
          </div>
        </section>

        {/* why */}
        {mine?.reason && !committed && (
          <section className="rounded-[26px] bg-brand-soft p-4">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-ink">
              <Sparkles className="size-3.5" /> {t("forecast_why")}
            </p>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink">
              {lang === "hi"
                ? `${mine.reason.event} में माँग ${mine.reason.uplift}× रहेगी। आपके पास ${mine.reason.stock_units} units हैं — ${mine.reason.need_cases} case और चाहिए।`
                : `${mine.reason.event}: demand will be ${mine.reason.uplift}×. You have ${mine.reason.stock_units} units in stock — you need ${mine.reason.need_cases} more cases.`}
            </p>
          </section>
        )}

        {/* my order */}
        {committed && mine && (
          <section className="rounded-[26px] bg-surface p-4 hairline shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">{t("your_order")}</h2>
              <DeliveryChip status={mine.delivery_status} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label={t("cases")} value={String(mine.committed_cases)} />
              <Stat label={t("total")} value={inr(mine.amount_paise)} />
              <Stat label={t("you_save")} value={inr(mine.committed_cases * pool.savings_per_case_paise)} ok />
            </div>
            {mine.loan && (
              <p className="mt-3 flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
                <CircleDollarSign className="size-4 text-brand-ink" />
                Pool Credit {inr(mine.loan.amount_paise)} · {(mine.loan.rate_bps / 100).toFixed(1)}% · {mine.loan.tenure_days} {t("days")}
              </p>
            )}
            {mine.commit_tx && <TxBadge tx={mine.commit_tx} lang={lang} className="mt-3" />}
          </section>
        )}

        {/* join panel */}
        {open && remaining > 0 && (
          <section className="rounded-[28px] bg-surface p-5 hairline shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{committed ? (lang === "hi" ? "और case जोड़ें" : "Add more cases") : t("how_many")}</h2>
              {mine?.suggested_cases && !committed && (
                <button
                  onClick={() => setCases(mine.suggested_cases!)}
                  className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold transition", cases === mine.suggested_cases ? "bg-brand-soft text-brand-ink" : "bg-surface-2 text-ink-2")}
                >
                  <Sparkles className="mr-1 inline size-3" />
                  {t("suggested")}: {mine.suggested_cases}
                </button>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Stepper value={cases} onChange={setCases} max={Math.max(1, remaining)} label={t("how_many")} />
              <div className="text-right">
                <p className="tabular text-[22px] font-semibold tracking-[-0.03em] text-ink">{inr(amount)}</p>
                <p className="tabular text-[13px] font-medium text-ok">
                  {t("you_save")} {inr(cases * pool.savings_per_case_paise)}
                </p>
              </div>
            </div>

            <div className={cn("mt-5 rounded-[22px] p-4 transition-colors duration-300", useCredit ? "bg-ok-soft" : "bg-surface-2")}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-ink">{t("pay_later")}</p>
                  <p className="text-[12.5px] leading-snug text-ink-2">{t("pay_later_sub")}</p>
                </div>
                <Switch checked={useCredit} onChange={setCredit} label={t("pay_later")} />
              </div>
              <AnimatePresence initial={false}>
                {useCredit && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                    {offer.data ? (
                      <div className="pt-3">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <OfferStat label={t("rate")} value={`${(offer.data.rate_bps / 100).toFixed(1)}%`} />
                          <OfferStat label={t("tenure")} value={`${offer.data.tenure_days} ${t("days")}`} />
                          <OfferStat label={t("daily_cut")} value={`${(offer.data.daily_deduct_bps / 100).toFixed(0)}%`} />
                        </div>
                        <p className="mt-2.5 text-[12px] leading-snug text-ink-2">{lang === "hi" ? offer.data.reason_hi : offer.data.reason_en}</p>
                        {!offer.data.eligible && <p className="mt-1.5 text-[12px] font-medium text-danger">Limit {inr(offer.data.limit_paise)}</p>}
                      </div>
                    ) : (
                      <Skeleton className="mt-3 h-16 bg-white/60" />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {!useCredit && walletLow && <p className="mt-2.5 text-[12.5px] font-medium text-warn">{t("wallet_low")}</p>}
            {!useCredit && home.data && !walletLow && (
              <p className="mt-2.5 text-[12.5px] text-ink-3">
                {t("from_wallet")} · {t("balance")} {inr(wallet)}
              </p>
            )}

            <Button size="xl" variant="primary" className="mt-5 w-full" onClick={join} loading={joining}>
              {committed ? (lang === "hi" ? "और जोड़ें" : "Add to my order") : t("join_pool")} · {cases} {t("cases")}
            </Button>
          </section>
        )}

        {/* activity */}
        {joinsList.length > 0 && (
          <section className="rounded-[26px] bg-surface p-4 hairline shadow-[var(--shadow-soft)]">
            <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">{lang === "hi" ? "हाल की हलचल" : "Live activity"}</h2>
            <ul>
              <AnimatePresence initial={false}>
                {joinsList.map((j) => (
                  <motion.li
                    key={j.at + j.cases}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 overflow-hidden border-b border-line py-2.5 last:border-0"
                  >
                    <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-ink-3">
                      <Store className="size-4" />
                    </span>
                    <span className="flex-1 text-[14px] text-ink">{lang === "hi" ? "एक दुकान जुड़ी" : "A shop joined"}</span>
                    <span className="tabular text-[14px] font-semibold text-brand-ink">+{j.cases}</span>
                    <span className="w-20 text-right text-[12px] text-ink-3">{now ? relTime(j.at, now, lang) : ""}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        )}

        {/* trust footer */}
        <section className="space-y-2 px-1 pb-2 text-[12.5px] leading-snug text-ink-3">
          <p className="flex gap-2">
            <EyeOff className="mt-px size-3.5 shrink-0" /> {t("privacy_note")}
          </p>
          <p className="flex gap-2">
            <Truck className="mt-px size-3.5 shrink-0" /> {pool.distributor.name}
          </p>
          {pool.chain.contract_url && (
            <a href={pool.chain.contract_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ink-2 underline-offset-2 hover:underline">
              <ExternalLink className="size-3.5" /> Escrow {shortHash(pool.chain.contract_address, 8)} · pool {shortHash(pool.chain.pool_id_hex, 8)}
            </a>
          )}
        </section>
      </div>

      <Sheet open={!!action} onClose={() => setAction(null)} title={t("confirm_title")}>
        {action && (
          <ConfirmCard
            action={action}
            sku={pool.sku}
            onDone={() => {
              myJoinAt.current = Date.now();
              setCases(null);
            }}
            onCancel={() => setAction(null)}
          />
        )}
        {action && (
          <Button variant="ghost" size="md" className="mx-auto mt-3 flex" onClick={() => setAction(null)}>
            {t("done")}
          </Button>
        )}
      </Sheet>
    </div>
  );
}

function StatusPill({ pool }: { pool: Pool }) {
  const { t } = useLang();
  const map = {
    open: { c: "bg-brand-soft text-brand-ink", l: `−${pct(pool.disc_bps)} scheme` },
    funded: { c: "bg-ok-soft text-ok", l: t("funded") },
    settled: { c: "bg-ok-soft text-ok", l: t("settled") },
    failed: { c: "bg-surface-2 text-ink-3", l: t("failed") },
    draft: { c: "bg-surface-2 text-ink-3", l: "Draft" },
  }[pool.status];
  return (
    <motion.span key={pool.status} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn("rounded-full px-3 py-1 text-[12.5px] font-semibold", map.c)}>
      {map.l}
    </motion.span>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3 py-2.5">
      <p className="text-[11.5px] text-ink-3">{label}</p>
      <p className={cn("tabular mt-0.5 text-[15px] font-semibold", ok ? "text-ok" : "text-ink")}>{value}</p>
    </div>
  );
}

function OfferStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 px-2 py-2 dark:bg-white/5">
      <p className="tabular text-[15px] font-semibold text-ink">{value}</p>
      <p className="text-[11px] text-ink-3">{label}</p>
    </div>
  );
}

function DeliveryChip({ status }: { status: DeliveryStatus | null }) {
  const { lang } = useLang();
  if (!status) return null;
  const m = {
    pending: { c: "bg-warn-soft text-warn", hi: "Delivery बाकी", en: "Delivery pending" },
    delivered: { c: "bg-ok-soft text-ok", hi: "Delivered", en: "Delivered" },
    refunded: { c: "bg-surface-2 text-ink-3", hi: "Refund हुआ", en: "Refunded" },
  }[status];
  return <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-semibold", m.c)}>{lang === "hi" ? m.hi : m.en}</span>;
}
