"use client";

import type { Role } from "./types";
import { getSupabase } from "./supabase";

/*
 * Tokens are stored per role ("area"), so one browser can run the merchant phone,
 * the distributor screen and the ops console side by side in different tabs.
 * Supabase sessions are per browser profile and are used when no dev token exists for the area.
 */

const devKey = (role: Role) => `mohalla.token.${role}`;

export function homeFor(role: Role | null | undefined) {
  if (role === "merchant") return "/m";
  if (role === "distributor") return "/d";
  if (role === "ops") return "/ops";
  return "/onboarding";
}

/** The role whose token this page should use, derived from the URL. */
export function areaFromPath(pathname: string): Role | null {
  if (pathname === "/m" || pathname.startsWith("/m/")) return "merchant";
  if (pathname === "/d" || pathname.startsWith("/d/")) return "distributor";
  if (pathname === "/ops" || pathname.startsWith("/ops/")) return "ops";
  return null;
}

export function setDevToken(role: Role, token: string) {
  try {
    window.localStorage.setItem(devKey(role), token);
  } catch {
    /* ignore */
  }
}

export function getDevToken(role: Role): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(devKey(role));
  } catch {
    return null;
  }
}

export function clearDevToken(role: Role) {
  try {
    window.localStorage.removeItem(devKey(role));
  } catch {
    /* ignore */
  }
}

export async function getSupabaseToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const area = areaFromPath(window.location.pathname);
  if (area) {
    const t = getDevToken(area);
    if (t) return t;
  }
  const sb = await getSupabaseToken();
  if (sb) return sb;
  if (!area) {
    for (const r of ["merchant", "distributor", "ops"] as Role[]) {
      const t = getDevToken(r);
      if (t) return t;
    }
  }
  return null;
}

export async function signOut(role: Role | null) {
  if (role) clearDevToken(role);
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}
