"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { useRef, useState } from "react";
import { cn } from "@/lib/format";
import { easeOutExpo } from "@/lib/motion";
import { Eyebrow } from "./Reveal";
import { CreditViz, EscrowViz, ForecastViz, PoolViz, QrViz, TrustViz, VoiceViz } from "./HowVisuals";

const STEPS = [
  {
    k: "Forecast",
    hi: "अनुमान",
    title: "Knows what you’ll sell before you do",
    body: "Chronos-2 forecasts each shop’s Paytm sales, split by category and lifted by festivals. Every number comes with a plain-language reason.",
    Viz: ForecastViz,
  },
  {
    k: "Pool",
    hi: "पूल",
    title: "Nearby shops become one big order",
    body: "The pool engine groups shops on the same streets that need the same item, and sets a target at the distributor’s next discount slab.",
    Viz: PoolViz,
  },
  {
    k: "Commit by voice",
    hi: "बोलकर",
    title: "Say it in Hindi. Tap confirm.",
    body: "Mohalla Saathi understands Hindi and Hinglish, proposes the order, and never moves money without an explicit confirm.",
    Viz: VoiceViz,
  },
  {
    k: "Pool Credit",
    hi: "क्रेडिट",
    title: "Short on cash? Pay later.",
    body: "An instant, explainable working-capital offer for exactly this order — repaid in small cuts from daily settlements.",
    Viz: CreditViz,
  },
  {
    k: "Escrow",
    hi: "एस्क्रो",
    title: "All or nothing. Nobody holds the money.",
    body: "Commitments sit in a smart-contract escrow on Sepolia. If the pool fills, the slab is locked. If not, everyone is refunded.",
    Viz: EscrowViz,
  },
  {
    k: "Delivery QR",
    hi: "डिलीवरी",
    title: "Scan on delivery. Get paid on delivery.",
    body: "The shop scans the distributor’s QR at the door. That releases its share — minus a 1% fee — straight from escrow.",
    Viz: QrViz,
  },
  {
    k: "Trust Score",
    hi: "भरोसा",
    title: "Every honoured order builds credit",
    body: "Deliveries and commitments become on-chain attestations — a Trade Trust Score anyone can verify, and the shop can carry anywhere.",
    Viz: TrustViz,
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 40, mass: 0.4 });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const i = Math.min(STEPS.length - 1, Math.max(0, Math.floor(p * STEPS.length * 0.999)));
    setActive((prev) => (prev === i ? prev : i));
  });
  const step = STEPS[active];

  return (
    <section id="how" aria-label="How it works" className="relative">
      <div ref={ref} style={{ height: `${STEPS.length * 70 + 40}vh` }} className="relative">
        <div className="sticky top-0 flex h-dvh items-center overflow-hidden">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 pt-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:pt-0">
            {/* left: step list */}
            <div>
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-3 text-[26px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-[44px]">
                Seven steps. <span className="hidden text-ink-3 sm:inline">One tap for the shopkeeper.</span>
              </h2>

              {/* desktop list */}
              <ol className="relative mt-10 hidden lg:block">
                <div className="absolute bottom-2 left-[11px] top-2 w-px bg-line" aria-hidden />
                <motion.div
                  aria-hidden
                  className="absolute left-[11px] top-2 w-px origin-top bg-brand"
                  style={{ scaleY: progress, height: "calc(100% - 16px)" }}
                />
                {STEPS.map((s, i) => (
                  <li key={s.k} className="relative pl-10">
                    <span
                      className={cn(
                        "absolute left-0 top-[9px] grid size-[23px] place-items-center rounded-full text-[11px] font-semibold transition-colors duration-500",
                        i < active && "bg-brand text-white",
                        i === active && "bg-navy text-white ring-4 ring-brand-soft",
                        i > active && "bg-surface text-ink-3 hairline",
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className={cn("py-2 transition-opacity duration-500", i === active ? "opacity-100" : "opacity-45")}>
                      <p className="flex items-baseline gap-2 text-[17px] font-semibold tracking-[-0.015em] text-ink">
                        {s.k}
                        <span lang="hi" className="lang-hi text-[13px] font-normal text-ink-3">
                          {s.hi}
                        </span>
                      </p>
                      <motion.div
                        initial={false}
                        animate={{ height: i === active ? "auto" : 0, opacity: i === active ? 1 : 0 }}
                        transition={{ duration: 0.45, ease: easeOutExpo }}
                        className="overflow-hidden"
                      >
                        <p className="max-w-md pt-1.5 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
                      </motion.div>
                    </div>
                  </li>
                ))}
              </ol>

              {/* mobile: active step only */}
              <div className="mt-6 lg:hidden">
                <div className="flex gap-1.5" aria-hidden>
                  {STEPS.map((s, i) => (
                    <span
                      key={s.k}
                      className={cn("h-1 flex-1 rounded-full transition-colors duration-500", i <= active ? "bg-brand" : "bg-surface-3")}
                    />
                  ))}
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step.k}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                    className="mt-3 min-h-[104px]"
                  >
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-ink">
                      {active + 1} / {STEPS.length} · {step.k}
                    </p>
                    <p className="mt-1.5 text-[19px] font-semibold tracking-[-0.02em] text-ink">{step.title}</p>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{step.body}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* right: visual */}
            <div className="relative">
              <div className="relative flex h-[min(50dvh,440px)] items-center justify-center overflow-hidden rounded-[32px] bg-gradient-to-b from-surface to-[#f0f5fa] p-6 hairline shadow-[var(--shadow-lift)] sm:p-10 lg:h-[520px]">
                <div
                  aria-hidden
                  className="absolute -top-24 left-1/2 h-64 w-[120%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,186,242,0.12),transparent)]"
                />
                <p className="absolute left-6 top-5 hidden text-[13px] font-medium text-ink-3 lg:block">
                  <span className="tabular text-ink">{String(active + 1).padStart(2, "0")}</span> — {step.title}
                </p>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step.k}
                    initial={{ opacity: 0, y: 24, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -16, scale: 0.98, transition: { duration: 0.22 } }}
                    transition={{ duration: 0.6, ease: easeOutExpo }}
                    className="relative flex w-full origin-center justify-center max-sm:scale-[0.84]"
                  >
                    <step.Viz />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
