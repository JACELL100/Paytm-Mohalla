"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, LayoutDashboard, MapPin, Search, Store, Truck } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { getToken, homeFor } from "@/lib/auth";
import { clearQueries, useQuery } from "@/lib/query";
import { cn } from "@/lib/format";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/primitives";
import { Toaster, toast } from "@/components/ui/Toaster";
import type { Merchant, Role } from "@/lib/types";

const roles: { role: Role; title: string; hi: string; body: string; icon: typeof Store }[] = [
  { role: "merchant", title: "I run a shop", hi: "मेरी दुकान है", body: "Get demand forecasts, join pools, save on every case.", icon: Store },
  { role: "distributor", title: "I'm a distributor", hi: "मैं distributor हूँ", body: "Receive pooled orders with guaranteed payment.", icon: Truck },
  { role: "ops", title: "Paytm team", hi: "Paytm टीम", body: "See the network, KPIs and run the demo.", icon: LayoutDashboard },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [shop, setShop] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getToken().then((t) => {
      if (!t) router.replace("/login?next=/onboarding");
      else setReady(true);
    });
  }, [router]);

  const shops = useQuery<Merchant[]>(ready && role === "merchant" ? "onboarding-shops" : null, api.onboardingShops);
  const filtered = useMemo(
    () => (shops.data ?? []).filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || s.owner_name.toLowerCase().includes(q.toLowerCase())),
    [shops.data, q],
  );

  const finish = async () => {
    if (!role) return;
    setSaving(true);
    try {
      const me = await api.onboarding(role, role === "merchant" ? (shop ?? undefined) : undefined);
      clearQueries();
      router.replace(homeFor(me.profile.role));
    } catch (e) {
      setSaving(false);
      toast("Couldn't finish setup", { body: errorMessage(e), tone: "error" });
    }
  };

  const step = role === "merchant" ? 2 : 1;

  return (
    <main className="min-h-dvh bg-bg">
      <Toaster />
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6">
        <Logo size={28} />
        <span className="text-[13px] text-ink-3">Step {step} of {role === "merchant" ? 2 : role ? 1 : 2}</span>
      </header>
      <div className="mx-auto max-w-3xl px-5 pb-32">
        <AnimatePresence mode="wait">
          {role !== "merchant" || !role ? (
            <motion.div key="roles" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
              <h1 className="mt-6 text-[34px] font-semibold tracking-[-0.035em] text-ink sm:text-[44px]">How will you use Mohalla?</h1>
              <p className="mt-2 text-[15px] text-ink-2">You can only pick one role per account.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {roles.map((r) => {
                  const active = role === r.role;
                  return (
                    <motion.button
                      key={r.role}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setRole(r.role)}
                      className={cn(
                        "relative flex flex-col items-start rounded-[24px] bg-surface p-5 text-left hairline shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-lift)]",
                        active && "shadow-[0_0_0_2px_var(--brand),var(--shadow-lift)]",
                      )}
                    >
                      <span className={cn("grid size-11 place-items-center rounded-2xl transition-colors", active ? "bg-brand text-[#00213f]" : "bg-surface-2 text-ink-2")}>
                        <r.icon className="size-5" />
                      </span>
                      <span className="mt-5 text-[17px] font-semibold tracking-[-0.02em] text-ink">{r.title}</span>
                      <span className="lang-hi text-[13px] text-ink-3">{r.hi}</span>
                      <span className="mt-2 text-[13.5px] leading-snug text-ink-2">{r.body}</span>
                      {active && (
                        <motion.span layoutId="role-check" className="absolute right-4 top-4 grid size-6 place-items-center rounded-full bg-brand text-[#00213f]">
                          <Check className="size-3.5" strokeWidth={3} />
                        </motion.span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <motion.div key="shops" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
              <button onClick={() => setRole(null)} className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
                <ArrowLeft className="size-4" /> Change role
              </button>
              <h1 className="mt-4 text-[34px] font-semibold tracking-[-0.035em] text-ink sm:text-[44px]">Find your shop</h1>
              <p className="mt-2 text-[15px] text-ink-2">We matched these Paytm shops near Marol. Pick yours to claim it.</p>
              <label className="mt-6 flex h-12 items-center gap-3 rounded-2xl bg-surface px-4 hairline focus-within:shadow-[0_0_0_4px_var(--brand-soft)]">
                <Search className="size-4 text-ink-3" />
                <span className="sr-only">Search shops</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by shop or owner" className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
              </label>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {shops.loading && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[72px]" />)}
                {filtered.map((s, i) => (
                  <motion.li key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.025, 0.4) }}>
                    <button
                      onClick={() => setShop(s.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl bg-surface p-3.5 text-left hairline transition-shadow",
                        shop === s.id ? "shadow-[0_0_0_2px_var(--brand)]" : "hover:shadow-[var(--shadow-soft)]",
                      )}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-[15px] font-semibold text-ink-2">{s.name[0]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium text-ink">{s.name}</span>
                        <span className="flex items-center gap-1 truncate text-[12.5px] text-ink-3">
                          <MapPin className="size-3" /> {s.owner_name} · {s.category}
                        </span>
                      </span>
                      {shop === s.id && <Check className="size-4 text-brand-ink" strokeWidth={3} />}
                    </button>
                  </motion.li>
                ))}
              </ul>
              {shops.data && filtered.length === 0 && <p className="mt-6 text-center text-[14px] text-ink-3">No shops match “{q}”.</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="glass fixed inset-x-0 bottom-0 border-t border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-3 px-5 py-4">
          <Button size="lg" onClick={finish} loading={saving} disabled={!role || (role === "merchant" && !shop)} className="min-w-40">
            Continue
          </Button>
        </div>
      </div>
    </main>
  );
}
