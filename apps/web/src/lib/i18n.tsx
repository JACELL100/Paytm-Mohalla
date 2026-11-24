"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Lang } from "./types";

const dict = {
  greeting_morning: { hi: "सुप्रभात", en: "Good morning" },
  greeting_afternoon: { hi: "नमस्ते", en: "Good afternoon" },
  greeting_evening: { hi: "शुभ संध्या", en: "Good evening" },
  ji: { hi: "जी", en: "ji" },
  soundbox: { hi: "Mohalla Soundbox", en: "Mohalla Soundbox" },
  new_message: { hi: "नया संदेश", en: "New message" },
  play: { hi: "सुनें", en: "Play" },
  stop: { hi: "रोकें", en: "Stop" },
  replay: { hi: "फिर से सुनें", en: "Replay" },
  this_week: { hi: "इस हफ़्ते की माँग", en: "Demand this week" },
  vs_normal: { hi: "आम हफ़्ते से", en: "vs a normal week" },
  need_cases: { hi: "case और चाहिए", en: "more cases needed" },
  pool_invite: { hi: "आपके लिए pool", en: "Pool for you" },
  shops_pooling: { hi: "दुकानें जुड़ीं", en: "shops pooling" },
  cases: { hi: "case", en: "cases" },
  case_one: { hi: "case", en: "case" },
  of: { hi: "में से", en: "of" },
  join_pool: { hi: "Pool में जुड़ें", en: "Join pool" },
  view_pool: { hi: "Pool देखें", en: "View pool" },
  saved_total: { hi: "अब तक की बचत", en: "Saved so far" },
  across_pools: { hi: "pools में", en: "across pools" },
  trust_score: { hi: "Trust Score", en: "Trust Score" },
  wallet: { hi: "Wallet", en: "Wallet" },
  balance: { hi: "बैलेंस", en: "Balance" },
  your_pools: { hi: "आपके pools", en: "Your pools" },
  open_pools: { hi: "खुले pools", en: "Open pools" },
  home: { hi: "होम", en: "Home" },
  talk: { hi: "बोलें", en: "Talk" },
  scan: { hi: "स्कैन", en: "Scan" },
  trust: { hi: "भरोसा", en: "Trust" },
  ends_in: { hi: "बचा समय", en: "Ends in" },
  target: { hi: "लक्ष्य", en: "Target" },
  price_per_case: { hi: "प्रति case कीमत", en: "Price per case" },
  you_save: { hi: "आपकी बचत", en: "You save" },
  per_case: { hi: "प्रति case", en: "per case" },
  how_many: { hi: "कितने case?", en: "How many cases?" },
  suggested: { hi: "सुझाव", en: "Suggested" },
  pay_later: { hi: "Pool Credit से बाद में चुकाएँ", en: "Pay later with Pool Credit" },
  pay_later_sub: { hi: "रोज़ की Paytm कमाई से थोड़ा-थोड़ा कटेगा", en: "Repaid in small cuts from daily Paytm settlements" },
  total: { hi: "कुल", en: "Total" },
  review: { hi: "Review करें", en: "Review" },
  confirm: { hi: "पक्का करें", en: "Confirm" },
  cancel: { hi: "रद्द करें", en: "Cancel" },
  confirm_title: { hi: "Order पक्का करें", en: "Confirm your order" },
  escrow_note: {
    hi: "पैसा smart-contract escrow में रहेगा। Pool पूरा न हुआ तो पूरा पैसा वापस।",
    en: "Money stays in a smart-contract escrow. If the pool doesn't fill, everyone is refunded in full.",
  },
  no_gas: { hi: "कोई gas fee नहीं — Mohalla भरता है", en: "No gas fees — Mohalla covers them" },
  recording: { hi: "Sepolia पर दर्ज हो रहा है…", en: "Recording on Sepolia…" },
  confirmed_chain: { hi: "Chain पर दर्ज", en: "Confirmed on-chain" },
  simulated_chain: { hi: "दर्ज (simulated)", en: "Recorded (simulated)" },
  view_etherscan: { hi: "Etherscan पर देखें", en: "View on Etherscan" },
  you_are_in: { hi: "आप pool में हैं", en: "You're in" },
  funded: { hi: "Pool पूरा!", en: "Pool funded!" },
  funded_sub: { hi: "Scheme पक्की — distributor को order चला गया", en: "Scheme locked — order sent to the distributor" },
  failed: { hi: "Pool पूरा नहीं हुआ", en: "Pool didn't fill" },
  failed_sub: { hi: "सबका पैसा पूरा वापस", en: "Everyone was refunded in full" },
  settled: { hi: "Delivery पूरी", en: "Delivered & settled" },
  shop_joined: { hi: "एक दुकान अभी जुड़ी", en: "A shop just joined" },
  slab_ladder: { hi: "Discount slabs", en: "Discount slabs" },
  unlocked: { hi: "खुला", en: "Unlocked" },
  base_price: { hi: "आम कीमत", en: "Usual price" },
  pool_price: { hi: "Pool कीमत", en: "Pool price" },
  privacy_note: {
    hi: "किसी दुकान का नाम या बिक्री नहीं दिखती — सिर्फ़ कुल जोड़।",
    en: "No shop's name or sales are ever shown — only pool totals.",
  },
  distributor: { hi: "Distributor", en: "Distributor" },
  deadline: { hi: "आख़िरी समय", en: "Deadline" },
  your_order: { hi: "आपका order", en: "Your order" },
  credit_offer: { hi: "Pool Credit ऑफ़र", en: "Pool Credit offer" },
  rate: { hi: "ब्याज", en: "Rate" },
  tenure: { hi: "अवधि", en: "Tenure" },
  days: { hi: "दिन", en: "days" },
  daily_cut: { hi: "रोज़ की कटौती", en: "Daily deduction" },
  of_settlements: { hi: "settlement का", en: "of settlements" },
  saathi: { hi: "Mohalla साथी", en: "Mohalla Saathi" },
  hold_to_talk: { hi: "दबाकर बोलें", en: "Hold to talk" },
  listening: { hi: "सुन रहा हूँ…", en: "Listening…" },
  thinking: { hi: "सोच रहा हूँ…", en: "Thinking…" },
  type_message: { hi: "या यहाँ लिखें…", en: "Or type here…" },
  saathi_intro: {
    hi: "नमस्ते रमेश जी! मैं आपका Mohalla साथी हूँ। Pool, बचत या credit — कुछ भी पूछिए।",
    en: "Namaste Ramesh ji! I'm your Mohalla Saathi. Ask me about pools, savings or credit.",
  },
  scan_title: { hi: "Delivery QR स्कैन करें", en: "Scan delivery QR" },
  scan_sub: { hi: "Distributor का QR फ्रेम में रखें", en: "Point at the distributor's QR code" },
  paste_code: { hi: "कोड पेस्ट करें", en: "Paste code" },
  paste_hint: { hi: "Camera नहीं है? Distributor का code यहाँ डालें", en: "No camera? Paste the distributor's code here" },
  verify: { hi: "Verify करें", en: "Verify" },
  delivery_confirmed: { hi: "Delivery पक्की!", en: "Delivery confirmed!" },
  paid_to_distributor: { hi: "Distributor को भुगतान", en: "Paid to distributor" },
  paytm_fee: { hi: "Paytm fee (1%)", en: "Paytm fee (1%)" },
  attestation: { hi: "Attestation देखें", en: "View attestation" },
  trust_up: { hi: "Trust Score बढ़ा", en: "Trust Score up" },
  done: { hi: "हो गया", en: "Done" },
  scan_again: { hi: "फिर से स्कैन", en: "Scan again" },
  camera_off: { hi: "Camera उपलब्ध नहीं", en: "Camera unavailable" },
  pending_deliveries: { hi: "आने वाली deliveries", en: "Expected deliveries" },
  no_deliveries: { hi: "अभी कोई delivery बाकी नहीं", en: "No deliveries pending right now" },
  components: { hi: "Score किससे बनता है", en: "What makes your score" },
  honoured: { hi: "वादे निभाए", en: "Commitments honoured" },
  pools_joined: { hi: "Pools जुड़े", en: "Pools joined" },
  stability: { hi: "बिक्री की स्थिरता", en: "Sales stability" },
  tenure_paytm: { hi: "Paytm पर समय", en: "Time on Paytm" },
  months: { hi: "महीने", en: "months" },
  history: { hi: "पिछले 6 महीने", en: "Last 6 months" },
  attestations: { hi: "On-chain सबूत", en: "On-chain attestations" },
  trust_explain: {
    hi: "आपका score EAS attestations से बनता है — कोई भी इसे जाँच सकता है, और आप इसे कहीं भी ले जा सकते हैं।",
    en: "Built from EAS attestations — anyone can verify it, and it travels with you to any lender.",
  },
  retry: { hi: "फिर कोशिश करें", en: "Try again" },
  sign_out: { hi: "Sign out", en: "Sign out" },
  left: { hi: "बाकी", en: "left" },
  forecast_why: { hi: "क्यों?", en: "Why?" },
  stock_now: { hi: "अभी stock", en: "In stock" },
  units: { hi: "units", en: "units" },
  committed: { hi: "जुड़े", en: "committed" },
  not_invited: { hi: "आपके area का pool", en: "Pool in your area" },
  wallet_low: { hi: "Wallet बैलेंस कम है — Pool Credit चालू करें", en: "Wallet balance is low — turn on Pool Credit" },
  from_wallet: { hi: "Paytm wallet से", en: "From Paytm wallet" },
  ask_saathi: { hi: "साथी से पूछें", en: "Ask Saathi" },
  mic_denied: { hi: "Mic की अनुमति नहीं मिली — लिखकर पूछें", en: "Microphone blocked — type instead" },
  speech_unsupported: { hi: "इस browser में आवाज़ पहचान नहीं — लिखकर पूछें", en: "Voice input isn't supported here — type instead" },
} satisfies Record<string, { hi: string; en: string }>;

export type TKey = keyof typeof dict;

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey) => string;
}

const Ctx = createContext<LangCtx>({ lang: "hi", setLang: () => {}, t: (k) => dict[k].hi });

const LS = "mohalla.lang";

export function readStoredLang(): Lang | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(LS);
    return v === "hi" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

export function LangProvider({
  children,
  initial = "hi",
  onChange,
}: {
  children: ReactNode;
  initial?: Lang;
  onChange?: (l: Lang) => void;
}) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      try {
        window.localStorage.setItem(LS, l);
      } catch {
        /* ignore */
      }
      onChange?.(l);
    },
    [onChange],
  );
  const value = useMemo<LangCtx>(() => ({ lang, setLang, t: (k) => dict[k][lang] }), [lang, setLang]);
  return (
    <Ctx.Provider value={value}>
      <div lang={lang} className={lang === "hi" ? "lang-hi contents" : "contents"}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

export const useLang = () => useContext(Ctx);
