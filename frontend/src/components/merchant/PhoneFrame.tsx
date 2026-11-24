"use client";

import Link from "next/link";
import { BatteryFull, ExternalLink, Signal, Wifi } from "lucide-react";
import { useDemoNow } from "@/lib/clock";
import { mocksEnabled } from "@/lib/config";
import { useSyncExternalStore } from "react";
import { Logo } from "@/components/ui/Logo";

function StatusBar() {
  const now = useDemoNow();
  const time = now
    ? new Date(now).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })
    : "9:00";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 hidden h-12 items-center justify-between bg-[linear-gradient(to_bottom,var(--bg)_55%,transparent)] px-8 pt-1 text-[15px] font-semibold text-ink md:flex">
      <span className="tabular w-14">{time}</span>
      <span className="h-[30px] w-[110px] rounded-full bg-black" aria-hidden />
      <span className="flex w-14 items-center justify-end gap-1">
        <Signal className="size-4" strokeWidth={2.5} />
        <Wifi className="size-4" strokeWidth={2.5} />
        <BatteryFull className="size-5" strokeWidth={2} />
      </span>
    </div>
  );
}

/**
 * On desktop the merchant app sits in a refined phone frame on an ambient background (great on a projector);
 * on real phones it is full-screen.
 */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const mocks = useSyncExternalStore(
    () => () => {},
    mocksEnabled,
    () => false,
  );
  return (
    <div className="relative min-h-dvh md:flex md:h-dvh md:items-center md:justify-center md:gap-16 md:overflow-clip md:bg-[#e9edf3] md:p-6">
      {/* ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
        <div className="absolute -left-40 -top-40 size-[640px] rounded-full bg-[radial-gradient(circle,rgba(0,186,242,0.28),transparent_65%)] blur-2xl" />
        <div className="absolute -bottom-52 -right-40 size-[720px] rounded-full bg-[radial-gradient(circle,rgba(0,46,110,0.22),transparent_65%)] blur-2xl" />
        <div className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      <aside className="relative z-10 hidden max-w-[300px] lg:block">
        <Logo size={30} />
        <p className="mt-8 text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-3">Live demo</p>
        <h2 className="mt-2 text-[30px] font-semibold leading-[1.08] tracking-[-0.035em] text-ink">Ramesh&apos;s phone</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Ramesh General Store, Marol. Voice-first in Hindi — like a Paytm Soundbox that acts on what&apos;s coming.
        </p>
        <div className="mt-8 space-y-2">
          <Link
            href="/ops"
            target="_blank"
            className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 text-[14px] font-medium text-ink shadow-[var(--shadow-soft)] backdrop-blur transition hover:bg-white"
          >
            Paytm Ops console <ExternalLink className="size-4 text-ink-3" />
          </Link>
          <Link
            href="/d"
            target="_blank"
            className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 text-[14px] font-medium text-ink shadow-[var(--shadow-soft)] backdrop-blur transition hover:bg-white"
          >
            Distributor screen <ExternalLink className="size-4 text-ink-3" />
          </Link>
        </div>
        {mocks && <p className="mt-6 inline-flex rounded-full bg-white/70 px-3 py-1 text-[12px] font-medium text-ink-2">Running on mock data</p>}
      </aside>

      <div className="relative z-10 md:shrink-0">
        <div
          className="relative h-dvh w-full overflow-clip bg-bg md:h-[min(844px,calc(100dvh-48px))] md:w-[390px] md:rounded-[54px] md:shadow-[0_0_0_11px_#0d1017,0_0_0_12.5px_#3a3f4b,0_50px_120px_-30px_rgba(0,20,60,0.55)]"
          style={{ isolation: "isolate" }}
        >
          <StatusBar />
          {children}
        </div>
      </div>
    </div>
  );
}
