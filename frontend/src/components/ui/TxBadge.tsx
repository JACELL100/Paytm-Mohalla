"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ExternalLink, Loader2, X, Cpu } from "lucide-react";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { cn, shortHash } from "@/lib/format";
import type { Lang, TxRef } from "@/lib/types";

const L = {
  pending: { hi: "Sepolia पर दर्ज हो रहा है…", en: "Recording on Sepolia…" },
  sent: { hi: "Block का इंतज़ार…", en: "Waiting for block…" },
  confirmed: { hi: "Chain पर पक्का", en: "Confirmed on-chain" },
  simulated: { hi: "दर्ज (simulated)", en: "Recorded (simulated)" },
  failed: { hi: "Chain पर अटका — फिर कोशिश होगी", en: "Chain write failed — will retry" },
  view: { hi: "Etherscan", en: "Etherscan" },
};

const KIND: Record<TxRef["kind"], string> = {
  create_pool: "Pool created",
  permit: "Permit",
  commit: "Commitment",
  mint: "Credit disbursed",
  deliver: "Delivery payout",
  refund: "Refund",
  mark_failed: "Pool closed",
  attest: "Attestation",
};

export function useTx(tx: TxRef | null | undefined) {
  const live = tx && (tx.status === "pending" || tx.status === "sent");
  const q = useQuery<TxRef>(tx && live ? `tx:${tx.id}` : null, () => api.tx(tx!.id), { interval: 1000, staleMs: 0 });
  if (!tx) return null;
  return q.data && q.data.id === tx.id ? q.data : tx;
}

export function TxBadge({ tx: initial, lang = "en", className, showKind }: { tx: TxRef; lang?: Lang; className?: string; showKind?: boolean }) {
  const tx = useTx(initial) ?? initial;
  const s = tx.status;
  const busy = s === "pending" || s === "sent";
  const ok = s === "confirmed" || s === "simulated";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3.5 py-3 transition-colors duration-500",
        busy && "bg-brand-soft",
        ok && "bg-ok-soft",
        s === "failed" && "bg-danger-soft",
        className,
      )}
    >
      <div className="relative grid size-8 shrink-0 place-items-center">
        <AnimatePresence mode="popLayout" initial={false}>
          {busy && (
            <motion.span key="busy" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} className="grid size-8 place-items-center rounded-full bg-brand/15 text-brand-ink">
              <Loader2 className="size-4 animate-spin" />
            </motion.span>
          )}
          {ok && (
            <motion.span
              key="ok"
              initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
              className="grid size-8 place-items-center rounded-full bg-ok text-white"
            >
              {s === "simulated" ? <Cpu className="size-4" /> : <Check className="size-4" strokeWidth={3} />}
            </motion.span>
          )}
          {s === "failed" && (
            <motion.span key="fail" initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="grid size-8 place-items-center rounded-full bg-danger text-white">
              <X className="size-4" />
            </motion.span>
          )}
        </AnimatePresence>
        {busy && <span className="absolute inset-0 animate-pulse-ring rounded-full border border-brand/50" />}
      </div>
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={s}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22 }}
            className={cn("text-[14px] font-medium leading-tight", ok ? "text-ok" : s === "failed" ? "text-danger" : "text-brand-ink")}
          >
            {L[s][lang]}
          </motion.p>
        </AnimatePresence>
        <p className="mt-0.5 truncate font-mono text-[11.5px] text-ink-3">
          {showKind && <span className="mr-1.5 font-sans">{KIND[tx.kind]} ·</span>}
          {tx.tx_hash ? shortHash(tx.tx_hash, 10) : "gasless · relayed by Mohalla"}
        </p>
      </div>
      {tx.explorer_url && (
        <a
          href={tx.explorer_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink hairline transition hover:bg-surface-2"
        >
          {L.view[lang]} <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}

export { KIND as TX_KIND_LABEL };
