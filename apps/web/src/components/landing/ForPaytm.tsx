"use client";

import { motion } from "motion/react";
import { Percent, Landmark, Megaphone, Radio } from "lucide-react";
import { easeOutExpo } from "@/lib/motion";
import { Eyebrow, Reveal } from "./Reveal";

const MODEL = [
  { icon: Percent, title: "Fee on pooled GMV", body: "1–2% on every pooled order, paid by the distributor — who gets guaranteed payment and bigger drops." },
  { icon: Landmark, title: "Lending distribution", body: "Pool Credit is a high-intent, short-tenor loan with a known use and auto-repayment from settlements." },
  { icon: Megaphone, title: "Brand schemes", body: "FMCG brands pay to put their schemes in front of ready-to-buy pools on the right streets." },
  { icon: Radio, title: "AI Soundbox engagement", body: "A new skill for the Soundbox: it already reports what happened — Mohalla acts on what’s coming." },
];

const ROWS: [string, string, string?][] = [
  ["Pool size", "40 cases × ₹1,500"],
  ["Pooled GMV", "₹60,000"],
  ["Shops’ saving at the 6% slab", "₹3,600", "shared across 12 shops"],
  ["Paytm fee at 1%", "₹600", "+ lending fee on the financed share"],
];

export function ForPaytm() {
  return (
    <section id="paytm" className="scroll-mt-24 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow>For Paytm</Eyebrow>
          <h2 className="mt-4 text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-[48px]">
            Only Paytm has the whole street.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-ink-2">
            Payment data for every shop on the block, a Soundbox on every counter to reach them, and a lending book to fund
            them. Mohalla turns those into a network that gets stronger with every shop that joins.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            {MODEL.map((m, i) => (
              <motion.article
                key={m.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "0px 0px -10% 0px" }}
                transition={{ duration: 0.8, ease: easeOutExpo, delay: i * 0.07 }}
                whileHover={{ y: -4 }}
                className="rounded-[28px] bg-surface p-6 hairline shadow-[var(--shadow-soft)] transition-shadow duration-300 hover:shadow-[var(--shadow-lift)]"
              >
                <span className="grid size-10 place-items-center rounded-2xl bg-brand-soft text-brand-ink">
                  <m.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.015em] text-ink">{m.title}</h3>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{m.body}</p>
              </motion.article>
            ))}
          </div>

          <Reveal delay={0.15} className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0a3d85] via-navy to-[#001634] p-7 text-white shadow-[var(--shadow-float)]">
            <div aria-hidden className="absolute -right-20 -top-20 size-64 rounded-full bg-brand/25 blur-3xl" />
            <div className="relative">
              <p className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-medium uppercase tracking-[0.1em] text-white/75">
                Illustrative · assumptions
              </p>
              <h3 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">One pool, in numbers</h3>
              <dl className="mt-6 divide-y divide-white/10">
                {ROWS.map(([k, v, note]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 py-3.5">
                    <dt className="text-[14px] text-white/70">
                      {k}
                      {note && <span className="block text-[12px] text-white/45">{note}</span>}
                    </dt>
                    <dd className="tabular shrink-0 text-[18px] font-semibold tracking-[-0.02em]">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 text-[12.5px] leading-relaxed text-white/55">
                Assumed prices and fees for illustration only. In production, rupees sit with a regulated escrow bank and a
                partner NBFC lends; the chain is the rulebook and audit trail.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
