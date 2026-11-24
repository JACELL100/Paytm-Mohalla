"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/*
 * A tiny SWR-style cache: keyed snapshots, polling, de-duplicated in-flight requests,
 * and `invalidate()` to refetch every mounted query (optionally by key prefix).
 * Cached data survives navigation, so tab switches never flash skeletons.
 */

interface Entry {
  data?: unknown;
  error?: unknown;
  updatedAt: number;
}

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const fetchers = new Map<string, () => Promise<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

async function run(key: string) {
  const fn = fetchers.get(key);
  if (!fn) return;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      const data = await fn();
      cache.set(key, { data, updatedAt: Date.now() });
    } catch (error) {
      const prev = cache.get(key);
      cache.set(key, { data: prev?.data, error, updatedAt: Date.now() });
    } finally {
      inflight.delete(key);
      emit(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Refetch every mounted query whose key starts with `prefix` (all when omitted). */
export function invalidate(prefix = "") {
  return Promise.all([...fetchers.keys()].filter((k) => k.startsWith(prefix)).map((k) => run(k)));
}

/** Optimistically set a query's data. */
export function setQueryData<T>(key: string, data: T) {
  cache.set(key, { data, updatedAt: Date.now() });
  emit(key);
}

export function clearQueries() {
  cache.clear();
  fetchers.forEach((_, k) => emit(k));
}

const EMPTY: Entry = { updatedAt: 0 };

export function useQuery<T>(
  key: string | null,
  fn: () => Promise<T>,
  opts: { interval?: number; staleMs?: number } = {},
) {
  const { interval, staleMs = 1000 } = opts;
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => {};
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(cb);
      return () => {
        set!.delete(cb);
      };
    },
    [key],
  );
  const entry = useSyncExternalStore(
    subscribe,
    () => (key ? (cache.get(key) ?? EMPTY) : EMPTY),
    () => EMPTY,
  );

  useEffect(() => {
    if (!key) return;
    fetchers.set(key, () => fnRef.current());
    const e = cache.get(key);
    if (!e || Date.now() - e.updatedAt > staleMs) void run(key);
    let id: ReturnType<typeof setInterval> | undefined;
    if (interval) {
      id = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        void run(key);
      }, interval);
    }
    const onVis = () => {
      if (!document.hidden) void run(key);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (id) clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      if (!listeners.get(key)?.size) fetchers.delete(key);
    };
  }, [key, interval, staleMs]);

  const refresh = useCallback(() => (key ? run(key) : Promise.resolve()), [key]);

  return {
    data: entry.data as T | undefined,
    error: entry.error,
    loading: !!key && entry.data === undefined && entry.error === undefined,
    refresh,
  };
}
