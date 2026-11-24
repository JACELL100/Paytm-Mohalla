"use client";

import { motion } from "motion/react";
import { Lock, Fuel, EyeOff, Check, RotateCcw } from "lucide-react";
import { easeOutExpo } from "@/lib/motion";
import { Eyebrow, Reveal } from "./Reveal";

const PILLARS = [
  {
    icon: Lock,
    title: "All-or-nothing escrow",
    body: "Matches how slab schemes work. Money is pooled in a smart contract that even Paytm can’t move without the shop’s signature. Miss the target, and everyone gets every rupee back.",
  },
  {
    icon: Fuel,
    title: "Gasless. Crypto-free.",
    body: "Merchants sign off-chain (EIP-712); one operator wallet relays and pays all gas. The shopkeeper sees rupees, a confirm button and a receipt — never a wallet.",
  },
  {
    icon: EyeOff,
    title: "Private by design",
    body: "A pool only exists with 5 or more shops. Members see totals, never another shop’s name or sales. Data use is consented, in line with the DPDP Act.",
  },
];

const STATES = [
  { label: "Open", sub: "Shops commit", tone: "bg-brand-soft text-brand-ink" },
  { label: "Funded", sub: "Target reached", tone: "bg-navy text-white" },
  { label: "Delivered", sub: "Paid per scan", tone: "bg-ok text-white" },
];

export function Trustless() {
  return (
    <section id="trust" className="scroll-mt-24 bg-surface py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow>Trustless by design</Eyebrow>
          <h2 className="mt-4 text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-[48px]">
            Fifty strangers can buy together <span className="text-ink-3">— because nobody has to trust anybody.</span>
          </h2>
        </Reveal>

        {/* state machine */}
        <Reveal delay={0.1} className="mt-14 rounded-[32px] bg-bg p-6 hairline sm:p-10">
          <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center">
            {STATES.map((s, i) => (
              <div key={s.label} className="flex flex-1 flex-col items-stretch gap-4 md:flex-row md:items-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.25, type: "spring", stiffness: 300, damping: 22 }}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-4 hairline shadow-[var(--shadow-soft)] md:flex-1"
                >
                  <span className={`grid size-9 place-items-center rounded-xl text-[13px] font-semibold ${s.tone}`}>{i + 1}</span>
                  <div>
                    <p className="text-[15px] font-semibold text-ink">{s.label}</p>
                    <p className="text-[12.5px] text-ink-3">{s.sub}</p>
                  </div>
                </motion.div>
                {i < STATES.length - 1 && (
                  <div className="relative mx-auto h-8 w-px overflow-hidden bg-line-strong md:mx-0 md:h-px md:w-12" aria-hidden>
                    <motion.span
                      className="absolute left-0 top-0 size-full bg-brand"
                      initial={{ scaleX: 0, scaleY: 0 }}
                      whileInView={{ scaleX: 1, scaleY: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.4 + i * 0.25, duration: 0.5, ease: easeOutExpo }}
                      style={{ originX: 0, originY: 0 }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2.5 rounded-2xl bg-surface-2 px-4 py-3 text-[13.5px] text-ink-2">
            <RotateCcw className="size-4 shrink-0 text-ink-3" aria-hidden />
            Deadline passes before the target, or the distributor never delivers? <b className="font-semibold text-ink">Automatic full refund.</b>
          </div>
        </Reveal>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <motion.article
              key={p.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px" }}
              transition={{ duration: 0.8, ease: easeOutExpo, delay: i * 0.08 }}
              whileHover={{ y: -4 }}
              className="rounded-[28px] bg-bg p-7 hairline transition-shadow duration-300 hover:shadow-[var(--shadow-lift)]"
            >
              <span className="grid size-10 place-items-center rounded-2xl bg-navy text-white">
                <p.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-6 text-[18px] font-semibold tracking-[-0.02em] text-ink">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{p.body}</p>
            </motion.article>
          ))}
        </div>

        <Reveal delay={0.1} className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-3">
          {["Verified contracts on Etherscan", "1% fee visible on-chain", "Signatures, not custody", "Refunds are permissionless"].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-ok" aria-hidden /> {t}
            </span>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
