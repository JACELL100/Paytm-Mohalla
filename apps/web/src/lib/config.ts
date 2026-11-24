export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const ENV_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

const MOCK_FLAG = "mohalla.mocks";

/**
 * Mocks are on when NEXT_PUBLIC_USE_MOCKS=true, or when toggled at runtime with `?mocks=1`
 * (persisted in localStorage; `?mocks=0` turns it off). Handy as an on-stage fallback.
 */
export function mocksEnabled(): boolean {
  if (typeof window === "undefined") return ENV_MOCKS;
  try {
    const flag = window.localStorage.getItem(MOCK_FLAG);
    if (flag === "1") return true;
    if (flag === "0") return false;
  } catch {
    /* ignore */
  }
  return ENV_MOCKS;
}

export function setMockFlag(on: boolean) {
  try {
    window.localStorage.setItem(MOCK_FLAG, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function applyMockFlagFromUrl() {
  if (typeof window === "undefined") return;
  const v = new URLSearchParams(window.location.search).get("mocks");
  if (v === "1" || v === "0") {
    try {
      window.localStorage.setItem(MOCK_FLAG, v);
    } catch {
      /* ignore */
    }
  }
}
