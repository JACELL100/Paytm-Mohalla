"""Soundbox nudges: Hindi (Devanagari) + English, 30 words or fewer.

Templates are the default and the fallback; when GROQ_API_KEY is set, nudges for merchants who
use the app (demo shop / claimed shops) are rewritten by the LLM from the same facts.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..models import Merchant, Nudge, Profile
from . import llm
from .common import category_meta, fmt_inr

MAX_WORDS = 30
_last_at = None


def _stamp(at):
    """Strictly increasing created_at so 'newest first' is stable even when the demo clock is frozen."""
    global _last_at
    from datetime import timedelta

    if _last_at is not None and at <= _last_at and at > _last_at - timedelta(seconds=5):
        at = _last_at + timedelta(milliseconds=1)
    _last_at = at
    return at


HI_NAMES = {
    "Ramesh": "रमेश", "Suresh": "सुरेश", "Mahesh": "महेश", "Prakash": "प्रकाश", "Anil": "अनिल", "Sunil": "सुनील",
    "Vijay": "विजय", "Sanjay": "संजय", "Rajesh": "राजेश", "Dinesh": "दिनेश", "Ganesh": "गणेश", "Santosh": "संतोष",
    "Mohammed": "मोहम्मद", "Imran": "इमरान", "Salim": "सलीम", "Joseph": "जोसेफ", "Francis": "फ्रांसिस",
    "Deepak": "दीपक", "Nitin": "नितिन", "Ashok": "अशोक", "Kishore": "किशोर", "Manoj": "मनोज", "Pravin": "प्रवीण",
    "Shailesh": "शैलेश", "Bharat": "भरत", "Harish": "हरीश", "Jignesh": "जिग्नेश", "Hitesh": "हितेश",
    "Kamlesh": "कमलेश", "Nilesh": "नीलेश", "Rakesh": "राकेश", "Ajay": "अजय", "Vinod": "विनोद", "Arif": "आरिफ़",
    "Yusuf": "यूसुफ़", "Lalit": "ललित", "Mukesh": "मुकेश", "Naresh": "नरेश", "Pankaj": "पंकज", "Sachin": "सचिन",
    "Tukaram": "तुकाराम", "Sunita": "सुनीता", "Rekha": "रेखा", "Asha": "आशा", "Meena": "मीना", "Lata": "लता",
    "Farida": "फ़रीदा", "Mary": "मैरी", "Kavita": "कविता", "Jyoti": "ज्योति", "Shabana": "शबाना",
}


def first_name_en(m: Merchant) -> str:
    return (m.owner_name or m.name).split()[0]


def first_name(m: Merchant) -> str:
    """Name for Hindi text (Devanagari when known, so hi-IN text-to-speech reads it naturally)."""
    n = first_name_en(m)
    return HI_NAMES.get(n, n)


def _fmt_x(x: float) -> str:
    return f"{x:.1f}".rstrip("0").rstrip(".")


def invite_text(m: Merchant, *, category: str, sku_name: str, sku_name_hi: str, event: str | None,
                event_hi: str | None, uplift: float, stock_cases: int, need_cases: int, shops: int, target: int,
                disc_bps: int) -> tuple[str, str]:
    meta = category_meta(category)
    disc = _fmt_x(disc_bps / 100)
    name, name_en = first_name(m), first_name_en(m)
    if event and uplift > 1.15:
        hi = (f"{name} जी, {event_hi} में {meta['hi']} की डिमांड {_fmt_x(uplift)} गुना रहेगी। "
              f"{sku_name_hi} {stock_cases} केस हैं, {need_cases} और चाहिए। {shops} दुकानें, {target} केस पर "
              f"{disc}% छूट। जुड़ेंगे?")
        en = (f"{name_en} ji, {meta['en'].lower()} demand will be {_fmt_x(uplift)}x in {event}. {sku_name}: you have "
              f"{stock_cases} cases, need {need_cases} more. {shops} shops, {disc}% off at {target} cases. Join?")
    else:
        hi = (f"{name} जी, {sku_name_hi} का पूल बन रहा है: {target} केस पर {disc}% छूट। आपको लगभग {need_cases} केस "
              f"चाहिए। जुड़ेंगे?")
        en = (f"{name_en} ji, a {sku_name} pool is forming: {disc}% off at {target} cases. You need about {need_cases} "
              f"cases. Join?")
    return hi, en


def funded_text(m: Merchant, sku_name: str, sku_name_hi: str, target: int, cases: int, dist: str) -> tuple[str, str]:
    hi = f"खुशखबरी! {sku_name_hi} पूल पूरा हुआ: {target} केस। {dist} आपके {cases} केस लाएगा, डिलीवरी पर QR स्कैन करें।"
    en = f"Good news! The {sku_name} pool is full at {target} cases. {dist} will bring your {cases} cases; scan the QR on delivery."
    return hi, en


def delivery_text(m: Merchant, sku_name: str, sku_name_hi: str, cases: int, payout: int, score: int,
                  delta: int) -> tuple[str, str]:
    up_hi = f", {delta} बढ़कर" if delta > 0 else ""
    up_en = f" (+{delta})" if delta > 0 else ""
    hi = f"{cases} केस {sku_name_hi} मिल गए। {fmt_inr(payout)} वितरक को भेजे गए। आपका ट्रस्ट स्कोर{up_hi} अब {score} है।"
    en = f"{cases} cases of {sku_name} received. {fmt_inr(payout)} released to the distributor. Trust score now {score}{up_en}."
    return hi, en


def forecast_text(m: Merchant, category: str, uplift: float, event: str | None, event_hi: str | None) -> tuple[str, str]:
    meta = category_meta(category)
    if event:
        hi = f"{first_name(m)} जी, {event_hi} आ रहा है। इस हफ़्ते {meta['hi']} की बिक्री {_fmt_x(uplift)} गुना रहने का अनुमान है। स्टॉक देख लीजिए।"
        en = f"{first_name_en(m)} ji, {event} is here. {meta['en']} sales should be {_fmt_x(uplift)}x this week. Check your stock."
    else:
        hi = f"{first_name(m)} जी, इस हफ़्ते {meta['hi']} की बिक्री सामान्य रहेगी।"
        en = f"{first_name_en(m)} ji, {meta['en'].lower()} sales look normal this week."
    return hi, en


def trust_text(m: Merchant, score: int) -> tuple[str, str]:
    hi = f"{first_name(m)} जी, आपका ट्रस्ट स्कोर {score} है। हर पूल की समय पर डिलीवरी लेने से यह बढ़ता है।"
    en = f"{first_name_en(m)} ji, your trust score is {score}. Taking every pool delivery on time raises it."
    return hi, en


def credit_text(m: Merchant, amount: int, rate_bps: int) -> tuple[str, str]:
    hi = f"पूल क्रेडिट मंज़ूर: {fmt_inr(amount)}, {_fmt_x(rate_bps / 100)}% सालाना। 30 दिन तक रोज़ के सेटलमेंट से थोड़ा-थोड़ा कटेगा।"
    en = f"Pool Credit approved: {fmt_inr(amount)} at {_fmt_x(rate_bps / 100)}% a year, repaid from daily settlements over 30 days."
    return hi, en


def _words(s: str) -> int:
    return len(s.split())


async def _uses_app(session: AsyncSession, m: Merchant) -> bool:
    if m.is_demo:
        return True
    return (await session.execute(select(Profile.id).where(Profile.merchant_id == m.id))).first() is not None


async def polish(text_hi: str, text_en: str, facts: dict) -> tuple[str, str]:
    out = await llm.chat_json(
        "You write Paytm Soundbox announcements for Indian shopkeepers. Return JSON {\"text_hi\": ..., "
        "\"text_en\": ...}. text_hi in simple spoken Hindi (Devanagari script, common English loanwords allowed), "
        "text_en in plain English. Each 30 words or fewer. Keep every number exactly as given. No emojis.",
        f"Facts: {facts}\nDraft hi: {text_hi}\nDraft en: {text_en}", max_tokens=300)
    if not out:
        return text_hi, text_en
    hi, en = str(out.get("text_hi") or "").strip(), str(out.get("text_en") or "").strip()
    hi, en = llm.clean_speech(hi), llm.clean_speech(en)
    if not hi or not en or _words(hi) > MAX_WORDS or _words(en) > MAX_WORDS:
        return text_hi, text_en
    return hi, en


async def create(session: AsyncSession, m: Merchant, kind: str, text_hi: str, text_en: str,
                 pool_id: uuid.UUID | None = None, facts: dict | None = None, at=None, llm_ok: bool = True) -> Nudge:
    if llm_ok and facts is not None and llm.client() is not None and await _uses_app(session, m):
        text_hi, text_en = await polish(text_hi, text_en, facts)
    n = Nudge(merchant_id=m.id, kind=kind, text_hi=text_hi, text_en=text_en, pool_id=pool_id,
              created_at=at or _stamp(clock.now()))
    session.add(n)
    return n


def nudge_dict(n: Nudge, public_api_url: str) -> dict:
    return {"id": str(n.id), "kind": n.kind, "text_hi": n.text_hi, "text_en": n.text_en,
            "audio_url": f"{public_api_url.rstrip('/')}/static/{n.audio_path}" if n.audio_path else None,
            "pool_id": str(n.pool_id) if n.pool_id else None, "created_at": clock.iso(n.created_at),
            "heard": n.heard_at is not None}
