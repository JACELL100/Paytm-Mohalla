"use client";

import { motion, useReducedMotion } from "motion/react";
import { Lock, Unlock } from "lucide-react";
import { cn, pct } from "@/lib/format";
import { NumberTicker } from "@/components/ui/primitives";
import { useLang } from "@/lib/i18n";
import type { Pool } from "@/lib/types";

/**
 * The hero "tank": a fluid fill toward the target with the slab ladder on it.
 * Fill is a full-width layer translated on X (transform only), with a sweeping sheen.
 */
export function PoolProgress({ pool, pendingMine = 0 }: { pool: Pool; pendingMine?: number }) {
  const { t } = useLang();
  const reduce = useReducedMotion();
  const target = pool.target_cases;
  const p = Math.min(1, pool.committed_cases / target);
  const ghost = Math.min(1, (pool.committed_cases + pendingMine) / target);
  const full = pool.status === "funded" || pool.status === "settled" || p >= 1;
  const failed = pool.status === "failed";

  return (
    <div>
      <div className="flex items-end justify-between">
        <p className="leading-none">
          <span className={cn("text-[52px] font-semibold tracking-[-0.05em]", full ? "text-ok" : "text-ink")}>
            <NumberTicker value={pool.committed_cases} from={Math.max(0, pool.committed_cases - 3)} duration={0.9} />
          </span>
          <span className="ml-1.5 text-[19px] font-medium tracking-[-0.02em] text-ink-3">
            / {target} {t("cases")}
          </span>
        </p>
        <p className="pb-1.5 text-[13px] font-medium text-ink-2">{Math.round(p * 100)}%</p>
      </div>

      <div className="relative mt-4 h-[18px]">
        <div className="absolute inset-0 overflow-hidden rounded-full bg-surface-3 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]">
          {/* ghost: what my pending selection would add */}
          {ghost > p && !full && (
            <motion.div
              className="absolute inset-0 rounded-full bg-brand/25"
              initial={false}
              animate={{ x: `${(ghost - 1) * 100}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 26 }}
            />
          )}
          <motion.div
            className={cn(
              "absolute inset-0 overflow-hidden rounded-full",
              failed ? "bg-ink-3" : full ? "bg-[linear-gradient(90deg,#0f9f55,#2fd176)]" : "bg-[linear-gradient(90deg,#0A6BD6,#22C6FF)]",
            )}
            initial={{ x: "-100%" }}
            animate={{ x: `${(p - 1) * 100}%` }}
            transition={{ type: "spring", stiffness: 70, damping: 16, mass: 1.1 }}
          >
            {!reduce && !failed && (
              <motion.div
                className="absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)]"
                animate={{ x: ["-100%", "320%"] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.8 }}
              />
            )}
            <div className="absolute inset-x-0 top-0 h-1/2 bg-white/15" />
          </motion.div>
        </div>
        {/* slab markers */}
        {pool.slabs.map((s) => {
          const at = Math.min(1, s.min_cases / target);
          if (at >= 1) return null;
          return <span key={s.min_cases} className="absolute top-[-3px] h-[24px] w-[2px] -translate-x-1/2 rounded-full bg-surface" style={{ left: `${at * 100}%` }} aria-hidden />;
        })}
      </div>

      {/* ladder */}
      <div className="relative mt-3 h-12">
        {pool.slabs.map((s) => {
          const at = Math.min(1, s.min_cases / target);
          const on = pool.committed_cases >= s.min_cases;
          return (
            <div
              key={s.min_cases}
              className={cn("absolute top-0 flex flex-col", at >= 1 ? "items-end" : "-translate-x-1/2 items-center")}
              style={at >= 1 ? { right: 0 } : { left: `${at * 100}%` }}
            >
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold transition-colors duration-500",
                  on ? "bg-ok-soft text-ok" : "bg-surface-2 text-ink-2",
                )}
              >
                {on ? <Unlock className="size-3" /> : <Lock className="size-3" />}−{pct(s.disc_bps)}
              </span>
              <span className="mt-1 text-[11.5px] text-ink-3">
                {s.min_cases} {t("cases")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
