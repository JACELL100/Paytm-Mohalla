"use client";

import { motion } from "motion/react";
import { ShoppingBag, Layers, HandCoins } from "lucide-react";
import { NumberTicker } from "@/components/ui/primitives";
import { easeOutExpo } from "@/lib/motion";
import { Eyebrow, Reveal } from "./Reveal";

const CARDS = [
  {
    icon: ShoppingBag,
    value: 46,
    format: (n: number) => `~${Math.round(n)}%`,
    title: "Quick commerce is squeezing kiranas",
    body: "Of quick-commerce shoppers say they now buy less from their neighbourhood kirana.",
    note: "Directional · industry survey",
  },
  {
    icon: Layers,
    value: 6,
    format: (n: number) => `${Math.round(n)}%`,
    title: "Small lots miss the slab",
    body: "Distributor schemes reward volume. A shop buying 6 cases never reaches the 40-case slab a chain store gets every week.",
    note: "Typical FMCG slab at 40 cases",
  },
  {
    icon: HandCoins,
    value: 30,
    format: (n: number) => `${Math.round(n)}+ days`,
    title: "Distributors fear non-payment",
    body: "Chasing dues from dozens of small shops is costly, so distributors price in the risk and ration credit.",
    note: "Directional · typical credit cycle",
  },
];

export function Problem() {
  return (
    <section id="problem" className="scroll-mt-24 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow>The problem</Eyebrow>
          <h2 className="mt-4 text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-[48px]">
            India’s ~1.3 crore kiranas buy alone. <span className="text-ink-3">So they pay more.</span>
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-ink-2">
            Ramesh runs a general store in Marol. He orders by gut feel, in small lots, at full price — while the
            supermarket down the road buys the same cola 6% cheaper.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {CARDS.map((c, i) => (
            <motion.article
              key={c.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px" }}
              transition={{ duration: 0.8, ease: easeOutExpo, delay: i * 0.08 }}
              whileHover={{ y: -4 }}
              className="group flex flex-col rounded-[28px] bg-surface p-7 hairline shadow-[var(--shadow-soft)] transition-shadow duration-300 hover:shadow-[var(--shadow-lift)]"
            >
              <span className="grid size-10 place-items-center rounded-2xl bg-surface-2 text-navy">
                <c.icon className="size-5" aria-hidden />
              </span>
              <p className="mt-8 text-[52px] font-semibold leading-none tracking-[-0.045em] text-ink">
                <NumberTicker value={c.value} from={0} format={c.format} duration={1.4} />
              </p>
              <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.015em] text-ink">{c.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{c.body}</p>
              <p className="mt-auto pt-6 text-[12px] text-ink-3">{c.note}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
