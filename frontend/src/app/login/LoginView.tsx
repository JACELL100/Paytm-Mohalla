"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, LayoutDashboard, Store, Truck, WifiOff, Mail, Lock, Loader2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { getSupabaseToken, homeFor, setDevToken } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { SUPABASE_ENABLED, mocksEnabled, setMockFlag } from "@/lib/config";
import { clearQueries, useQuery } from "@/lib/query";
import { cn } from "@/lib/format";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/primitives";
import { Toaster, toast } from "@/components/ui/Toaster";
import type { DemoAccount, Health, Role } from "@/lib/types";

const roleMeta: Record<Role, { icon: typeof Store; tint: string; ring: string; label: string; area: string }> = {
  merchant: { icon: Store, tint: "from-[#22C6FF] to-[#0A6BD6]", ring: "group-hover:shadow-[0_0_0_4px_rgba(0,186,242,0.18)]", label: "Merchant", area: "Phone app · हिंदी" },
  distributor: { icon: Truck, tint: "from-[#34D399] to-[#0E8F57]", ring: "group-hover:shadow-[0_0_0_4px_rgba(18,161,80,0.18)]", label: "Distributor", area: "Orders & delivery QR" },
  ops: { icon: LayoutDashboard, tint: "from-[#3D5AFE] to-[#002E6E]", ring: "group-hover:shadow-[0_0_0_4px_rgba(0,46,110,0.2)]", label: "Paytm Ops", area: "Command centre" },
};

function nextParam(): string | null {
  if (typeof window === "undefined") return null;
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : null;
}

export function LoginView() {
  const router = useRouter();
  const health = useQuery<Health>("health", api.health, { staleMs: 10000 });
  const accounts = useQuery<DemoAccount[]>(health.data?.demo_mode ? "demo-accounts" : null, api.demoAccounts);
  const [busy, setBusy] = useState<string | null>(null);
  const supabaseMode = health.data?.auth_mode === "supabase" && SUPABASE_ENABLED;

  // Returning from OAuth or already signed in with Supabase → route by role.
  useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    let alive = true;
    (async () => {
      const t = await getSupabaseToken();
      if (!t || !alive) return;
      setBusy("supabase");
      try {
        const me = await api.me();
        if (alive) router.replace(nextParam() ?? homeFor(me.profile.role));
      } catch (e) {
        if (alive) {
          setBusy(null);
          toast("Couldn't load your profile", { body: errorMessage(e), tone: "error" });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  const pickDemo = (a: DemoAccount) => {
    setBusy(a.token);
    setDevToken(a.role, a.token);
    clearQueries();
    const n = nextParam();
    const target = n && n.startsWith(homeFor(a.role)) ? n : homeFor(a.role);
    router.push(target);
  };

  const offline = !!health.error && !health.data;

  return (
    <main className="relative grid min-h-dvh grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      <Toaster />
      <BrandPanel />
      <section className="relative flex min-h-dvh min-w-0 flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] text-ink-2 transition hover:text-ink">
            <ArrowLeft className="size-4" /> Home
          </Link>
          <span className="lg:hidden">
            <Logo size={26} />
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
            <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-[40px]">Welcome to Mohalla</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
              {supabaseMode ? "Sign in to your co-op, or jump into a demo account." : "Pick a demo account — each one opens its own screen. Open them in separate tabs to run the whole story."}
            </p>
          </motion.div>

          <div className="mt-8">
            {health.loading && (
              <div className="space-y-3">
                <Skeleton className="h-[84px]" />
                <Skeleton className="h-[84px]" />
                <Skeleton className="h-[84px]" />
              </div>
            )}

            {offline && <OfflineCard onRetry={() => void health.refresh()} />}

            {supabaseMode && <SupabaseForm onBusy={setBusy} busy={busy} />}

            {health.data?.demo_mode && (
              <div className={cn(supabaseMode && "mt-8")}>
                {supabaseMode && (
                  <div className="mb-4 flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">
                    <span className="h-px flex-1 bg-line" /> Demo accounts <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <motion.ul
                  className="space-y-3"
                  initial="hidden"
                  animate="show"
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
                >
                  {(accounts.data ?? []).map((a) => (
                    <motion.li key={a.token} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 28 } } }}>
                      <DemoCard account={a} busy={busy === a.token} disabled={!!busy} onPick={() => pickDemo(a)} />
                    </motion.li>
                  ))}
                  {accounts.loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[84px]" />)}
                </motion.ul>
              </div>
            )}

            {health.data && !health.data.demo_mode && !supabaseMode && (
              <p className="rounded-2xl bg-warn-soft p-4 text-[14px] text-ink-2">
                Demo accounts are off and Supabase isn&apos;t configured in this build. Set <code className="font-mono text-[12px]">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="font-mono text-[12px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
              </p>
            )}
          </div>

          <p className="mt-10 text-[12px] leading-relaxed text-ink-3">
            {health.data ? (
              <>
                Auth: <span className="font-medium text-ink-2">{health.data.auth_mode}</span> · Chain:{" "}
                <span className="font-medium text-ink-2">{health.data.chain_mode}</span>
                {mocksEnabled() && <span className="ml-1.5 rounded-full bg-surface-2 px-2 py-0.5 font-medium text-ink-2">mock data</span>}
              </>
            ) : (
              " "
            )}
          </p>
        </div>
      </section>
    </main>
  );
}

function DemoCard({ account, onPick, busy, disabled }: { account: DemoAccount; onPick: () => void; busy: boolean; disabled: boolean }) {
  const m = roleMeta[account.role];
  const Icon = m.icon;
  return (
    <motion.button
      onClick={onPick}
      disabled={disabled}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "group flex w-full items-center gap-4 rounded-[22px] bg-surface p-4 text-left hairline shadow-[var(--shadow-soft)] transition-shadow duration-300 hover:shadow-[var(--shadow-lift)] disabled:opacity-60",
      )}
    >
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white transition-shadow duration-300", m.tint, m.ring)}>
        <Icon className="size-[22px]" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[16px] font-semibold tracking-[-0.015em] text-ink">{account.display_name}</span>
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-ink-2">{account.subtitle}</span>
        <span className="mt-1.5 inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-3">
          {m.label} · {m.area}
        </span>
      </span>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 transition group-hover:bg-navy group-hover:text-white">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
      </span>
    </motion.button>
  );
}

function OfflineCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-[22px] bg-surface p-5 hairline shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3">
        <span className="grid size-10 place-items-center rounded-2xl bg-warn-soft text-warn">
          <WifiOff className="size-5" />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-ink">Can&apos;t reach the Mohalla API</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">Start the FastAPI server, or run the full demo on built-in mock data.</p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setMockFlag(true);
            window.location.reload();
          }}
        >
          Use mock data
        </Button>
      </div>
    </div>
  );
}

function SupabaseForm({ onBusy, busy }: { onBusy: (b: string | null) => void; busy: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);

  const google = async () => {
    const sb = getSupabase();
    if (!sb) return;
    onBusy("google");
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (error) {
      onBusy(null);
      toast("Google sign-in failed", { body: error.message, tone: "error" });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    onBusy("email");
    try {
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          onBusy(null);
          return;
        }
      }
      clearQueries();
      const me = await api.me();
      router.replace(nextParam() ?? homeFor(me.profile.role));
    } catch (err) {
      onBusy(null);
      toast(mode === "in" ? "Sign-in failed" : "Sign-up failed", { body: errorMessage(err), tone: "error" });
    }
  };

  return (
    <div>
      <Button variant="outline" size="lg" className="w-full" onClick={google} loading={busy === "google"} disabled={!!busy}>
        {busy !== "google" && <GoogleG />} Continue with Google
      </Button>
      <div className="my-5 flex items-center gap-3 text-[12px] text-ink-3">
        <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
      </div>
      <div className="relative mb-4 grid grid-cols-2 rounded-full bg-surface-2 p-1 text-[13px] font-medium">
        {(["in", "up"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn("relative z-10 h-8 rounded-full transition-colors", mode === m ? "text-ink" : "text-ink-3")}>
            {mode === m && <motion.span layoutId="auth-tab" className="absolute inset-0 -z-10 rounded-full bg-surface shadow-[var(--shadow-soft)]" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            {m === "in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {sent ? (
          <motion.p key="sent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl bg-ok-soft p-4 text-[14px] text-ink">
            Check <b>{email}</b> for a confirmation link, then come back here.
          </motion.p>
        ) : (
          <motion.form key="form" onSubmit={submit} className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Field icon={Mail} type="email" label="Email" value={email} onChange={setEmail} autoComplete="email" />
            <Field icon={Lock} type="password" label="Password" value={password} onChange={setPassword} autoComplete={mode === "in" ? "current-password" : "new-password"} />
            <Button type="submit" size="lg" className="w-full" loading={busy === "email"} disabled={!!busy || !email || password.length < 6}>
              {mode === "in" ? "Sign in" : "Create account"}
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  type,
  autoComplete,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex h-12 items-center gap-3 rounded-2xl bg-surface px-4 hairline transition focus-within:shadow-[0_0_0_4px_var(--brand-soft)]">
      <Icon className="size-4 text-ink-3" aria-hidden />
      <span className="sr-only">{label}</span>
      <input
        type={type}
        required
        placeholder={label}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
      />
    </label>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

/** Left brand panel: deep navy with a quiet constellation of shops joining one pool. */
function BrandPanel() {
  const dots = Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.4;
    const r = 120 + ((i * 37) % 90);
    return { x: Math.round(200 + Math.cos(a) * r), y: Math.round(200 + Math.sin(a) * r * 0.82), d: (i % 7) * 0.35 };
  });
  return (
    <aside className="relative hidden overflow-hidden bg-[#00173a] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_30%_20%,rgba(0,186,242,0.28),transparent_60%),radial-gradient(60%_50%_at_80%_90%,rgba(61,90,254,0.25),transparent_60%)]" />
      <div className="relative">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <Logo size={30} wordmark={false} />
          <span className="text-[19px] font-semibold tracking-[-0.02em]">Mohalla</span>
        </Link>
      </div>
      <div className="relative mx-auto w-full max-w-[420px]">
        <svg viewBox="0 0 400 400" className="w-full" aria-hidden>
          {dots.map((d, i) => (
            <g key={i}>
              <motion.line
                x1={d.x}
                y1={d.y}
                x2={200}
                y2={200}
                stroke="rgba(0,186,242,0.35)"
                strokeWidth={1}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: [0, 1, 1], opacity: [0, 0.8, 0] }}
                transition={{ duration: 3.6, delay: d.d + 0.6, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
              />
              <motion.circle
                cx={d.x}
                cy={d.y}
                r={3.2}
                fill="#7fdcff"
                animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.35, 1] }}
                transition={{ duration: 2.8, delay: d.d, repeat: Infinity, ease: "easeInOut" }}
                style={{ transformOrigin: `${d.x}px ${d.y}px` }}
              />
            </g>
          ))}
          <circle cx="200" cy="200" r="46" fill="rgba(0,186,242,0.12)" stroke="rgba(0,186,242,0.5)" />
          <motion.circle
            cx="200"
            cy="200"
            r="46"
            fill="none"
            stroke="#22C6FF"
            strokeWidth="4"
            strokeLinecap="round"
            transform="rotate(-90 200 200)"
            initial={{ pathLength: 0.67 }}
            animate={{ pathLength: [0.67, 1, 1, 0.67] }}
            transition={{ duration: 6, repeat: Infinity, times: [0, 0.45, 0.85, 1], ease: "easeInOut" }}
          />
          <text x="200" y="198" textAnchor="middle" fill="white" fontSize="20" fontWeight="600" letterSpacing="-0.5">
            40
          </text>
          <text x="200" y="216" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="10">
            cases · 6% slab
          </text>
        </svg>
      </div>
      <div className="relative max-w-md">
        <p className="text-[28px] font-semibold leading-[1.15] tracking-[-0.03em]">
          One kirana is small. Fifty kiranas on one street buy like a supermarket chain.
        </p>
        <p className="mt-4 text-[15px] text-white/60">एक दुकान छोटी है। पूरा मोहल्ला मिलकर बड़ा है।</p>
      </div>
    </aside>
  );
}
