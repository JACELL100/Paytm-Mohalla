"use client";

import { api, errorMessage } from "@/lib/api";
import { invalidate } from "@/lib/query";
import { syncClock } from "@/lib/clock";
import { toast } from "@/components/ui/Toaster";
import type { Pool } from "@/lib/types";

/** Runs a Demo Director action with consistent feedback, then refreshes every live view. */
export async function runDirector<T>(
  label: string,
  fn: () => Promise<T>,
  success: string | ((r: T) => { title: string; body?: string }),
): Promise<boolean> {
  try {
    const r = await fn();
    const s = typeof success === "string" ? { title: success } : success(r);
    toast(s.title, { tone: "success", body: s.body });
    return true;
  } catch (e) {
    toast(`${label} failed`, { tone: "error", body: errorMessage(e) });
    return false;
  } finally {
    await Promise.all([invalidate(), syncClock()]);
  }
}

export const fillJoins = (p: Pool) =>
  runDirector("Simulate joins", () => api.simulateJoins(p.id, { fill: true }), () => ({
    title: `Shops joining ${p.sku.name}`,
    body: `${Math.max(0, p.target_cases - p.committed_cases)} cases to go — watch the merchant phone`,
  }));

export const deliverAll = (p: Pool) =>
  runDirector("Simulate delivery", () => api.simulateDelivery(p.id), `Deliveries confirmed for ${p.sku.name} (except Ramesh)`);

/** Pick the hero pool for the demo: Cola 2L if present. */
export function heroPool(pools: Pool[] | undefined, status: Pool["status"]): Pool | undefined {
  const list = (pools ?? []).filter((p) => p.status === status);
  return list.find((p) => /cola/i.test(p.sku.name)) ?? list[0];
}
