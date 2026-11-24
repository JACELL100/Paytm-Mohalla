"use client";

import type { Lang } from "./types";

/*
 * Speech output: plays `audio_url` when present, else browser speechSynthesis (hi-IN / en-IN).
 * Reports progress 0..1 so the UI can highlight words karaoke-style. Boundary events are used
 * when the voice fires them; otherwise progress is estimated from elapsed time.
 */

export interface SpeakHandle {
  stop: () => void;
}

export interface SpeakOpts {
  text: string;
  lang: Lang;
  audioUrl?: string | null;
  onProgress?: (p: number) => void;
  onEnd?: () => void;
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const want = lang === "hi" ? "hi" : "en";
  const scored = voices
    .filter((v) => v.lang.toLowerCase().startsWith(want))
    .map((v) => {
      let s = 0;
      if (v.lang.toLowerCase() === (lang === "hi" ? "hi-in" : "en-in")) s += 4;
      if (/google|neural|natural|online/i.test(v.name)) s += 2;
      if (/female|swara|kalpana|heera|lekha|neerja/i.test(v.name)) s += 1;
      return { v, s };
    })
    .sort((a, b) => b.s - a.s);
  return scored[0]?.v ?? null;
}

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Some browsers load voices asynchronously.
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

export function speak({ text, lang, audioUrl, onProgress, onEnd }: SpeakOpts): SpeakHandle {
  let stopped = false;
  let raf = 0;
  const finish = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    onProgress?.(1);
    onEnd?.();
  };

  if (audioUrl) {
    const audio = new Audio(audioUrl);
    const loop = () => {
      if (audio.duration && isFinite(audio.duration)) onProgress?.(audio.currentTime / audio.duration);
      if (!stopped) raf = requestAnimationFrame(loop);
    };
    audio.onended = finish;
    audio.onerror = () => {
      // fall back to synthesis if the file can't play
      if (stopped) return;
      const h = speak({ text, lang, onProgress, onEnd });
      handle.stop = () => {
        stopped = true;
        h.stop();
      };
    };
    const handle: SpeakHandle = {
      stop: () => {
        stopped = true;
        cancelAnimationFrame(raf);
        audio.pause();
      },
    };
    audio.play().then(() => (raf = requestAnimationFrame(loop))).catch(() => audio.onerror?.(new Event("error")));
    return handle;
  }

  if (!speechSupported()) {
    // No TTS: still animate the karaoke text at reading pace.
    const start = performance.now();
    const dur = Math.max(2500, text.split(/\s+/).length * 380);
    const loop = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      onProgress?.(p);
      if (p >= 1) finish();
      else if (!stopped) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return { stop: () => ((stopped = true), cancelAnimationFrame(raf)) };
  }

  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "hi" ? "hi-IN" : "en-IN";
  const v = pickVoice(lang);
  if (v) u.voice = v;
  u.rate = lang === "hi" ? 0.98 : 1;
  u.pitch = 1;

  let boundarySeen = false;
  let start = 0;
  // Hindi TTS speaks ~2.4 words/s; estimate total duration for the time-based fallback.
  const est = Math.max(2000, (text.split(/\s+/).length / (lang === "hi" ? 2.3 : 2.7)) * 1000);
  const loop = (t: number) => {
    if (!boundarySeen && start) onProgress?.(Math.min(0.97, (t - start) / est));
    if (!stopped) raf = requestAnimationFrame(loop);
  };
  u.onstart = () => {
    start = performance.now();
    raf = requestAnimationFrame(loop);
  };
  u.onboundary = (e) => {
    boundarySeen = true;
    onProgress?.(Math.min(1, (e.charIndex + (e.charLength || 1)) / text.length));
  };
  u.onend = finish;
  u.onerror = finish;
  synth.speak(u);
  // Chrome sometimes pauses long utterances; nudge it.
  const keepAlive = setInterval(() => {
    if (stopped) return clearInterval(keepAlive);
    if (!synth.speaking) return clearInterval(keepAlive);
    synth.pause();
    synth.resume();
  }, 10000);
  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearInterval(keepAlive);
      synth.cancel();
    },
  };
}
