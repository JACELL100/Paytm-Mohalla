"""Rule-based intent parser for Hindi (Devanagari), Hinglish (Roman) and English shopkeeper speech.

Used when no LLM is configured or the LLM fails. Examples:
    "haan 6 case daal do, paise baad mein dunga"  -> commit(cases=6, use_credit=True)
    "हाँ छह केस डाल दो, पैसे बाद में दूंगा"          -> commit(cases=6, use_credit=True)
    "mera score kitna hai"                         -> trust
    "haan" (with an open confirmation card)        -> confirm
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")

NUMBER_WORDS: dict[str, int] = {
    # Roman Hindi
    "ek": 1, "do": 2, "doh": 2, "teen": 3, "tin": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5, "paach": 5,
    "pach": 5, "chhe": 6, "chhah": 6, "chah": 6, "chheh": 6, "che": 6, "chhai": 6, "chai": 6, "cheh": 6, "saat": 7,
    "sat": 7, "aath": 8, "ath": 8, "nau": 9, "das": 10, "dus": 10, "gyarah": 11, "gyara": 11, "barah": 12,
    "bara": 12, "terah": 13, "tera": 13, "chaudah": 14, "pandrah": 15, "solah": 16, "satrah": 17, "atharah": 18,
    "unnis": 19, "bees": 20, "bis": 20, "pachchis": 25, "tees": 30,
    # English
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20, "dozen": 12,
    # Devanagari
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "छे": 6, "छै": 6, "छह्": 6,
    "सात": 7, "आठ": 8, "नौ": 9, "दस": 10, "ग्यारह": 11, "बारह": 12, "तेरह": 13, "चौदह": 14, "पंद्रह": 15,
    "सोलह": 16, "सत्रह": 17, "अठारह": 18, "उन्नीस": 19, "बीस": 20, "पच्चीस": 25, "तीस": 30,
}
# number words that are also ordinary words ("daal do" = put it in): only count them right before a unit
AMBIGUOUS = {"do", "दो", "sat", "che", "chai", "tin", "ath", "bis", "bara", "tera", "one"}
CASE_WORDS = {"case", "cases", "kes", "kesh", "keys", "peti", "petiyan", "petiya", "petti", "crate", "crates",
              "carton", "cartons", "box", "boxes", "dabba", "dabbe", "केस", "पेटी", "पेटियां", "पेटियाँ", "क्रेट",
              "डिब्बा", "डिब्बे", "बॉक्स", "कार्टन"}

CREDIT_CUES = ["baad mein", "baad me", "bad me", "bad mein", "baad main", "udhaar", "udhar", "udhari", "credit",
               "loan", "pay later", "later", "kal dunga", "kal de dunga", "paise nahi", "paisa nahi", "abhi nahi dunga",
               "बाद में", "उधार", "क्रेडिट", "लोन", "पैसे नहीं", "पैसा नहीं", "कल दूंगा", "कल दूँगा"]
AFFIRM = ["haan", "haa", "han", "ha", "hanji", "haanji", "yes", "yeah", "ok", "okay", "theek", "thik", "chalo",
          "pakka", "confirm", "done", "sure", "हाँ", "हां", "हा", "हाँजी", "ठीक", "पक्का", "कन्फर्म", "ओके", "चलो"]
JOIN = ["join", "jodo", "jod do", "jud", "judna", "daal do", "dal do", "daal", "kar do", "karo", "book", "order",
        "chahiye", "lena", "le lo", "le lunga", "dena", "de do", "जोड़", "जुड़", "डाल", "कर दो", "बुक", "ऑर्डर",
        "चाहिए", "ले लो", "लेना", "दे दो", "भेज"]
DENY = ["nahi", "nahin", "nai", "no", "mat", "cancel", "rehne do", "ruko", "mat karo", "नहीं", "नही", "मत",
        "कैंसल", "रहने दो", "रुको"]

TOPICS: dict[str, list[str]] = {
    "remaining": ["baaki", "baki", "bache hain", "kitne bache", "left", "बाकी", "बचे हैं", "कितने बचे"],
    "savings": ["bacha", "bachat", "bachaya", "bachaye", "saving", "savings", "saved", "बचत", "बचा", "बचाया",
                "फायदा", "fayda", "faayda"],
    "trust": ["score", "trust", "bharosa", "rating", "स्कोर", "ट्रस्ट", "भरोसा"],
    "stock": ["stock", "maal", "inventory", "godown", "स्टॉक", "माल"],
    "forecast": ["demand", "forecast", "bikri", "bikegi", "sales", "maang", "डिमांड", "बिक्री", "मांग", "अनुमान",
                 "बिकेगा", "बिकेगी"],
    "pools": ["pool", "kaunse", "kaun se", "konse", "kon se", "scheme", "offer", "पूल", "कौन से", "कौनसे", "स्कीम",
              "ऑफर"],
    "credit": ["credit", "loan", "udhaar", "udhar", "क्रेडिट", "लोन", "उधार"],
    "help": ["help", "madad", "kya kar", "मदद", "क्या कर सकते"],
}


@dataclass
class Intent:
    kind: str  # commit | confirm | cancel | remaining | savings | trust | stock | forecast | pools | credit | help | unknown
    cases: int | None = None
    use_credit: bool = False
    affirm: bool = False
    deny: bool = False
    item_tokens: list[str] = field(default_factory=list)
    text: str = ""


def normalise(text: str) -> str:
    t = text.translate(DEVANAGARI_DIGITS).lower()
    t = re.sub(r"[,.!?।|;:\"'()\[\]]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _has(t: str, words: list[str]) -> bool:
    toks = set(t.split())
    for w in words:
        if " " in w:
            if w in t:
                return True
        elif w in toks:
            return True
    return False


def _prefix_has(t: str, stems: list[str]) -> bool:
    """Devanagari / Hinglish stems: match token prefixes (e.g. 'जोड़' in 'जोड़ो')."""
    toks = t.split()
    for s in stems:
        if " " in s:
            if s in t:
                return True
        elif any(tok.startswith(s) for tok in toks) and len(s) >= 3:
            return True
        elif s in toks:
            return True
    return False


def extract_cases(t: str) -> int | None:
    toks = t.split()
    for i, tok in enumerate(toks):
        nxt = toks[i + 1] if i + 1 < len(toks) else ""
        m = re.fullmatch(r"(\d{1,3})(case|cases|peti|kes)?", tok)
        if m and (m.group(2) or nxt in CASE_WORDS):
            return int(m.group(1))
        if tok in NUMBER_WORDS and nxt in CASE_WORDS:
            return NUMBER_WORDS[tok]
    for tok in toks:  # a bare digit anywhere ("6 daal do")
        if re.fullmatch(r"\d{1,3}", tok):
            return int(tok)
    for tok in toks:  # an unambiguous number word anywhere ("chhe daal do")
        if tok in NUMBER_WORDS and tok not in AMBIGUOUS:
            return NUMBER_WORDS[tok]
    return None


def parse(text: str) -> Intent:
    t = normalise(text)
    cases = extract_cases(t)
    credit = _has(t, CREDIT_CUES)
    affirm = _has(t, AFFIRM)
    join = _prefix_has(t, JOIN)
    toks = t.split()
    deny = bool(toks) and (toks[0] in {"nahi", "nahin", "no", "nai", "नहीं", "नही", "cancel", "कैंसल", "mat", "मत"}
                           or _has(t, ["cancel", "rehne do", "mat karo", "कैंसल", "रहने दो", "मत करो"]))
    intent = Intent(kind="unknown", cases=cases, use_credit=credit, affirm=affirm, deny=deny, item_tokens=toks,
                    text=t)
    if deny and not cases:
        intent.kind = "cancel"
        return intent
    if cases is not None and (join or affirm or credit or _has(t, list(CASE_WORDS))):
        intent.kind = "commit"
        return intent
    if _has(t, TOPICS["remaining"]) or (_prefix_has(t, ["bache", "बचे"]) and _has(t, list(CASE_WORDS))):
        intent.kind = "remaining"
        return intent
    for topic in ("savings", "trust", "stock", "forecast"):
        if _prefix_has(t, TOPICS[topic]):
            intent.kind = topic
            return intent
    if join and not affirm:
        intent.kind = "commit"
        return intent
    if affirm or (join and affirm):
        intent.kind = "confirm" if not join else "commit"
        return intent
    if credit or _has(t, TOPICS["credit"]):
        intent.kind = "credit"
        return intent
    if _prefix_has(t, TOPICS["pools"]):
        intent.kind = "pools"
        return intent
    if _has(t, TOPICS["help"]):
        intent.kind = "help"
    return intent
