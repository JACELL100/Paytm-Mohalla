"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { RoleGate, useMe } from "@/components/RoleGate";
import { PhoneFrame } from "@/components/merchant/PhoneFrame";
import { TabBar } from "@/components/merchant/TabBar";
import { Toaster } from "@/components/ui/Toaster";
import { Skeleton } from "@/components/ui/primitives";
import { LangProvider, readStoredLang } from "@/lib/i18n";
import { api } from "@/lib/api";
import type { Lang } from "@/lib/types";

function MerchantShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const pathname = usePathname();
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);
  const onLang = useCallback((l: Lang) => {
    api.patchMe(l).catch(() => {});
  }, []);
  const initial: Lang = readStoredLang() ?? me?.profile.lang ?? "hi";
  return (
    <LangProvider initial={initial} onChange={onLang}>
      <div ref={scroller} id="m-scroll" className="no-scrollbar absolute inset-0 overflow-y-auto overscroll-contain pb-32 pt-[env(safe-area-inset-top)] md:pt-11">
        {children}
      </div>
      <TabBar />
      <div id="m-overlay" className="pointer-events-none absolute inset-0 z-[60]" />
      <Toaster contained />
    </LangProvider>
  );
}

function Loading() {
  return (
    <div className="space-y-4 px-5 pt-16">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-56 rounded-[28px]" />
      <Skeleton className="h-28" />
      <Skeleton className="h-40" />
    </div>
  );
}

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    <PhoneFrame>
      <RoleGate role="merchant" fallback={<Loading />}>
        <MerchantShell>{children}</MerchantShell>
      </RoleGate>
    </PhoneFrame>
  );
}
