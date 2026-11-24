"use client";

import { useEffect, useRef } from "react";
import { Check, TrendingUp, ShieldCheck } from "lucide-react";

/*
 * The core idea in one loop: shops on a Marol street grid breathe with demand,
 * a few stream their orders into one pool, the ring fills 27 → 40 and the slab unlocks.
 * Canvas + requestAnimationFrame; HTML overlay text is updated through refs (no React state per frame).
 */

const W = 600;
const H = 480;
const CX = 300;
const CY = 255;
const TARGET = 40;
const START = 27;
const CYCLE = 11.5;

interface Shop {
  x: number;
  y: number;
  phase: number;
  demand: number;
  join: number; // -1 = not joining this cycle
  cases: number;
  cx: number; // bezier control point
  cy: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const H_STREETS = [62, 158, CY, 352, 432];
const V_STREETS = [74, 186, CX, 414, 526];

function buildShops(): Shop[] {
  const r = rng(2911);
  const shops: Shop[] = [];
  let guard = 0;
  while (shops.length < 44 && guard++ < 2000) {
    const horizontal = r() < 0.5;
    let x: number, y: number;
    if (horizontal) {
      y = H_STREETS[Math.floor(r() * H_STREETS.length)] + (r() < 0.5 ? -11 : 11);
      x = 30 + r() * (W - 60);
    } else {
      x = V_STREETS[Math.floor(r() * V_STREETS.length)] + (r() < 0.5 ? -11 : 11);
      y = 28 + r() * (H - 56);
    }
    if (Math.hypot(x - CX, y - CY) < 70) continue;
    if (shops.some((s) => Math.hypot(s.x - x, s.y - y) < 26)) continue;
    const mx = (x + CX) / 2;
    const my = (y + CY) / 2;
    const dx = CX - x;
    const dy = CY - y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = (r() - 0.5) * 0.5 * len;
    shops.push({
      x,
      y,
      phase: r() * Math.PI * 2,
      demand: 0.35 + r() * 0.65,
      join: -1,
      cases: 0,
      cx: mx + (-dy / len) * bend,
      cy: my + (dx / len) * bend,
    });
  }
  // 9 shops join this cycle, carrying 13 cases in total (27 → 40)
  const caseList = [2, 1, 2, 1, 2, 1, 2, 1, 1];
  const order = shops
    .map((s, i) => ({ i, d: s.demand + r() * 0.4 }))
    .sort((a, b) => b.d - a.d)
    .slice(0, caseList.length);
  order.forEach((o, k) => {
    shops[o.i].join = k;
    shops[o.i].cases = caseList[k];
  });
  return shops;
}

const LAUNCH0 = 2.0;
const LAUNCH_GAP = 0.48;
const TRAVEL = 1.45;
const LAST_ARRIVAL = LAUNCH0 + 8 * LAUNCH_GAP + TRAVEL; // ≈ 7.3s
const FUNDED_END = CYCLE - 1.1;

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function bez(s: Shop, t: number) {
  const u = 1 - t;
  return { x: u * u * s.x + 2 * u * t * s.cx + t * t * CX, y: u * u * s.y + 2 * u * t * s.cy + t * t * CY };
}

function makeGlow(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, color.replace("ALPHA", "0.55"));
  grd.addColorStop(0.4, color.replace("ALPHA", "0.18"));
  grd.addColorStop(1, color.replace("ALPHA", "0"));
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export function MohallaVisual() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const fundedRef = useRef<HTMLDivElement>(null);
  const shopsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shops = buildShops();
    const glowBlue = makeGlow("rgba(0,186,242,ALPHA)");
    const glowGreen = makeGlow("rgba(18,161,80,ALPHA)");

    let scale = 1;
    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      scale = w / W;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(8.2);
    });
    ro.observe(wrap);

    let shownCount = -1;
    let shownFunded = -1;
    let ringP = START / TARGET;

    function draw(t: number) {
      ctx!.clearRect(0, 0, W, H);

      // streets
      ctx!.lineCap = "round";
      for (const y of H_STREETS) {
        ctx!.strokeStyle = y === CY ? "rgba(0,46,110,0.10)" : "rgba(11,18,32,0.055)";
        ctx!.lineWidth = y === CY ? 10 : 6;
        ctx!.beginPath();
        ctx!.moveTo(14, y);
        ctx!.lineTo(W - 14, y);
        ctx!.stroke();
      }
      for (const x of V_STREETS) {
        ctx!.strokeStyle = x === CX ? "rgba(0,46,110,0.10)" : "rgba(11,18,32,0.055)";
        ctx!.lineWidth = x === CX ? 10 : 6;
        ctx!.beginPath();
        ctx!.moveTo(x, 14);
        ctx!.lineTo(x, H - 14);
        ctx!.stroke();
      }
      // a diagonal arterial road
      ctx!.strokeStyle = "rgba(11,18,32,0.05)";
      ctx!.lineWidth = 8;
      ctx!.beginPath();
      ctx!.moveTo(20, 448);
      ctx!.quadraticCurveTo(300, 330, 585, 96);
      ctx!.stroke();

      // progress
      let count = START;
      for (const s of shops) if (s.join >= 0 && t >= LAUNCH0 + s.join * LAUNCH_GAP + TRAVEL) count += s.cases;
      const funded = t >= LAST_ARRIVAL && t < FUNDED_END;
      const resetting = t >= FUNDED_END;
      const targetP = resetting ? START / TARGET : count / TARGET;
      ringP += (targetP - ringP) * (reduce ? 1 : 0.09);

      // connection lines from joined shops
      for (const s of shops) {
        if (s.join < 0) continue;
        const arrive = LAUNCH0 + s.join * LAUNCH_GAP + TRAVEL;
        if (t < arrive || resetting) continue;
        const a = clamp01((t - arrive) / 0.6) * 0.22;
        ctx!.strokeStyle = funded ? `rgba(18,161,80,${a})` : `rgba(0,186,242,${a})`;
        ctx!.lineWidth = 1.2;
        ctx!.setLineDash([3, 5]);
        ctx!.beginPath();
        ctx!.moveTo(s.x, s.y);
        ctx!.quadraticCurveTo(s.cx, s.cy, CX, CY);
        ctx!.stroke();
        ctx!.setLineDash([]);
      }

      // shops
      for (const s of shops) {
        const breathe = 0.5 + 0.5 * Math.sin(t * 2.6 + s.phase);
        const launched = s.join >= 0 && t >= LAUNCH0 + s.join * LAUNCH_GAP && !resetting;
        const glowSize = 16 + 26 * s.demand * (0.55 + 0.45 * breathe);
        ctx!.globalAlpha = (0.35 + 0.65 * s.demand) * (launched ? 1 : 0.8);
        ctx!.drawImage(launched && funded ? glowGreen : glowBlue, s.x - glowSize / 2, s.y - glowSize / 2, glowSize, glowSize);
        ctx!.globalAlpha = 1;
        ctx!.fillStyle = launched ? (funded ? "#12a150" : "#00baf2") : "rgba(0,46,110,0.62)";
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, 3 + breathe * 0.9 * s.demand, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = "#ffffff";
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, 1.1, 0, Math.PI * 2);
        ctx!.fill();
      }

      // streaming orders
      for (const s of shops) {
        if (s.join < 0) continue;
        const t0 = LAUNCH0 + s.join * LAUNCH_GAP;
        const p = (t - t0) / TRAVEL;
        if (p <= 0 || p >= 1) continue;
        for (let k = 6; k >= 0; k--) {
          const pk = ease(clamp01(p - k * 0.035));
          const pt = bez(s, pk);
          ctx!.globalAlpha = (1 - k / 7) * 0.9;
          ctx!.fillStyle = "#00baf2";
          ctx!.beginPath();
          ctx!.arc(pt.x, pt.y, k === 0 ? 3.6 : 2.6 - k * 0.25, 0, Math.PI * 2);
          ctx!.fill();
        }
        ctx!.globalAlpha = 1;
      }

      // pool node
      const R = 46;
      if (funded) {
        const bt = clamp01((t - LAST_ARRIVAL) / 1.3);
        ctx!.strokeStyle = `rgba(18,161,80,${0.45 * (1 - bt)})`;
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.arc(CX, CY, R + 6 + ease(bt) * 60, 0, Math.PI * 2);
        ctx!.stroke();
      }
      const halo = 70 + 10 * Math.sin(t * 1.8);
      ctx!.globalAlpha = funded ? 0.9 : 0.7;
      ctx!.drawImage(funded ? glowGreen : glowBlue, CX - halo, CY - halo, halo * 2, halo * 2);
      ctx!.globalAlpha = 1;
      ctx!.fillStyle = "#ffffff";
      ctx!.shadowColor = "rgba(0,46,110,0.22)";
      ctx!.shadowBlur = 24;
      ctx!.shadowOffsetY = 8;
      ctx!.beginPath();
      ctx!.arc(CX, CY, R, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.shadowColor = "transparent";
      ctx!.shadowBlur = 0;
      ctx!.shadowOffsetY = 0;
      ctx!.strokeStyle = "rgba(0,46,110,0.08)";
      ctx!.lineWidth = 6;
      ctx!.beginPath();
      ctx!.arc(CX, CY, R - 8, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.strokeStyle = funded ? "#12a150" : "#00baf2";
      ctx!.lineCap = "round";
      ctx!.beginPath();
      ctx!.arc(CX, CY, R - 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ringP));
      ctx!.stroke();
      // slab tick at 20 cases (50%)
      ctx!.fillStyle = "rgba(0,46,110,0.35)";
      ctx!.beginPath();
      ctx!.arc(CX, CY + (R - 8), 2, 0, Math.PI * 2);
      ctx!.fill();

      // overlay text (refs only)
      const c = resetting ? START : count;
      if (c !== shownCount && countRef.current) {
        shownCount = c;
        countRef.current.textContent = String(c);
      }
      const f = funded ? 1 : 0;
      if (f !== shownFunded && fundedRef.current) {
        shownFunded = f;
        fundedRef.current.style.opacity = String(f);
        fundedRef.current.style.transform = f ? "translateY(0) scale(1)" : "translateY(6px) scale(0.96)";
        if (shopsRef.current) shopsRef.current.textContent = f ? "20 shops · funded" : "11 shops pooling";
      }
    }

    if (reduce) {
      ringP = 1;
      draw(8.2);
      return () => ro.disconnect();
    }

    let raf = 0;
    let visible = true;
    let last = performance.now();
    let t = 0.4;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t = (t + dt) % CYCLE;
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    const startLoop = () => {
      if (raf || !visible || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) startLoop();
      else stopLoop();
    });
    io.observe(wrap);
    const onVis = () => (document.hidden ? stopLoop() : startLoop());
    document.addEventListener("visibilitychange", onVis);
    startLoop();
    return () => {
      stopLoop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={wrapRef}
        className="relative aspect-[5/4] w-full overflow-hidden rounded-[32px] bg-gradient-to-b from-white to-[#eef5fb] hairline shadow-[var(--shadow-lift)]"
      >
        <div className="bg-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
        {/* centre label */}
        <div
          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{ left: `${(CX / W) * 100}%`, top: `${(CY / H) * 100}%` }}
        >
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3 sm:text-[11px]">Cola 2L</span>
          <span className="tabular text-[17px] font-semibold leading-none tracking-[-0.02em] text-ink sm:text-[22px]">
            <span ref={countRef}>{START}</span>
            <span className="text-ink-3">/{TARGET}</span>
          </span>
        </div>
        <div
          className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center gap-1.5"
          style={{ left: `${(CX / W) * 100}%`, top: `${((CY + 58) / H) * 100}%` }}
        >
          <div
            ref={fundedRef}
            className="inline-flex items-center gap-1 rounded-full bg-ok px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(18,161,80,0.8)] transition-[opacity,transform] duration-500 sm:text-[12px]"
            style={{ opacity: 0, transform: "translateY(6px) scale(0.96)" }}
          >
            <Check className="size-3" strokeWidth={3} aria-hidden /> 6% slab unlocked
          </div>
        </div>
        <span className="sr-only">
          Animation: shops on a Marol street grid pulse with demand and stream their orders into one pool, which fills from 27 to 40
          cases and unlocks a 6% discount slab.
        </span>
      </div>

      {/* floating context chips */}
      <div className="pointer-events-none absolute -left-2 top-6 hidden animate-float sm:block lg:-left-8">
        <div className="glass flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 hairline shadow-[var(--shadow-lift)]">
          <span className="grid size-8 place-items-center rounded-xl bg-brand-soft text-brand-ink">
            <TrendingUp className="size-4" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold text-ink">Cold drinks ↑ 2.3x</p>
            <p className="text-[11.5px] text-ink-3">New Year week · Marol</p>
          </div>
        </div>
      </div>
      <div
        className="pointer-events-none absolute -right-2 bottom-8 hidden animate-float sm:block lg:-right-8"
        style={{ animationDelay: "-3s" }}
      >
        <div className="glass flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 hairline shadow-[var(--shadow-lift)]">
          <span className="grid size-8 place-items-center rounded-xl bg-ok-soft text-ok">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold text-ink">Escrow on Sepolia</p>
            <p className="text-[11.5px] text-ink-3">
              <span ref={shopsRef}>11 shops pooling</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
