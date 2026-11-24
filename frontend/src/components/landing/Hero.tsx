"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { easeOutExpo } from "@/lib/motion";
import { MohallaVisual } from "./MohallaVisual";

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.9, ease: easeOutExpo, delay },
});

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-28 sm:pt-32 lg:pb-28 lg:pt-36">
      {/* ambient light */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[560px] w-[980px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,186,242,0.16),transparent)]" />
        <div className="absolute right-[-10%] top-40 h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(0,46,110,0.08),transparent)]" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div>
          <motion.p
            {...rise(0)}
            className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hairline shadow-[var(--shadow-soft)]"
          >
            <span className="size-1.5 rounded-full bg-brand" />
            Built for Paytm merchants
          </motion.p>
          <motion.h1
            {...rise(0.06)}
            className="mt-6 text-balance text-[40px] font-semibold leading-[1.02] tracking-[-0.045em] text-ink sm:text-[56px] lg:text-[64px]"
          >
            One kirana is small.{" "}
            <span className="text-gradient-brand">Fifty kiranas buy like a supermarket chain.</span>
          </motion.h1>
          <motion.p {...rise(0.14)} className="mt-6 max-w-xl text-pretty text-[17px] leading-relaxed text-ink-2 sm:text-[19px]">
            Mohalla is an AI buying co-op for neighbourhood shops. It forecasts what each kirana will need, pools nearby
            shops into one bulk order to unlock distributor discounts, and holds the money in escrow until delivery —
            all by voice, in Hindi.
          </motion.p>
          <motion.p {...rise(0.18)} lang="hi" className="lang-hi mt-3 text-[15px] text-ink-3">
            एक दुकान छोटी है — पूरा मोहल्ला मिलकर बड़ा है।
          </motion.p>
          <motion.div {...rise(0.24)} className="mt-9 flex flex-wrap items-center gap-3">
            <motion.span whileTap={{ scale: 0.97 }} whileHover={{ y: -1 }} className="inline-flex">
              <Link
                href="/login"
                className="group inline-flex h-12 items-center gap-2 rounded-2xl bg-navy px-6 text-[15px] font-medium text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_14px_30px_-12px_rgba(0,46,110,0.7)] transition-colors hover:bg-navy-2"
              >
                Open the live demo
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </motion.span>
            <motion.span whileTap={{ scale: 0.97 }} className="inline-flex">
              <a
                href="#how"
                className="inline-flex h-12 items-center gap-1.5 rounded-2xl bg-surface px-5 text-[15px] font-medium text-ink hairline transition-colors hover:bg-surface-2"
              >
                How it works <ChevronDown className="size-4 text-ink-3" aria-hidden />
              </a>
            </motion.span>
          </motion.div>
          <motion.dl {...rise(0.32)} className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-line pt-6">
            {[
              ["6%", "slab discount unlocked"],
              ["₹0", "gas paid by merchants"],
              ["≥5", "shops per pool, always"],
            ].map(([k, v]) => (
              <div key={v}>
                <dt className="sr-only">{v}</dt>
                <dd className="tabular text-[24px] font-semibold tracking-[-0.03em] text-ink">{k}</dd>
                <dd className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{v}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1.1, ease: easeOutExpo, delay: 0.15 }}
        >
          <MohallaVisual />
        </motion.div>
      </div>
    </section>
  );
}
