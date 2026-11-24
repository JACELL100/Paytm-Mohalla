"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Reveal } from "./Reveal";

export function FinalCta() {
  return (
    <section className="px-3 py-20 sm:px-5 sm:py-28">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[36px] bg-gradient-to-br from-[#0a4a9e] via-navy to-[#00122b] px-6 py-16 text-center text-white shadow-[var(--shadow-float)] sm:px-12 sm:py-24">
        <div aria-hidden className="absolute -top-40 left-1/2 h-80 w-[90%] -translate-x-1/2 rounded-full bg-brand/30 blur-[90px]" />
        <div aria-hidden className="bg-grid absolute inset-0 opacity-[0.07] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div className="relative">
          <p lang="hi" className="lang-hi text-[15px] text-white/60">
            चलिए, मोहल्ले को मिलकर खरीदना सिखाएँ।
          </p>
          <h2 className="mx-auto mt-4 max-w-3xl text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[56px]">
            See Ramesh’s street buy like a chain — live.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-white/70 sm:text-[17px]">
            Sign in as the merchant, the distributor or Paytm Ops and walk the whole story in four minutes.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <motion.span whileTap={{ scale: 0.97 }} whileHover={{ y: -1 }} className="inline-flex">
              <Link
                href="/login"
                className="group inline-flex h-12 items-center gap-2 rounded-2xl bg-brand px-6 text-[15px] font-semibold text-[#00213f] shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_14px_34px_-12px_rgba(0,186,242,0.9)] transition hover:brightness-105"
              >
                Open the live demo
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </motion.span>
            <motion.span whileTap={{ scale: 0.97 }} className="inline-flex">
              <Link
                href="/ops"
                className="inline-flex h-12 items-center rounded-2xl bg-white/10 px-5 text-[15px] font-medium text-white ring-1 ring-white/15 transition-colors hover:bg-white/15"
              >
                Ops console
              </Link>
            </motion.span>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-4">
          <Logo size={24} />
          <span className="text-[13px] text-ink-3">Built for Paytm merchants</span>
        </div>
        <div className="text-[12.5px] leading-relaxed text-ink-3 sm:text-right">
          <p>Paytm Build for India AI Hackathon · Mumbai · Track: Merchant Growth AI</p>
          <p>A hackathon prototype: synthetic sales grounded in open map and weather data, on the Sepolia testnet. Not affiliated with or endorsed by Paytm.</p>
          <p>
            Data: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-ink-2 hover:underline">OpenStreetMap contributors</a> · Weather by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-ink-2 hover:underline">Open-Meteo.com</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
