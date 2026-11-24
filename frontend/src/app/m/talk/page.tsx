"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Mic, Sparkles, Volume2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { invalidate, useQuery } from "@/lib/query";
import { useLang } from "@/lib/i18n";
import { speak, type SpeakHandle } from "@/lib/speech";
import { cn } from "@/lib/format";
import { MHeader } from "@/components/merchant/MHeader";
import { Waveform } from "@/components/merchant/Waveform";
import { ConfirmCard } from "@/components/merchant/ConfirmCard";
import { toast } from "@/components/ui/Toaster";
import { OverlayPortal } from "@/components/ui/OverlayPortal";
import type { Health, Lang, PendingAction, Pool } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = any;

interface Msg {
  id: number;
  role: "user" | "assistant";
  text: string;
  lang: Lang;
  actions?: PendingAction[];
  pending?: boolean;
}

function getRecognition(): Rec | null {
  if (typeof window === "undefined") return null;
  const C = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return C ? new C() : null;
}

let seq = 0;

export default function TalkPage() {
  const { lang, t } = useLang();
  const health = useQuery<Health>("health", api.health, { staleMs: 60000 });
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ id: ++seq, role: "assistant", text: "", lang: "hi" }]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [thinking, setThinking] = useState(false);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [input, setInput] = useState("");
  const [toggleMode, setToggleMode] = useState(false);
  const [autoConfirm, setAutoConfirm] = useState<Record<string, number>>({});

  const listRef = useRef<HTMLDivElement>(null);
  const media = useRef<{ stream?: MediaStream; ctx?: AudioContext; rec?: MediaRecorder; chunks: Blob[]; sr?: Rec; final: string; downAt: number; toggle: boolean }>({ chunks: [], final: "", downAt: 0, toggle: false });
  const speakH = useRef<SpeakHandle | null>(null);
  const interimRef = useRef("");
  const shownActions = useRef(new Set<string>());
  useEffect(() => {
    interimRef.current = interim;
  }, [interim]);

  const defaultSuggestions = lang === "hi" ? ["6 case daal do, paise baad mein dunga", "Kitna bachega?", "Mera trust score kya hai?", "Kaunse pool khule hain?"] : ["Add 6 cases, I'll pay later", "How much will I save?", "What's my trust score?", "Which pools are open?"];
  const chips = suggestions.length ? suggestions : defaultSuggestions;

  useEffect(() => {
    // Scroll only the phone scroller (never ancestors), and only while this page is mounted.
    const sc = document.getElementById("m-scroll");
    if (sc && listRef.current) sc.scrollTo({ top: sc.scrollHeight, behavior: msgs.length > 1 ? "smooth" : "auto" });
  }, [msgs, thinking, interim]);

  useEffect(
    () => () => {
      speakH.current?.stop();
      media.current.stream?.getTracks().forEach((tr) => tr.stop());
      void media.current.ctx?.close();
    },
    [],
  );

  const say = useCallback((id: number, text: string, l: Lang, url: string | null) => {
    speakH.current?.stop();
    setSpeakingId(id);
    speakH.current = speak({ text, lang: l, audioUrl: url, onEnd: () => setSpeakingId((s) => (s === id ? null : s)) });
  }, []);

  const send = useCallback(
    async (payload: { text?: string; audio?: Blob }) => {
      const text = payload.text?.trim();
      if (!text && !payload.audio) return;
      const userId = ++seq;
      setMsgs((m) => [...m, { id: userId, role: "user", text: text ?? "…", lang, pending: !text }]);
      setThinking(true);
      try {
        const r = await api.voiceTurn({ text, audio: payload.audio, lang });
        const aid = ++seq;
        r.pending_actions.forEach((a) => shownActions.current.add(a.id));
        setMsgs((m) => [
          ...m.map((x) => (x.id === userId ? { ...x, text: r.transcript || x.text, pending: false } : x)),
          { id: aid, role: "assistant", text: r.reply_text, lang: r.reply_lang, actions: r.pending_actions },
        ]);
        setSuggestions(r.suggestions);
        say(aid, r.reply_text, r.reply_lang, r.reply_audio_url);
        // "haan" to an open card: the server names the action; money only moves when WE call /actions/{id}/confirm.
        const cid = r.confirm_action_id;
        if (cid) {
          if (shownActions.current.has(cid)) {
            setAutoConfirm((a) => ({ ...a, [cid]: (a[cid] ?? 0) + 1 }));
          } else {
            api
              .confirmAction(cid)
              .then(() => {
                toast(lang === "hi" ? "Order पक्का हो गया" : "Order confirmed", { tone: "success" });
                void invalidate("m:");
                void invalidate("pool:");
              })
              .catch((e) => toast(lang === "hi" ? "पक्का नहीं हो पाया" : "Couldn't confirm", { body: errorMessage(e), tone: "error" }));
          }
        }
      } catch (e) {
        setMsgs((m) => m.map((x) => (x.id === userId ? { ...x, pending: false, text: x.text === "…" ? "🎙️" : x.text } : x)));
        toast(lang === "hi" ? "साथी जवाब नहीं दे पाया" : "Saathi couldn't answer", { body: errorMessage(e), tone: "error" });
      } finally {
        setThinking(false);
      }
    },
    [lang, say],
  );

  const startListening = async () => {
    if (listening) return;
    speakH.current?.stop();
    setSpeakingId(null);
    const useStt = !!health.data?.stt;
    const sr = useStt ? null : getRecognition();
    if (!useStt && !sr) {
      toast(t("speech_unsupported"), { tone: "info" });
      return;
    }
    const m = media.current;
    m.chunks = [];
    m.final = "";
    setInterim("");
    try {
      m.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(m.stream);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.7;
      src.connect(an);
      m.ctx = ctx;
      setAnalyser(an);
    } catch {
      if (useStt) {
        toast(t("mic_denied"), { tone: "error" });
        return;
      }
    }
    if (useStt && m.stream) {
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const rec = new MediaRecorder(m.stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => e.data.size && m.chunks.push(e.data);
      rec.start();
      m.rec = rec;
    } else if (sr) {
      sr.lang = lang === "hi" ? "hi-IN" : "en-IN";
      sr.interimResults = true;
      sr.continuous = true;
      sr.onresult = (e: any) => {
        let fin = "";
        let mid = "";
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) fin += r[0].transcript;
          else mid += r[0].transcript;
        }
        m.final = fin;
        setInterim((fin + " " + mid).trim());
      };
      sr.onerror = (e: any) => {
        if (e.error === "not-allowed") toast(t("mic_denied"), { tone: "error" });
      };
      try {
        sr.start();
      } catch {
        /* already started */
      }
      m.sr = sr;
    }
    if ("vibrate" in navigator) navigator.vibrate?.(12);
    setListening(true);
  };

  const stopListening = async () => {
    if (!listening) return;
    const m = media.current;
    setListening(false);
    setAnalyser(null);
    const cleanup = () => {
      m.stream?.getTracks().forEach((tr) => tr.stop());
      void m.ctx?.close();
      m.stream = undefined;
      m.ctx = undefined;
    };
    if (m.rec) {
      const rec = m.rec;
      m.rec = undefined;
      await new Promise<void>((res) => {
        rec.onstop = () => res();
        rec.stop();
      });
      cleanup();
      const blob = new Blob(m.chunks, { type: rec.mimeType || "audio/webm" });
      setInterim("");
      if (blob.size > 1200) void send({ audio: blob });
      return;
    }
    if (m.sr) {
      const sr = m.sr;
      m.sr = undefined;
      await new Promise<void>((res) => {
        const done = setTimeout(res, 900);
        sr.onend = () => {
          clearTimeout(done);
          res();
        };
        try {
          sr.stop();
        } catch {
          res();
        }
      });
      cleanup();
      const text = (m.final || interimRef.current).trim();
      setInterim("");
      if (text) void send({ text });
      else toast(lang === "hi" ? "कुछ सुनाई नहीं दिया — फिर से बोलें" : "Didn't catch that — try again", { tone: "info" });
    }
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const m = media.current;
    if (listening && m.toggle) {
      m.toggle = false;
      setToggleMode(false);
      void stopListening();
      return;
    }
    m.downAt = performance.now();
    void startListening();
  };
  const onUp = () => {
    const m = media.current;
    if (!listening && performance.now() - m.downAt > 0) {
      // start may still be pending; treat as toggle
    }
    if (performance.now() - m.downAt < 350) {
      m.toggle = true; // quick tap → keep listening until next tap
      setToggleMode(true);
      return;
    }
    void stopListening();
  };

  const intro = lang === "hi" ? "नमस्ते रमेश जी! मैं आपका Mohalla साथी हूँ। Pool, बचत या credit — कुछ भी पूछिए।" : "Namaste Ramesh ji! I'm your Mohalla Saathi. Ask me about pools, savings or credit.";

  return (
    <div className="flex min-h-full flex-col">
      <MHeader title={t("saathi")} subtitle={<span className="inline-flex items-center gap-1"><Sparkles className="size-3" /> AI · हिंदी / Hinglish</span>} />

      <div className="flex-1 space-y-3 px-4 pb-[200px]">
        <AnimatePresence initial={false}>
          {msgs.map((m, i) => (
            <motion.div
              key={m.id}
              layout="position"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              {m.role === "user" ? (
                <div className={cn("max-w-[82%] rounded-[22px] rounded-br-md bg-navy px-4 py-2.5 text-[15px] leading-snug text-white shadow-[0_6px_16px_-8px_rgba(0,46,110,0.6)]", m.pending && "opacity-70")}>
                  {m.pending ? <Dots light /> : m.text}
                </div>
              ) : (
                <div className="max-w-[92%]">
                  <div className="rounded-[22px] rounded-bl-md bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink hairline shadow-[var(--shadow-soft)]">
                    <div className="flex items-start gap-2">
                      <span className="flex-1">{i === 0 ? intro : m.text}</span>
                      {i > 0 && (
                        <button
                          aria-label="Speak"
                          onClick={() => say(m.id, m.text, m.lang, null)}
                          className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full transition", speakingId === m.id ? "bg-brand text-white" : "bg-surface-2 text-ink-3 hover:text-ink")}
                        >
                          <Volume2 className={cn("size-3.5", speakingId === m.id && "animate-pulse")} />
                        </button>
                      )}
                    </div>
                  </div>
                  {m.actions?.map((a) => (
                    <ActionBubble
                      key={a.id}
                      action={a}
                      autoConfirm={autoConfirm[a.id] ?? 0}
                      onSettled={() => {}}
                      onConfirmed={() => {
                        const id = ++seq;
                        const text = lang === "hi" ? "हो गया रमेश जी! आपका order pool में जुड़ गया। Chain पर दर्ज हो रहा है।" : "Done, Ramesh ji! Your order is in the pool and being recorded on-chain.";
                        setMsgs((ms) => [...ms, { id, role: "assistant", text, lang }]);
                        setSuggestions([]);
                        say(id, text, lang, null);
                      }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          ))}
          {thinking && (
            <motion.div key="thinking" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex">
              <div className="rounded-[22px] rounded-bl-md bg-surface px-4 py-3 hairline">
                <Dots />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={listRef} />
      </div>

      {/* composer (pinned in the phone overlay layer) */}
      <OverlayPortal>
      <div className="pointer-events-none absolute inset-x-0 bottom-[84px] z-30 md:bottom-[92px]">
        <div className="pointer-events-auto mx-3 rounded-[28px] bg-[linear-gradient(180deg,transparent,var(--bg)_22%)] px-1 pt-6">
          <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1">
            {chips.map((c) => (
              <motion.button
                key={c}
                whileTap={{ scale: 0.95 }}
                onClick={() => void send({ text: c })}
                className="h-9 shrink-0 rounded-full bg-surface px-3.5 text-[13px] font-medium text-ink-2 hairline shadow-[var(--shadow-soft)] transition hover:text-ink"
              >
                {c}
              </motion.button>
            ))}
          </div>
          <div className="glass flex items-center gap-3 rounded-[26px] p-2 pl-3 hairline shadow-[var(--shadow-lift)]">
            <div className="relative flex-1">
              <AnimatePresence mode="wait">
                {listening ? (
                  <motion.div key="wave" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-14 flex-col justify-center">
                    <Waveform analyser={analyser} active className="h-8 w-full" />
                    <p className="mt-0.5 truncate text-[12px] text-ink-2">{interim || t("listening")}</p>
                  </motion.div>
                ) : (
                  <motion.form
                    key="input"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = input;
                      setInput("");
                      void send({ text: v });
                    }}
                    className="flex h-14 items-center gap-2"
                  >
                    <label className="sr-only" htmlFor="saathi-input">
                      {t("type_message")}
                    </label>
                    <input
                      id="saathi-input"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={thinking ? t("thinking") : t("type_message")}
                      className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
                    />
                    {input.trim() && (
                      <motion.button initial={{ scale: 0.6 }} animate={{ scale: 1 }} type="submit" aria-label="Send" className="grid size-9 place-items-center rounded-full bg-navy text-white">
                        <ArrowUp className="size-4" />
                      </motion.button>
                    )}
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
            <div className="relative">
              {listening && (
                <>
                  <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand/40" />
                  <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand/30 [animation-delay:0.8s]" />
                </>
              )}
              <motion.button
                onPointerDown={onDown}
                onPointerUp={onUp}
                onPointerLeave={() => listening && !media.current.toggle && void stopListening()}
                onContextMenu={(e) => e.preventDefault()}
                animate={{ scale: listening ? 1.12 : 1 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 500, damping: 24 }}
                aria-label={listening ? t("listening") : t("hold_to_talk")}
                aria-pressed={listening}
                className={cn(
                  "relative grid size-[60px] touch-none select-none place-items-center rounded-full text-white transition-colors",
                  listening ? "bg-[linear-gradient(135deg,#22C6FF,#0A6BD6)] shadow-[0_10px_30px_-6px_rgba(0,186,242,0.9)]" : "bg-[linear-gradient(135deg,#0A3D85,#002E6E)] shadow-[0_10px_24px_-8px_rgba(0,46,110,0.8)]",
                )}
              >
                <Mic className="size-6" />
              </motion.button>
            </div>
          </div>
          <p className="mt-2 text-center text-[11.5px] text-ink-3">
            {listening ? (toggleMode ? (lang === "hi" ? "रोकने के लिए फिर टैप करें" : "Tap again to stop") : lang === "hi" ? "छोड़ें तो भेज दूँगा" : "Release to send") : t("hold_to_talk")}
          </p>
        </div>
      </div>
      </OverlayPortal>
    </div>
  );
}

function ActionBubble({ action, autoConfirm, onSettled, onConfirmed }: { action: PendingAction; autoConfirm: number; onSettled: () => void; onConfirmed: () => void }) {
  const pool = useQuery<Pool>(`pool:${action.payload.pool_id}`, () => api.pool(action.payload.pool_id), { staleMs: 5000 });
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.25, type: "spring", stiffness: 320, damping: 28 }}
      className="mt-2 rounded-[24px] bg-surface p-4 hairline shadow-[var(--shadow-lift)]"
    >
      <ConfirmCard
        compact
        action={action}
        sku={pool.data?.sku}
        autoConfirm={autoConfirm}
        onDone={() => {
          onSettled();
          onConfirmed();
        }}
        onCancel={onSettled}
      />
    </motion.div>
  );
}

function Dots({ light }: { light?: boolean }) {
  return (
    <span className="flex h-5 items-center gap-1" aria-label="…">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={cn("size-1.5 rounded-full", light ? "bg-white" : "bg-ink-3")}
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}
