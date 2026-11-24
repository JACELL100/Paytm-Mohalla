"use client";

import { AnimatePresence, motion } from "motion/react";
import { Fuel, ShieldCheck, Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { invalidate } from "@/lib/query";
import { useLang } from "@/lib/i18n";
import { useDemoNow } from "@/lib/clock";
import { cn, inr, mmss } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { TxBadge } from "@/components/ui/TxBadge";
import { toast } from "@/components/ui/Toaster";
import type { ConfirmResponse, PendingAction, Sku } from "@/lib/types";

function Row({ label, value, strong, tone }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; tone?: "ok" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-[14px] text-ink-2">{label}</span>
      <span className={cn("tabular text-right", strong ? "text-[17px] font-semibold text-ink" : "text-[14.5px] font-medium text-ink", tone === "ok" && "text-ok")}>{value}</span>
    </div>
  );
}

export function SuccessCheck({ size = 72 }: { size?: number }) {
  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
      className="relative grid place-items-center rounded-full bg-ok text-white shadow-[0_14px_30px_-10px_rgba(18,161,80,0.8)]"
      style={{ width: size, height: size }}
    >
      <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-ok/50" />
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" aria-hidden>
        <motion.path
          d="M5 12.5l4.2 4.2L19 7"
          stroke="currentColor"
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.18, duration: 0.45, ease: "easeOut" }}
        />
      </svg>
    </motion.div>
  );
}

/** Review → confirm → on-chain receipt for a PendingAction. Used in the pool sheet and inline in Saathi chat. */
export function ConfirmCard({
  action,
  sku,
  onDone,
  onCancel,
  compact,
  autoConfirm = 0,
}: {
  autoConfirm?: number;
  action: PendingAction;
  sku?: Sku | null;
  onDone?: (r: ConfirmResponse) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const { lang, t } = useLang();
  const now = useDemoNow();
  const [state, setState] = useState<"review" | "busy" | "done" | "cancelled">("review");
  const [result, setResult] = useState<ConfirmResponse | null>(null);
  const p = action.payload;
  const left = now ? new Date(action.expires_at).getTime() - now : 0;

  useEffect(() => {
    if (state === "done" && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(30);
  }, [state]);

  const confirm = async () => {
    setState("busy");
    try {
      const r = await api.confirmAction(action.id);
      setResult(r);
      setState("done");
      onDone?.(r);
      void invalidate("m:");
      void invalidate("pool:");
    } catch (e) {
      setState("review");
      toast(lang === "hi" ? "पक्का नहीं हो पाया" : "Couldn't confirm", { body: errorMessage(e), tone: "error" });
    }
  };
  // Voice "haan" → confirm without a tap.
  const lastAuto = useRef(0);
  useEffect(() => {
    if (autoConfirm > lastAuto.current) {
      lastAuto.current = autoConfirm;
      if (state === "review") setTimeout(() => void confirm(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConfirm]);

  const cancel = async () => {
    setState("cancelled");
    api.cancelAction(action.id).catch(() => {});
    onCancel?.();
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {state === "done" && result ? (
        <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center text-center">
          <SuccessCheck size={compact ? 56 : 72} />
          <p className={cn("mt-4 font-semibold tracking-[-0.02em] text-ink", compact ? "text-[18px]" : "text-[22px]")}>{t("you_are_in")}</p>
          <p className="mt-1 text-[14px] text-ink-2">
            {p.cases} {t("cases")} · {inr(p.amount_paise)} · <span className="text-ok">{t("you_save")} {inr(p.savings_paise)}</span>
          </p>
          <TxBadge tx={result.tx} lang={lang} className="mt-5 w-full text-left" />
          {result.loan && (
            <p className="mt-3 text-[12.5px] text-ink-3">
              Pool Credit {inr(result.loan.amount_paise)} · {(result.loan.rate_bps / 100).toFixed(1)}% · {result.loan.tenure_days} {t("days")}
            </p>
          )}
        </motion.div>
      ) : state === "cancelled" ? (
        <motion.p key="x" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-2 text-center text-[13px] text-ink-3">
          {lang === "hi" ? "रद्द किया गया" : "Cancelled"}
        </motion.p>
      ) : (
        <motion.div key="review" exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.18 }}>
          {sku && (
            <div className="mb-3 flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-[26px]">{sku.emoji}</span>
              <div>
                <p className="text-[16px] font-semibold text-ink">{sku.name}</p>
                <p className="text-[13px] text-ink-3">
                  {p.cases} × {sku.case_size} units
                </p>
              </div>
            </div>
          )}
          <p className="rounded-2xl bg-surface-2 p-3.5 text-[14.5px] leading-relaxed text-ink">{lang === "hi" ? action.summary_hi : action.summary_en}</p>
          <div className="mt-2 divide-y divide-line">
            <Row label={t("cases")} value={p.cases} />
            <Row label={t("total")} value={inr(p.amount_paise)} strong />
            <Row label={t("you_save")} value={inr(p.savings_paise)} tone="ok" />
            {p.use_credit && p.credit && (
              <>
                <Row label={`Pool Credit · ${t("rate")}`} value={`${(p.credit.rate_bps / 100).toFixed(1)}% p.a.`} />
                <Row label={t("daily_cut")} value={`${(p.credit.daily_deduct_bps / 100).toFixed(0)}% ${t("of_settlements")}`} />
                <Row label={t("tenure")} value={`${p.credit.tenure_days} ${t("days")}`} />
              </>
            )}
            {!p.use_credit && <Row label={lang === "hi" ? "भुगतान" : "Payment"} value={t("from_wallet")} />}
          </div>
          <div className="mt-3 space-y-1.5 text-[12.5px] leading-snug text-ink-3">
            <p className="flex gap-2"><ShieldCheck className="mt-px size-3.5 shrink-0 text-ok" /> {t("escrow_note")}</p>
            <p className="flex gap-2"><Fuel className="mt-px size-3.5 shrink-0 text-brand-ink" /> {t("no_gas")}</p>
            {now > 0 && left > 0 && (
              <p className="flex gap-2"><Clock className="mt-px size-3.5 shrink-0" /> {lang === "hi" ? "ऑफ़र खत्म होगा" : "Offer expires in"} <span className="tabular">{mmss(left)}</span></p>
            )}
          </div>
          <div className={cn("mt-5 grid gap-2.5", compact ? "grid-cols-[1fr_1.6fr]" : "grid-cols-[1fr_2fr]")}>
            <Button variant="secondary" size="lg" onClick={cancel} disabled={state === "busy"}>
              {t("cancel")}
            </Button>
            <Button variant="primary" size="lg" onClick={confirm} loading={state === "busy"}>
              {t("confirm")} · {inr(p.amount_paise)}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
