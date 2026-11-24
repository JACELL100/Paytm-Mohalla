"use client";

import { motion } from "motion/react";
import { Check, Lock, Mic, Store, Truck, BadgeCheck, Sparkles, ScanLine } from "lucide-react";
import { NumberTicker } from "@/components/ui/primitives";
import { easeOutExpo } from "@/lib/motion";

const ease = easeOutExpo;

/* 1 · Forecast ----------------------------------------------------------- */
export function ForecastViz() {
  const hist = "M10 128 C 30 122, 44 132, 62 124 S 96 118, 112 126 S 146 120, 160 122 S 186 116, 200 118";
  const band = "M200 118 C 222 100, 240 66, 262 52 S 296 40, 312 44 L 312 74 C 296 72, 270 82, 252 96 S 220 124, 200 118 Z";
  const p50 = "M200 118 C 224 104, 242 76, 264 64 S 296 56, 312 58";
  return (
    <div className="w-full max-w-[380px]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-ink-3">Cold drinks · Ramesh General Store</p>
          <p className="mt-1 text-[15px] font-semibold text-ink">Next 7 days</p>
        </div>
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 18, delay: 1.1 }}
          className="rounded-full bg-brand px-3 py-1 text-[15px] font-semibold text-[#00213f] shadow-[0_8px_24px_-10px_rgba(0,186,242,0.9)]"
        >
          2.3x
        </motion.span>
      </div>
      <svg viewBox="0 0 320 150" className="mt-5 w-full" aria-hidden>
        <line x1="200" y1="10" x2="200" y2="140" stroke="var(--line-strong)" strokeDasharray="3 4" />
        <text x="206" y="20" fontSize="9" fill="var(--ink-3)">today</text>
        <motion.path d={band} fill="var(--brand-soft)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.6 }} />
        <motion.path d={hist} fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease }} />
        <motion.path d={p50} fill="none" stroke="var(--brand)" strokeWidth="2.6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease, delay: 0.6 }} />
        <motion.circle cx="312" cy="58" r="4.5" fill="var(--brand)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.3 }} />
      </svg>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.6, ease }}
        className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-[13.5px] leading-snug text-ink-2"
      >
        “Last New Year week your cold-drink sales were <b className="text-ink">2.3x</b> normal. You have 4 cases — you’ll need 9 more.”
      </motion.div>
    </div>
  );
}

/* 2 · Pool --------------------------------------------------------------- */
export function PoolViz() {
  return (
    <div className="w-full max-w-[380px]">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-[22px]">🥤</span>
        <div>
          <p className="text-[15px] font-semibold text-ink">Cola 2L pool · Marol</p>
          <p className="text-[12.5px] text-ink-3">Shree Ganesh Distributors</p>
        </div>
      </div>
      <div className="mt-6 flex items-end justify-between">
        <p className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink">
          <NumberTicker value={40} from={27} duration={2.2} />
          <span className="text-[22px] text-ink-3"> / 40 cases</span>
        </p>
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 2.4, type: "spring", stiffness: 400, damping: 18 }}
          className="mb-1 inline-flex items-center gap-1 rounded-full bg-ok px-2.5 py-1 text-[12px] font-semibold text-white"
        >
          <Check className="size-3" strokeWidth={3} /> Funded
        </motion.span>
      </div>
      <div className="relative mt-5 h-3 overflow-hidden rounded-full bg-surface-3">
        <motion.div
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-brand to-[#3d7bff]"
          initial={{ scaleX: 27 / 40 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 2.2, ease, delay: 0.3 }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/80" />
      </div>
      <div className="mt-2 flex justify-between text-[11.5px] text-ink-3">
        <span>0</span>
        <span className="translate-x-3">20 cases · 3%</span>
        <span className="font-medium text-ok">40 · 6% off</span>
      </div>
      <div className="mt-6 flex flex-wrap gap-1.5" aria-hidden>
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.span
            key={i}
            initial={i < 11 ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4 + (i - 11) * 0.2, type: "spring", stiffness: 500, damping: 20 }}
            className={`grid size-7 place-items-center rounded-full ${i < 11 ? "bg-surface-2 text-ink-3" : "bg-brand-soft text-brand-ink"}`}
          >
            <Store className="size-3.5" />
          </motion.span>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] text-ink-3">Shops stay anonymous — only totals are shown.</p>
    </div>
  );
}

/* 3 · Voice -------------------------------------------------------------- */
const BARS = [0.35, 0.6, 0.9, 0.5, 0.75, 1, 0.65, 0.4, 0.8, 0.55, 0.95, 0.45, 0.7, 0.85, 0.5, 0.3, 0.6, 0.9, 0.4, 0.7];
export function VoiceViz() {
  return (
    <div className="w-full max-w-[380px]">
      <div className="flex items-center gap-4">
        <span className="relative grid size-14 shrink-0 place-items-center rounded-full bg-navy text-white shadow-[0_12px_30px_-10px_rgba(0,46,110,0.8)]">
          <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-brand/60" />
          <Mic className="size-6" aria-hidden />
        </span>
        <div className="flex h-12 flex-1 items-center gap-[3px]" aria-hidden>
          {BARS.map((h, i) => (
            <motion.span
              key={i}
              className="h-full flex-1 origin-center rounded-full bg-brand"
              initial={{ scaleY: 0.15 }}
              animate={{ scaleY: [0.15, h, 0.25, h * 0.8, 0.15] }}
              transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.05, ease: "easeInOut" }}
            />
          ))}
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6, ease }}
        className="ml-auto mt-6 max-w-[88%] rounded-[20px] rounded-br-md bg-navy px-4 py-3 text-white"
      >
        <p lang="hi" className="lang-hi text-[16px]">हाँ, 6 case डाल दो, पैसे बाद में दूँगा।</p>
        <p className="mt-0.5 text-[12px] text-white/60">“Haan, 6 case daal do, paise baad mein dunga.”</p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.6, ease }}
        className="mt-3 max-w-[92%] rounded-[20px] rounded-bl-md bg-surface p-4 hairline shadow-[var(--shadow-soft)]"
      >
        <p className="text-[13px] text-ink-2">Confirm your order</p>
        <p className="mt-1 text-[16px] font-semibold text-ink">6 cases · ₹5,178 · Pool Credit</p>
        <p className="text-[12.5px] text-ink-3">You save ₹330 vs the usual price</p>
        <div className="mt-3 flex gap-2">
          <span className="inline-flex h-8 items-center rounded-full bg-ok px-3.5 text-[13px] font-medium text-white">Confirm</span>
          <span className="inline-flex h-8 items-center rounded-full bg-surface-2 px-3.5 text-[13px] text-ink-2">Cancel</span>
        </div>
      </motion.div>
    </div>
  );
}

/* 4 · Pool Credit -------------------------------------------------------- */
export function CreditViz() {
  return (
    <div className="w-full max-w-[380px]">
      <motion.div
        initial={{ rotateX: 18, y: 20, opacity: 0 }}
        animate={{ rotateX: 0, y: 0, opacity: 1 }}
        transition={{ duration: 0.9, ease }}
        style={{ transformPerspective: 900 }}
        className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#0a3d85] via-navy to-[#001634] p-6 text-white shadow-[var(--shadow-float)]"
      >
        <div className="absolute -right-16 -top-16 size-48 rounded-full bg-brand/30 blur-3xl" aria-hidden />
        <div className="relative flex items-center justify-between">
          <p className="text-[13px] font-medium text-white/70">Pool Credit</p>
          <Sparkles className="size-4 text-brand" aria-hidden />
        </div>
        <p className="relative mt-5 text-[40px] font-semibold leading-none tracking-[-0.04em]">
          <NumberTicker value={5178} from={0} format={(n) => `₹${Math.round(n).toLocaleString("en-IN")}`} duration={1.2} />
        </p>
        <p className="relative mt-2 text-[13px] text-white/70">Instant, for this pool only</p>
        <div className="relative mt-6 grid grid-cols-3 gap-3 border-t border-white/15 pt-4 text-[12px]">
          <div>
            <p className="text-white/55">Rate</p>
            <p className="mt-0.5 text-[15px] font-semibold">19.5%</p>
          </div>
          <div>
            <p className="text-white/55">Tenure</p>
            <p className="mt-0.5 text-[15px] font-semibold">30 days</p>
          </div>
          <div>
            <p className="text-white/55">Daily cut</p>
            <p className="mt-0.5 text-[15px] font-semibold">10%</p>
          </div>
        </div>
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-4 text-[13.5px] leading-snug text-ink-2"
      >
        Underwritten from 90 days of Paytm collections and repaid automatically from daily settlements. In production, a partner
        NBFC lends — Paytm distributes.
      </motion.p>
    </div>
  );
}

/* 5 · Escrow ------------------------------------------------------------- */
export function EscrowViz() {
  return (
    <div className="w-full max-w-[400px]">
      <div className="relative flex items-center justify-between">
        <div className="flex flex-col items-center gap-2">
          <div className="grid grid-cols-3 gap-1" aria-hidden>
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="grid size-6 place-items-center rounded-lg bg-surface-2 text-ink-3">
                <Store className="size-3" />
              </span>
            ))}
          </div>
          <p className="text-[12px] text-ink-3">20 shops</p>
        </div>
        <div className="relative mx-2 h-px flex-1 bg-line-strong">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0"
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: ["-100%", "0%"], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.5, ease: "easeInOut" }}
            >
              <span className="absolute -top-1 right-0 size-2 rounded-full bg-brand" />
            </motion.div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-2">
          <motion.span
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 14 }}
            className="grid size-16 place-items-center rounded-[20px] bg-navy text-white shadow-[0_14px_34px_-12px_rgba(0,46,110,0.8)]"
          >
            <Lock className="size-7" aria-hidden />
          </motion.span>
          <p className="text-[12px] font-medium text-ink">Escrow</p>
        </div>
        <div className="relative mx-2 h-px flex-1 bg-line-strong">
          <motion.div
            className="absolute inset-0"
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: ["-100%", "0%"], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: 1.2, repeatDelay: 1, ease: "easeInOut" }}
          >
            <span className="absolute -top-1 right-0 size-2 rounded-full bg-ok" />
          </motion.div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-ink-2">
            <Truck className="size-5" aria-hidden />
          </span>
          <p className="text-[12px] text-ink-3">Distributor</p>
        </div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 text-[13px]">
        <div className="rounded-2xl bg-ok-soft p-3.5">
          <p className="font-semibold text-ok">Target reached</p>
          <p className="mt-1 leading-snug text-ink-2">Pool is funded. Each shop’s share is paid out on delivery.</p>
        </div>
        <div className="rounded-2xl bg-surface-2 p-3.5">
          <p className="font-semibold text-ink">Target missed</p>
          <p className="mt-1 leading-snug text-ink-2">Everyone is refunded in full. Nobody pays.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-surface p-3 font-mono text-[11.5px] text-ink-3 hairline">
        <span className="grid size-5 place-items-center rounded-full bg-ok text-white">
          <Check className="size-3" strokeWidth={3} />
        </span>
        <span className="font-sans text-[12.5px] text-ink">Committed on Sepolia</span>
        <span className="ml-auto truncate">0x8f3a…c21e</span>
      </div>
    </div>
  );
}

/* 6 · Delivery QR -------------------------------------------------------- */
function qrCells() {
  const n = 21;
  const cells: [number, number][] = [];
  let s = 1337;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const finder = (x: number, y: number) =>
    [[0, 0], [n - 7, 0], [0, n - 7]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (finder(x, y)) continue;
      if (r() > 0.52) cells.push([x, y]);
    }
  return cells;
}
const QR = qrCells();

export function QrViz() {
  const finders = [[0, 0], [14, 0], [0, 14]];
  return (
    <div className="flex w-full max-w-[400px] flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative size-44 shrink-0 overflow-hidden rounded-3xl bg-white p-4 hairline shadow-[var(--shadow-soft)]">
        <svg viewBox="0 0 21 21" className="size-full" aria-hidden shapeRendering="crispEdges">
          {QR.map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0b1220" />
          ))}
          {finders.map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <rect x={x} y={y} width="7" height="7" fill="#0b1220" />
              <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
              <rect x={x + 2} y={y + 2} width="3" height="3" fill="#0b1220" />
            </g>
          ))}
        </svg>
        <motion.div
          className="absolute inset-x-3 top-3 h-0.5 rounded-full bg-brand shadow-[0_0_16px_4px_rgba(0,186,242,0.6)]"
          animate={{ y: [0, 148, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 0, 1], scale: [0.8, 0.8, 1] }}
          transition={{ duration: 2.2, times: [0, 0.7, 1] }}
          className="absolute inset-0 grid place-items-center bg-white/85 backdrop-blur-[2px]"
        >
          <span className="grid size-14 place-items-center rounded-full bg-ok text-white shadow-[0_12px_30px_-10px_rgba(18,161,80,0.9)]">
            <Check className="size-7" strokeWidth={3} aria-hidden />
          </span>
        </motion.div>
      </div>
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.8, duration: 0.6, ease }}
        className="w-full space-y-2.5"
      >
        <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <ScanLine className="size-4 text-brand-ink" aria-hidden /> Delivery confirmed
        </p>
        <div className="flex justify-between rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[13px]">
          <span className="text-ink-2">To distributor</span>
          <span className="tabular font-semibold text-ink">₹5,126</span>
        </div>
        <div className="flex justify-between rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[13px]">
          <span className="text-ink-2">Paytm fee · 1%</span>
          <span className="tabular font-semibold text-ink">₹52</span>
        </div>
        <p className="text-[12px] leading-snug text-ink-3">Released from escrow by the shop’s own scan — on-chain, visible to anyone.</p>
      </motion.div>
    </div>
  );
}

/* 7 · Trust -------------------------------------------------------------- */
export function TrustViz() {
  const R = 70;
  const C = 2 * Math.PI * R;
  const arc = 0.75; // 270° gauge
  const frac = (s: number) => (s - 300) / 600;
  return (
    <div className="flex w-full max-w-[400px] flex-col items-center gap-6 sm:flex-row">
      <div className="relative size-48 shrink-0">
        <svg viewBox="0 0 180 180" className="size-full -rotate-[225deg]" aria-hidden>
          <circle cx="90" cy="90" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${C * arc} ${C}`} />
          <motion.circle
            cx="90"
            cy="90"
            r={R}
            fill="none"
            stroke="url(#trust-g)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${C * arc} ${C}`}
            initial={{ strokeDashoffset: C * arc * (1 - frac(712)) }}
            animate={{ strokeDashoffset: C * arc * (1 - frac(726)) }}
            transition={{ duration: 1.6, ease, delay: 0.5 }}
          />
          <defs>
            <linearGradient id="trust-g" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#00baf2" />
              <stop offset="1" stopColor="#12a150" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink">
            <NumberTicker value={726} from={712} duration={1.6} />
          </p>
          <p className="mt-1 text-[12px] text-ink-3">of 900 · Good</p>
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
            className="mt-2 rounded-full bg-ok-soft px-2 py-0.5 text-[12px] font-semibold text-ok"
          >
            +14
          </motion.span>
        </div>
      </div>
      <div className="w-full space-y-2.5">
        {[
          ["Commitments honoured", "100%"],
          ["Pools joined", "4"],
          ["Sales stability", "0.82"],
        ].map(([k, v], i) => (
          <motion.div
            key={k}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.1, duration: 0.5, ease }}
            className="flex justify-between rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[13px]"
          >
            <span className="text-ink-2">{k}</span>
            <span className="tabular font-semibold text-ink">{v}</span>
          </motion.div>
        ))}
        <div className="flex items-center gap-2 px-1 pt-1 text-[12.5px] text-ink-3">
          <BadgeCheck className="size-4 text-ok" aria-hidden /> EAS attestation · portable to any lender
        </div>
      </div>
    </div>
  );
}
