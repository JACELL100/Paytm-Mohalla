"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useMemo, useState } from "react";
import { MapContainer, Marker, Polygon, TileLayer, Tooltip, ZoomControl } from "react-leaflet";
import { inr } from "@/lib/format";
import type { OpsHex, Pool } from "@/lib/types";

/** Sequential ramp: deep navy → electric blue → ice cyan. */
const STOPS = [
  [0, [16, 58, 128]],
  [0.5, [0, 160, 235]],
  [1, [150, 240, 255]],
] as const;
export function demandColor(d: number) {
  const x = Math.max(0, Math.min(1, d));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (x <= t1) {
      const k = (x - t0) / (t1 - t0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return "rgb(150,240,255)";
}

const PIN: Record<Pool["status"], { color: string; pulse: boolean }> = {
  open: { color: "#22c6ff", pulse: true },
  funded: { color: "#2fd176", pulse: true },
  settled: { color: "#8790a2", pulse: false },
  failed: { color: "#ff6369", pulse: false },
  draft: { color: "#8790a2", pulse: false },
};

function pinIcon(p: Pool) {
  const { color, pulse } = PIN[p.status];
  return L.divIcon({
    className: "mohalla-pin",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<div style="position:relative;width:44px;height:44px;display:grid;place-items:center">
      ${pulse ? `<span class="animate-pulse-ring" style="position:absolute;inset:8px;border-radius:9999px;background:${color};opacity:.5"></span>` : ""}
      <span style="position:relative;display:grid;place-items:center;width:30px;height:30px;border-radius:9999px;background:${color};box-shadow:0 0 0 3px rgba(255,255,255,.92),0 8px 20px -6px ${color};font-size:15px;line-height:1">${p.sku.emoji}</span>
    </div>`,
  });
}

export default function HexMapInner({ hexes, pools, dark }: { hexes: OpsHex[]; pools: Pool[]; dark: boolean }) {
  // Standard OpenStreetMap tiles; a CSS filter (globals.css `.mohalla-tiles`) gives the calm / dark look.
  const tiles = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const icons = useMemo(() => new Map(pools.map((p) => [p.id, pinIcon(p)])), [pools]);
  // Initial view fits the hex grid (Inner only mounts once hexes exist).
  const [bounds] = useState(() =>
    L.latLngBounds(hexes.flatMap((h) => h.boundary.map(([la, ln]) => L.latLng(la, ln)))),
  );

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [12, 12] }}
      zoomSnap={0.25}
      zoomDelta={0.5}
      scrollWheelZoom={false}
      zoomControl={false}
      attributionControl
      className="h-full w-full"
      aria-label="Map of Marol and Andheri East with neighbourhood demand hexagons and pool locations"
    >
      <TileLayer
        url={tiles}
        maxZoom={19}
        className="mohalla-tiles"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <ZoomControl position="bottomright" />
      {hexes.map((h) => {
        const c = demandColor(h.demand_index);
        return (
          <Polygon
            key={h.h3}
            positions={h.boundary}
            pathOptions={{
              color: c,
              weight: h.active_pools > 0 ? 1.6 : 0.8,
              opacity: dark ? 0.55 : 0.7,
              fillColor: c,
              fillOpacity: 0.08 + h.demand_index * (dark ? 0.42 : 0.38),
            }}
          >
            <Tooltip className="mohalla-tip" direction="top" sticky>
              <div className="min-w-[150px]">
                <div className="mb-1 font-mono text-[10.5px] text-ink-3">{h.h3}</div>
                <div className="flex justify-between gap-4">
                  <span className="text-ink-2">Demand index</span>
                  <b className="tabular">{Math.round(h.demand_index * 100)}</b>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-ink-2">Merchants</span>
                  <b className="tabular">{h.merchants}</b>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-ink-2">Active pools</span>
                  <b className="tabular">{h.active_pools}</b>
                </div>
              </div>
            </Tooltip>
          </Polygon>
        );
      })}
      {pools.map((p) => (
        <Marker key={p.id} position={[p.center.lat, p.center.lng]} icon={icons.get(p.id)!} zIndexOffset={p.status === "open" ? 1000 : 0}>
          <Tooltip className="mohalla-tip" direction="top" offset={[0, -18]}>
            <div className="min-w-[170px]">
              <div className="font-semibold">
                {p.sku.emoji} {p.sku.name}
              </div>
              <div className="mt-0.5 text-ink-2 capitalize">
                {p.status} · {p.committed_cases}/{p.target_cases} cases · {p.member_count} shops
              </div>
              <div className="mt-0.5 text-ink-2">
                {inr(p.case_price_paise)}/case · {p.distributor.name}
              </div>
            </div>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
