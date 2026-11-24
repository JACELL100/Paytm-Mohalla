"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CameraOff, ClipboardPaste, ExternalLink, Package, ScanLine, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { invalidate, useQuery } from "@/lib/query";
import { useLang } from "@/lib/i18n";
import { cn, inr } from "@/lib/format";
import { MHeader } from "@/components/merchant/MHeader";
import { TrustRing } from "@/components/merchant/bits";
import { SuccessCheck } from "@/components/merchant/ConfirmCard";
import { Button } from "@/components/ui/Button";
import { NumberTicker, Skeleton } from "@/components/ui/primitives";
import { TxBadge } from "@/components/ui/TxBadge";
import { toast } from "@/components/ui/Toaster";
import type { DeliveryConfirmResponse, MerchantDelivery } from "@/lib/types";

const Scanner = dynamic(() => import("@yudiel/react-qr-scanner").then((m) => m.Scanner), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#05080f]" />,
});

function Viewfinder({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const corner = "absolute size-12 border-white";
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 shadow-[inset_0_0_0_2000px_rgba(3,6,14,0.35)] [mask-image:radial-gradient(circle_at_center,transparent_42%,black_43%)]" />
      <motion.div
        className="absolute inset-[16%]"
        animate={reduce ? undefined : { scale: [1, 1.03, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className={cn(corner, "left-0 top-0 rounded-tl-[22px] border-l-[3px] border-t-[3px]")} />
        <span className={cn(corner, "right-0 top-0 rounded-tr-[22px] border-r-[3px] border-t-[3px]")} />
        <span className={cn(corner, "bottom-0 left-0 rounded-bl-[22px] border-b-[3px] border-l-[3px]")} />
        <span className={cn(corner, "bottom-0 right-0 rounded-br-[22px] border-b-[3px] border-r-[3px]")} />
        {active && !reduce && (
          <motion.span
            className="absolute inset-x-3 h-16 bg-[linear-gradient(180deg,transparent,rgba(34,198,255,0.35),transparent)]"
            initial={{ top: "-10%" }}
            animate={{ top: ["-10%", "85%", "-10%"] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="absolute inset-x-0 top-1/2 h-[2px] rounded-full bg-[#22C6FF] shadow-[0_0_12px_2px_rgba(34,198,255,0.8)]" />
          </motion.span>
        )}
      </motion.div>
    </div>
  );
}

export default function ScanPage() {
  const { lang, t } = useLang();
  const deliveries = useQuery<MerchantDelivery[]>("m:deliveries", api.mDeliveries, { interval: 5000 });
  const [cameraOk, setCameraOk] = useState<boolean | null>(null);
  const [paste, setPaste] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeliveryConfirmResponse | null>(null);
  const lastCode = useRef("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const devs = await navigator.mediaDevices?.enumerateDevices?.();
        const has = !!devs?.some((d) => d.kind === "videoinput");
        if (alive) {
          setCameraOk(has);
          if (!has) setPaste(true);
        }
      } catch {
        if (alive) {
          setCameraOk(false);
          setPaste(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (payload: string) => {
    const v = payload.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      const r = await api.confirmDelivery(v);
      if ("vibrate" in navigator) navigator.vibrate?.([20, 40, 20]);
      setResult(r);
      setCode("");
      void invalidate("m:");
      void invalidate("pool:");
    } catch (e) {
      toast(lang === "hi" ? "Code verify नहीं हुआ" : "Couldn't verify the code", { body: errorMessage(e), tone: "error" });
      lastCode.current = "";
    } finally {
      setBusy(false);
    }
  };

  const pending = (deliveries.data ?? []).filter((d) => d.status === "pending");

  return (
    <div>
      <MHeader title={t("scan_title")} />
      <div className="px-4">
        <AnimatePresence mode="wait">
          {result ? (
            <Success key="ok" r={result} onAgain={() => setResult(null)} />
          ) : (
            <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
              {/* viewfinder */}
              <div className="relative aspect-square overflow-hidden rounded-[32px] bg-[#05080f] shadow-[var(--shadow-lift)]">
                {!paste && cameraOk && (
                  <Scanner
                    onScan={(codes) => {
                      const v = codes[0]?.rawValue;
                      if (v && v !== lastCode.current) {
                        lastCode.current = v;
                        void submit(v);
                      }
                    }}
                    onError={() => {
                      setCameraOk(false);
                      setPaste(true);
                    }}
                    paused={busy}
                    constraints={{ facingMode: "environment" }}
                    components={{ finder: false, torch: false, onOff: false, zoom: false }}
                    sound={false}
                    styles={{ container: { position: "absolute", inset: 0, width: "100%", height: "100%" }, video: { objectFit: "cover", width: "100%", height: "100%" } }}
                  />
                )}
                {(paste || cameraOk === false) && (
                  <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_40%,#10213f,#05080f_70%)] text-center">
                    <div className="px-8 text-white/80">
                      {cameraOk === false ? <CameraOff className="mx-auto size-8 text-white/50" /> : <ScanLine className="mx-auto size-8 text-white/50" />}
                      <p className="mt-3 text-[14px]">{cameraOk === false ? t("camera_off") : t("paste_hint")}</p>
                    </div>
                  </div>
                )}
                <Viewfinder active={!paste && !!cameraOk && !busy} />
                {busy && (
                  <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-sm">
                    <span className="size-10 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
                  </div>
                )}
                <p className="absolute inset-x-0 bottom-5 text-center text-[13px] font-medium text-white/85">{t("scan_sub")}</p>
              </div>

              {/* paste fallback */}
              <div className="mt-4 rounded-[24px] bg-surface p-4 hairline shadow-[var(--shadow-soft)]">
                <button onClick={() => setPaste((p) => !p)} className="flex w-full items-center gap-3 text-left">
                  <span className="grid size-10 place-items-center rounded-2xl bg-surface-2 text-ink-2">
                    <ClipboardPaste className="size-[18px]" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[15px] font-semibold text-ink">{t("paste_code")}</span>
                    <span className="block text-[12.5px] text-ink-3">{t("paste_hint")}</span>
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {paste && (
                    <motion.form
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submit(code);
                      }}
                    >
                      <label htmlFor="qr-code" className="sr-only">
                        {t("paste_code")}
                      </label>
                      <textarea
                        id="qr-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        rows={3}
                        placeholder="MOHALLA1.…"
                        className="mt-3 w-full resize-none rounded-2xl bg-surface-2 p-3 font-mono text-[12px] text-ink outline-none focus:shadow-[0_0_0_3px_var(--brand-soft)]"
                      />
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="md"
                          onClick={async () => {
                            try {
                              setCode(await navigator.clipboard.readText());
                            } catch {
                              toast("Clipboard blocked — paste manually", { tone: "info" });
                            }
                          }}
                        >
                          <ClipboardPaste className="size-4" /> {lang === "hi" ? "पेस्ट" : "Paste"}
                        </Button>
                        <Button type="submit" size="md" className="flex-1" loading={busy} disabled={!code.trim()}>
                          {t("verify")}
                        </Button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>

              {/* expected deliveries */}
              <section className="mt-6">
                <h2 className="mb-2.5 px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">{t("pending_deliveries")}</h2>
                {deliveries.loading ? (
                  <Skeleton className="h-[72px]" />
                ) : pending.length === 0 ? (
                  <p className="rounded-[22px] bg-surface-2 px-4 py-5 text-center text-[13.5px] text-ink-3">{t("no_deliveries")}</p>
                ) : (
                  <ul className="space-y-2">
                    {pending.map((d) => (
                      <li key={d.pool.id} className="flex items-center gap-3 rounded-[22px] bg-surface p-3.5 hairline shadow-[var(--shadow-soft)]">
                        <span className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-[22px]">{d.pool.sku.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold text-ink">{d.pool.sku.name}</p>
                          <p className="text-[12.5px] text-ink-3">
                            {d.cases} {t("cases")} · {inr(d.amount_paise)} · {d.pool.distributor.name}
                          </p>
                        </div>
                        <Package className="size-4 text-warn" />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Success({ r, onAgain }: { r: DeliveryConfirmResponse; onAgain: () => void }) {
  const { lang, t } = useLang();
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center pt-4 text-center">
      <SuccessCheck size={84} />
      <h2 className="mt-5 text-[26px] font-semibold tracking-[-0.03em] text-ink">{t("delivery_confirmed")}</h2>
      <p className="mt-1 text-[14px] text-ink-2">
        {r.pool.sku.emoji} {r.pool.sku.name} · {r.pool.mine?.committed_cases ?? ""} {t("cases")}
      </p>

      <div className="mt-6 w-full rounded-[26px] bg-surface p-5 text-left hairline shadow-[var(--shadow-soft)]">
        <p className="text-[12.5px] font-medium text-ink-3">{t("paid_to_distributor")}</p>
        <p className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.04em] text-ink">
          <NumberTicker value={r.payout_paise} from={0} format={(v) => inr(v)} />
        </p>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[14px]">
          <span className="text-ink-2">{t("paytm_fee")}</span>
          <span className="tabular font-medium text-ink">{inr(r.fee_paise, { paise: true })}</span>
        </div>
        <TxBadge tx={r.tx} lang={lang} className="mt-4" />
        {r.attestation_url && (
          <a href={r.attestation_url} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-between rounded-2xl bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-ink transition hover:bg-surface-3">
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-ok" /> {t("attestation")}
            </span>
            <ExternalLink className="size-4 text-ink-3" />
          </a>
        )}
      </div>

      <Link href="/m/trust" className="mt-4 flex w-full items-center gap-4 rounded-[26px] bg-[linear-gradient(135deg,#eafff3,#f4fbff)] p-4 text-left hairline dark:bg-surface">
        <TrustRing score={r.trust.score} from={r.trust.score - r.trust.delta} size={72} stroke={6}>
          <span className="tabular text-[17px] font-semibold tracking-[-0.02em] text-ink">
            <NumberTicker value={r.trust.score} from={r.trust.score - r.trust.delta} duration={1.6} />
          </span>
        </TrustRing>
        <div className="flex-1">
          <p className="text-[13px] font-medium text-ink-3">{t("trust_up")}</p>
          <motion.p
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, type: "spring", stiffness: 400, damping: 20 }}
            className="text-[24px] font-semibold tracking-[-0.03em] text-ok"
          >
            +{r.trust.delta}
          </motion.p>
        </div>
      </Link>

      <div className="mt-5 grid w-full grid-cols-2 gap-2.5">
        <Button variant="secondary" size="lg" onClick={onAgain}>
          {t("scan_again")}
        </Button>
        <Link href="/m" className="inline-flex h-12 items-center justify-center rounded-2xl bg-navy text-[15px] font-medium text-white">
          {t("done")}
        </Link>
      </div>
    </motion.div>
  );
}
