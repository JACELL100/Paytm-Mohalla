"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, Cpu, Loader2, X } from "lucide-react";
import { Skeleton } from "@/components/ui/primitives";
import { TX_KIND_LABEL } from "@/components/ui/TxBadge";
import { cn, relTime, shortHash } from "@/lib/format";
import type { TxRef } from "@/lib/types";

function StatusDot({ s }: { s: TxRef["status"] }) {
  if (s === "pending" || s === "sent")
    return (
      <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-brand-ink">
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    );
  if (s === "failed")
    return (
      <span className="grid size-7 place-items-center rounded-full bg-danger-soft text-danger">
        <X className="size-3.5" />
      </span>
    );
  return (
    <span className="grid size-7 place-items-center rounded-full bg-ok-soft text-ok">
      {s === "simulated" ? <Cpu className="size-3.5" /> : <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}

export function TxFeed({ txs, now }: { txs: TxRef[] | undefined; now: number }) {
  return (
    <div className="flex h-full flex-col rounded-3xl bg-surface p-5 hairline shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">On-chain activity</p>
          <p className="text-[12.5px] text-ink-3">Sepolia · gasless relays by Mohalla</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ok">
          <span className="relative flex size-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative size-1.5 rounded-full bg-ok" />
          </span>
          Live
        </span>
      </div>
      <div className="no-scrollbar mt-3 -mx-2 min-h-0 flex-1 overflow-y-auto" style={{ maxHeight: 300 }}>
        {!txs ? (
          <div className="space-y-2 px-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : txs.length === 0 ? (
          <p className="px-2 py-8 text-center text-[13px] text-ink-3">No transactions yet</p>
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {txs.map((t) => (
                <motion.li
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: -10, backgroundColor: "var(--brand-soft)" }}
                  animate={{ opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], backgroundColor: { duration: 2 } }}
                  className="flex items-center gap-3 rounded-xl px-2 py-2"
                >
                  <StatusDot s={t.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{TX_KIND_LABEL[t.kind]}</p>
                    <p className="truncate font-mono text-[11px] text-ink-3">
                      {t.tx_hash ? shortHash(t.tx_hash, 8) : t.status === "pending" ? "queued in outbox…" : "—"}
                    </p>
                  </div>
                  <span className={cn("shrink-0 text-[11.5px] tabular text-ink-3")}>{now ? relTime(t.created_at, now) : ""}</span>
                  {t.explorer_url ? (
                    <a
                      href={t.explorer_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`View ${TX_KIND_LABEL[t.kind]} on explorer`}
                      className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-surface-2 hover:text-ink"
                    >
                      <ArrowUpRight className="size-4" />
                    </a>
                  ) : (
                    <span className="size-7 shrink-0" />
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}
