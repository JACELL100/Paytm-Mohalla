"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, RefreshCw, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toaster";
import { api, errorMessage } from "@/lib/api";
import { useDemoNow } from "@/lib/clock";
import { inr, mmss } from "@/lib/format";
import type { DeliveryQr, DistributorOrder, Pool } from "@/lib/types";

export interface QrTarget {
  pool: Pool;
  delivery: DistributorOrder["deliveries"][number];
}

const FEE_BPS = 100;

function Success({ amount }: { amount: number }) {
  const fee = Math.floor((amount * FEE_BPS) / 10000);
  return (
    <motion.div
      key="ok"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="flex flex-col items-center py-6 text-center"
    >
      <div className="relative grid size-[132px] place-items-center">
        <motion.span
          className="absolute inset-0 rounded-full bg-ok/15"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: [0.4, 1.15, 1], opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.span
          className="absolute inset-3 rounded-full bg-ok/20"
          initial={{ scale: 0.4 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.08, type: "spring", stiffness: 300, damping: 18 }}
        />
        <motion.span
          className="relative grid size-20 place-items-center rounded-full bg-ok text-white shadow-[0_16px_40px_-10px_var(--ok)]"
          initial={{ scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 420, damping: 16 }}
        >
          <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.35, duration: 0.45 }} />
          </svg>
        </motion.span>
      </div>
      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-5 text-[14px] font-medium text-ok">
        Delivery confirmed by the shop
      </motion.p>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38 }}
        className="mt-1 text-[34px] font-semibold tracking-[-0.03em] text-ink tabular"
      >
        Payment released {inr(amount - fee)}
      </motion.p>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-2 max-w-sm text-[13.5px] text-ink-2">
        Escrow paid your wallet directly on-chain. Paytm fee {inr(fee)} (1%) is visible in the same transaction.
      </motion.p>
    </motion.div>
  );
}

export function QrModal({ target, orders, onClose }: { target: QrTarget | null; orders: DistributorOrder[] | undefined; onClose: () => void }) {
  const [qrState, setQrState] = useState<{ key: string; qr: DeliveryQr } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const now = useDemoNow();
  const reduce = useReducedMotion();

  const poolId = target?.pool.id;
  const merchantId = target?.delivery.merchant.id;
  const curKey = `${poolId}:${merchantId}`;
  const qr = qrState?.key === curKey ? qrState.qr : null;

  // QR payload is fetched imperatively (not via the shared query cache) so background refetches never rotate the nonce mid-scan.
  const fetchQr = useCallback(async () => {
    if (!poolId || !merchantId) return;
    const key = `${poolId}:${merchantId}`;
    try {
      const res = await api.dQr(poolId, merchantId);
      setQrState({ key, qr: res });
      setErr(null);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [poolId, merchantId]);

  useEffect(() => {
    if (!poolId || !merchantId) return;
    let alive = true;
    api
      .dQr(poolId, merchantId)
      .then((res) => {
        if (!alive) return;
        setQrState({ key: `${poolId}:${merchantId}`, qr: res });
        setErr(null);
      })
      .catch((e) => alive && setErr(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [poolId, merchantId]);

  const refresh = async () => {
    setLoading(true);
    await fetchQr();
    setLoading(false);
  };

  const live = orders
    ?.find((o) => o.pool.id === poolId)
    ?.deliveries.find((d) => d.merchant.id === merchantId);
  const delivered = (live?.status ?? target?.delivery.status) === "delivered";

  useEffect(() => {
    if (!delivered || reduce) return;
    let cancelled = false;
    import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const opts = { particleCount: 70, spread: 70, startVelocity: 38, ticks: 180, scalar: 0.9, zIndex: 100, colors: ["#12a150", "#2fd176", "#00baf2", "#ffffff"] };
      confetti({ ...opts, origin: { x: 0.38, y: 0.45 }, angle: 60 });
      confetti({ ...opts, origin: { x: 0.62, y: 0.45 }, angle: 120 });
    });
    return () => {
      cancelled = true;
    };
  }, [delivered, reduce]);

  const copy = async () => {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.qr_payload);
      setCopied(true);
      toast("Delivery code copied", { tone: "success", body: "Paste it in the merchant's Scan screen" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Couldn't copy", { tone: "error", body: "Select the code and copy it manually" });
    }
  };

  const expiresIn = qr && now ? new Date(qr.expires_at).getTime() - now : null;
  const d = target?.delivery;

  return (
    <Modal open={!!target} onClose={onClose} label="Delivery QR code" className="max-w-[560px] p-7">
      {target && d && (
        <AnimatePresence mode="wait" initial={false}>
          {delivered ? (
            <Success key="ok" amount={d.amount_paise} />
          ) : (
            <motion.div key="qr" exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.2 }}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-ink">Delivery handover</p>
              <h2 className="mt-1 pr-10 text-[24px] font-semibold tracking-[-0.025em] text-ink">{d.merchant.name}</h2>
              <p className="mt-1 text-[14px] text-ink-2">
                {target.pool.sku.emoji} {d.cases} {d.cases === 1 ? "case" : "cases"} of {target.pool.sku.name} ·{" "}
                <span className="font-medium text-ink tabular">{inr(d.amount_paise)}</span>
              </p>

              <div className="relative mx-auto mt-6 grid w-fit place-items-center rounded-[28px] bg-white p-5 shadow-[var(--shadow-lift)] ring-1 ring-black/5">
                {qr ? (
                  <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}>
                    <QRCodeSVG value={qr.qr_payload} size={340} level="M" marginSize={2} bgColor="#ffffff" fgColor="#04122b" title="Mohalla delivery QR" />
                  </motion.div>
                ) : err ? (
                  <div className="grid size-[340px] place-items-center p-6 text-center">
                    <div>
                      <p className="text-[14px] font-medium text-[#04122b]">Couldn’t create the code</p>
                      <p className="mt-1 text-[13px] text-[#4a5468]">{err}</p>
                    </div>
                  </div>
                ) : (
                  <Skeleton className="size-[340px] rounded-xl bg-[#eef1f5]" />
                )}
                {qr && !reduce && (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-6 top-0 h-12 bg-gradient-to-b from-transparent via-[#00baf2]/10 to-transparent"
                    initial={{ y: 20 }}
                    animate={{ y: [20, 300, 20] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </div>

              <div className="mt-5 flex items-center justify-center gap-2 text-[13px] text-ink-2">
                <ScanLine className="size-4 text-brand-ink" />
                Shopkeeper scans this in Mohalla → Scan
                {expiresIn !== null && (
                  <span className="text-ink-3 tabular">· expires in {expiresIn > 0 ? mmss(expiresIn) : "—"}</span>
                )}
              </div>

              <div className="mt-5 flex items-stretch gap-2">
                <code className="no-scrollbar flex h-11 min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-xl bg-surface-2 px-3 font-mono text-[12px] text-ink-2 hairline">
                  {qr?.qr_payload ?? "…"}
                </code>
                <Button variant="primary" size="lg" className="h-11 rounded-xl" onClick={copy} disabled={!qr} aria-label="Copy delivery code">
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button variant="outline" size="icon" className="size-11 rounded-xl" onClick={() => void refresh()} loading={loading} aria-label="Generate a fresh code">
                  {!loading && <RefreshCw className="size-4" />}
                </Button>
              </div>
              <p className="mt-3 text-center text-[12px] text-ink-3">One-time code · HMAC-signed · releases this shop’s escrow only</p>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </Modal>
  );
}
