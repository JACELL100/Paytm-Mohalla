"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_ENABLED, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;

/** Browser Supabase client, or null when the env vars are not set. */
export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_ENABLED) return null;
  if (typeof window === "undefined") return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
