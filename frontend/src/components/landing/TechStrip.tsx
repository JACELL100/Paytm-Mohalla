"use client";

import { motion, useReducedMotion } from "motion/react";
import { Reveal } from "./Reveal";

const STACK = [
  "Next.js",
  "FastAPI",
  "Supabase",
  "Groq · gpt-oss",
  "Whisper",
  "Chronos-2",
  "Indic Parler-TTS",
  "Uber H3",
  "Solidity · Foundry",
  "Sepolia",
  "EAS attestations",
  "Leaflet · OSM",
  "OpenStreetMap data",
  "Open-Meteo weather",
];

function Pill({ t }: { t: string }) {
  return (
    <span className="inline-flex h-11 shrink-0 items-center rounded-full bg-surface px-5 text-[14.5px] font-medium tracking-[-0.01em] text-ink-2 hairline">
      {t}
    </span>
  );
}

export function TechStrip() {
  const reduce = useReducedMotion();
  return (
    <section aria-label="Technology" className="border-y border-line py-14">
      <Reveal className="mx-auto max-w-6xl px-5 text-center sm:px-8">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-3">Built with open models and open rails</p>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">
          Grounded in open data: real shop locations from OpenStreetMap, real Mumbai weather from Open-Meteo, and festival calendars from the open-source <span className="font-mono text-[13px]">holidays</span> package.
        </p>
      </Reveal>
      {reduce ? (
        <div className="mx-auto mt-8 flex max-w-5xl flex-wrap justify-center gap-2.5 px-5">
          {STACK.map((t) => (
            <Pill key={t} t={t} />
          ))}
        </div>
      ) : (
        <div className="relative mt-8 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <motion.div
            className="flex w-max gap-2.5 pr-2.5"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
          >
            {[...STACK, ...STACK].map((t, i) => (
              <Pill key={`${t}-${i}`} t={t} />
            ))}
          </motion.div>
        </div>
      )}
    </section>
  );
}
