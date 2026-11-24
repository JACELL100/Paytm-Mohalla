"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";
import type { DemoState } from "./types";

/*
 * Demo clock. Countdowns must use the server's demo time, not the browser clock.
 * We fetch GET /demo/state, remember the skew, and tick locally once a second.
 */

let skew = 0;
let state: DemoState | null = null;
let now = 0;
let synced = false;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let poller: ReturnType<typeof setInterval> | null = null;

function emit() {
  subs.forEach((s) => s());
}

export async function syncClock() {
  try {
    const t0 = Date.now();
    const s = await api.demoState();
    const rtt = Date.now() - t0;
    state = s;
    skew = new Date(s.now).getTime() - (t0 + rtt / 2);
    synced = true;
    now = Date.now() + skew;
    emit();
  } catch {
    /* keep last known skew */
  }
}

function start() {
  if (timer) return;
  if (synced) now = Date.now() + skew;
  timer = setInterval(() => {
    if (!synced) return;
    now = Date.now() + skew;
    emit();
  }, 1000);
  void syncClock();
  poller = setInterval(() => void syncClock(), 15000);
}

function stop() {
  if (timer) clearInterval(timer);
  if (poller) clearInterval(poller);
  timer = poller = null;
}

function subscribe(cb: () => void) {
  subs.add(cb);
  if (subs.size === 1) start();
  return () => {
    subs.delete(cb);
    if (subs.size === 0) stop();
  };
}

/** Current demo time in ms (re-renders every second). 0 until the first successful sync. */
export function useDemoNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
}

export function useDemoState(): DemoState | null {
  useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
  return state;
}

/** Force a re-sync (after the Demo Director moves the clock). */
export function useClockResync(dep: unknown) {
  useEffect(() => {
    void syncClock();
  }, [dep]);
}
