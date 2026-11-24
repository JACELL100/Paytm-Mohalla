import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Indian digit grouping: 123456 -> "1,23,456". */
export function groupIndian(n: number): string {
  const neg = n < 0;
  const s = Math.abs(Math.trunc(n)).toString();
  if (s.length <= 3) return (neg ? "-" : "") + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return (neg ? "-" : "") + rest + "," + last3;
}

/** Paise integer -> "₹1,23,456" (whole rupees unless `paise` is requested). */
export function inr(paise: number, opts: { paise?: boolean } = {}): string {
  const rupees = paise / 100;
  if (opts.paise) {
    const whole = Math.trunc(rupees);
    const frac = Math.abs(Math.round((rupees - whole) * 100))
      .toString()
      .padStart(2, "0");
    return `₹${groupIndian(whole)}.${frac}`;
  }
  return `₹${groupIndian(Math.round(rupees))}`;
}

/** Compact: ₹4.2L, ₹1.3Cr, ₹12.4K */
export function inrCompact(paise: number): string {
  const r = paise / 100;
  const abs = Math.abs(r);
  if (abs >= 1e7) return `₹${(r / 1e7).toFixed(abs >= 1e8 ? 1 : 2)}Cr`;
  if (abs >= 1e5) return `₹${(r / 1e5).toFixed(abs >= 1e6 ? 1 : 2)}L`;
  if (abs >= 1e3) return `₹${(r / 1e3).toFixed(1)}K`;
  return `₹${Math.round(r)}`;
}

export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

export function shortHash(h: string | null | undefined, n = 6) {
  if (!h) return "";
  return `${h.slice(0, n)}…${h.slice(-4)}`;
}

export function mmss(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function relTime(iso: string, nowMs: number, lang: "hi" | "en" = "en") {
  const d = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (lang === "hi") {
    if (d < 10) return "अभी";
    if (d < 60) return `${d} सेकंड पहले`;
    if (d < 3600) return `${Math.floor(d / 60)} मिनट पहले`;
    if (d < 86400) return `${Math.floor(d / 3600)} घंटे पहले`;
    return `${Math.floor(d / 86400)} दिन पहले`;
  }
  if (d < 10) return "just now";
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function fmtDemoTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
