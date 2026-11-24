"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { clearDevToken, getToken, homeFor } from "@/lib/auth";
import { useQuery } from "@/lib/query";
import type { MeResponse, Role } from "@/lib/types";

const MeCtx = createContext<MeResponse | null>(null);
export const useMe = () => useContext(MeCtx);

/**
 * Guards an area (/m, /d, /ops): needs a token, a profile with the right role,
 * else routes to /login, /onboarding or the user's own home.
 */
export function RoleGate({ role, children, fallback }: { role: Role; children: React.ReactNode; fallback?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    getToken().then((t) => {
      if (!alive) return;
      if (!t) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      setHasToken(!!t);
    });
    return () => {
      alive = false;
    };
  }, [router, pathname]);

  const me = useQuery<MeResponse>(hasToken ? `me:${role}` : null, api.me, { staleMs: 30000 });

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) {
      clearDevToken(role);
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
    if (me.data) {
      const r = me.data.profile.role;
      if (!r) router.replace("/onboarding");
      else if (r !== role) router.replace(homeFor(r));
    }
  }, [me.data, me.error, role, router, pathname]);

  if (!me.data && me.error && !(me.error instanceof ApiError && me.error.status === 401)) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-8 text-center">
        <div className="max-w-xs">
          <p className="text-[17px] font-semibold text-ink">Can’t load your profile</p>
          <p className="mt-1.5 text-[14px] text-ink-2">{me.error instanceof Error ? me.error.message : "Server unreachable"}</p>
          <button onClick={() => void me.refresh()} className="mt-5 h-10 rounded-full bg-navy px-5 text-sm font-medium text-white">
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!me.data || me.data.profile.role !== role) return <>{fallback ?? null}</>;
  return <MeCtx.Provider value={me.data}>{children}</MeCtx.Provider>;
}
