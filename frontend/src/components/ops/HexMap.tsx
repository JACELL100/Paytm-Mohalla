"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/primitives";
import type { OpsHex, Pool } from "@/lib/types";

const Inner = dynamic(() => import("./HexMapInner"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

const RAMP = "linear-gradient(90deg, rgb(16,58,128), rgb(0,160,235), rgb(150,240,255))";

export function HexMap({ hexes, pools, dark }: { hexes: OpsHex[] | undefined; pools: Pool[] | undefined; dark: boolean }) {
  const active = (pools ?? []).filter((p) => p.status === "open").length;
  return (
    <div className="relative h-full w-full overflow-hidden">
      {hexes ? <Inner hexes={hexes} pools={pools ?? []} dark={dark} /> : <Skeleton className="h-full w-full rounded-none" />}

      {/* soft vignette so overlays read on any tile */}
      <div className="pointer-events-none absolute inset-0 z-[400] bg-[radial-gradient(120%_90%_at_50%_40%,transparent_55%,var(--bg)_100%)] opacity-70" />

      <div className="pointer-events-none absolute left-5 top-5 z-[500]">
        <div className="glass pointer-events-auto rounded-2xl px-4 py-3 shadow-[var(--shadow-lift)] hairline">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Live map</p>
          <p className="mt-0.5 text-[15px] font-semibold tracking-[-0.01em] text-ink">Marol · Andheri East</p>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            {hexes?.length ?? "—"} H3 cells · {active} open {active === 1 ? "pool" : "pools"}
          </p>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-5 left-5 z-[500]">
        <div className="glass pointer-events-auto w-[230px] rounded-2xl px-4 py-3 shadow-[var(--shadow-lift)] hairline">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Forecast demand</p>
          <div className="mt-2 h-2 rounded-full" style={{ background: RAMP }} />
          <div className="mt-1 flex justify-between text-[11px] text-ink-3">
            <span>Low</span>
            <span>High</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] text-ink-2">
            {[
              ["#22c6ff", "Open"],
              ["#2fd176", "Funded"],
              ["#8790a2", "Settled"],
              ["#ff6369", "Failed"],
            ].map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-full ring-2 ring-white/80" style={{ background: c }} />
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
