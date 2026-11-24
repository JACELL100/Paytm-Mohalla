"""Voice agent "Mohalla Saathi".

audio -> Groq Whisper (hi) -> gpt-oss with tool calling -> reply (+ pending actions).
Without GROQ_API_KEY (or if Groq fails) a rule-based parser + Hindi templates answer instead.
Money tools only ever create a PendingAction; the merchant confirms it (button, or saying "haan",
which returns `confirm_action_id` so the app calls POST /actions/{id}/confirm).
"""

from __future__ import annotations

import json
import logging

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..core.config import settings
from ..models import Inventory, Merchant, PendingAction, Pool, PoolCommitment, PoolInvite, Sku
from . import actions, credit, forecasts, llm, nudges, pools, trust
from .common import category_meta, fmt_inr, haversine_km
from .intent import Intent, normalise, parse

log = logging.getLogger("mohalla.voice")

CATEGORY_WORDS: dict[str, list[str]] = {
    "cold_drinks": ["cold", "drink", "drinks", "thanda", "कोल्ड", "ड्रिंक", "ठंडा"],
    "snacks": ["namkeen", "snacks", "nashta", "नमकीन", "स्नैक्स"],
    "oil_ghee": ["oil", "tel", "ghee", "तेल", "घी"],
    "staples": ["ration", "rashan", "राशन"],
    "bakery": ["bakery", "बेकरी"],
    "dairy": ["doodh", "milk", "दूध"],
    "til_gud": ["gud", "jaggery", "til", "गुड़", "तिल"],
}
STOP = {"pack", "strip", "tin", "of", "the", "and", "250g", "500g", "1kg", "1l", "2l"}


def _t(lang: str, hi: str, en: str) -> str:
    return hi if lang == "hi" else en


def sku_keywords(s: Sku) -> set[str]:
    words = {w for w in normalise(s.name).split() if len(w) >= 3 and w not in STOP and not any(c.isdigit() for c in w)}
    words |= {w for w in normalise(s.name_hi).split() if len(w) >= 2 and not any(c.isdigit() for c in w)}
    words |= set(CATEGORY_WORDS.get(s.category, []))
    return words


# ------------------------------------------------------------------ tools (shared by LLM + rules)
async def candidate_pools(session: AsyncSession, m: Merchant) -> list[Pool]:
    """Open pools this shop can join: invited ones first, then visible pools nearby (2 statements)."""
    views = [v for v in await pools.fresh_views(session, Pool.status == "open", m.id) if v.mine is None]
    invited = sorted([v for v in views if v.invite], key=lambda v: v.pool.deadline)
    near = sorted([v for v in views if not v.invite and v.visible_to_viewer()
                   and haversine_km(m.lat, m.lng, v.pool.center_lat, v.pool.center_lng) <= 3.5],
                  key=lambda v: v.pool.deadline)
    return [v.pool for v in invited + near]


async def pool_brief(session: AsyncSession, p: Pool, m: Merchant) -> dict:
    sku = await session.get(Sku, p.sku_id)
    inv = await session.get(PoolInvite, (p.id, m.id))
    mins = max(0, int((p.deadline - clock.now()).total_seconds() // 60))
    return {"pool_id": str(p.id), "item": sku.name, "item_hi": sku.name_hi, "emoji": sku.emoji,
            "target_cases": p.target_cases, "committed_cases": p.committed_cases,
            "remaining_cases": p.target_cases - p.committed_cases, "price_per_case_paise": p.case_price_paise,
            "savings_per_case_paise": p.base_case_price_paise - p.case_price_paise, "disc_pct": p.disc_bps / 100,
            "minutes_left": mins, "status": p.status, "invited": inv is not None,
            "suggested_cases": inv.suggested_cases if inv else None,
            "need_cases": (inv.reason or {}).get("need_cases") if inv else None}


async def match_pool(session: AsyncSession, m: Merchant, tokens: list[str]) -> Pool | None:
    cands = await candidate_pools(session, m)
    if not cands:
        return None
    toks = set(tokens)
    for p in cands:
        sku = await session.get(Sku, p.sku_id)
        kw = sku_keywords(sku)
        if toks & kw or any(any(t.startswith(k) for k in kw if len(k) >= 4) for t in toks):
            return p
    return cands[0]


async def stock_lines(session: AsyncSession, m: Merchant, tokens: list[str] | None = None, limit: int = 3) -> list[dict]:
    rows = (await session.execute(select(Inventory, Sku).join(Sku, Sku.id == Inventory.sku_id)
                                  .where(Inventory.merchant_id == m.id))).all()
    items = []
    for inv, s in rows:
        items.append({"item": s.name, "item_hi": s.name_hi, "units": inv.qty_units,
                      "cases": round(inv.qty_units / s.case_size, 1), "_kw": sku_keywords(s), "_share": s.sku_share})
    if tokens:
        toks = set(tokens)
        hit = [i for i in items if toks & i["_kw"]]
        if hit:
            items = hit
    items.sort(key=lambda i: -i["_share"])
    return [{k: v for k, v in i.items() if not k.startswith("_")} for i in items[:limit]]


# ------------------------------------------------------------------ rule-based fallback
async def rule_turn(session: AsyncSession, m: Merchant, text: str, lang: str) -> dict:
    it: Intent = parse(text)
    pending = await actions.open_actions(session, m)
    out = {"pending_actions": [], "confirm_action_id": None}
    name, name_en = nudges.first_name(m), nudges.first_name_en(m)

    if it.kind == "confirm" and pending:
        a = pending[0]
        out["pending_actions"] = [a]
        out["confirm_action_id"] = str(a.id)
        reply = _t(lang, f"ठीक है {name} जी, {a.payload['cases']} केस का ऑर्डर कन्फर्म कर रहा हूँ।",
                   f"Okay {name_en} ji, confirming your order for {a.payload['cases']} cases.")
    elif it.kind == "cancel":
        if pending:
            for a in pending:
                a.status = "cancelled"
            reply = _t(lang, "ठीक है, ऑर्डर रद्द कर दिया।", "Okay, I've cancelled that order.")
        else:
            reply = _t(lang, "ठीक है। कोई ऑर्डर बाकी नहीं है।", "Okay. There's no order waiting.")
    elif it.kind in ("commit", "confirm"):
        p = await match_pool(session, m, it.item_tokens)
        if p is None:
            reply = _t(lang, "अभी आपके एरिया में कोई खुला पूल नहीं है। नया पूल बनते ही बताऊँगा।",
                       "There's no open pool near you right now. I'll tell you when one opens.")
        else:
            inv = await session.get(PoolInvite, (p.id, m.id))
            cases = it.cases or (inv.suggested_cases if inv else None) or 2
            try:
                a, notes = await actions.propose_commit(session, m, p, cases, it.use_credit, clamp=True)
                out["pending_actions"] = [a]
                reply = await _proposal_reply(session, a, notes, lang)
            except actions.GuardrailError as e:
                reply = _t(lang, f"माफ़ कीजिए, यह नहीं हो सकता: {e.detail}", f"Sorry, I can't do that: {e.detail}")
    elif it.kind == "remaining":
        cands = await candidate_pools(session, m)
        _, active = await pools.merchant_pools(session, m)
        ps = active + cands
        if ps:
            b = await pool_brief(session, ps[0], m)
            reply = _t(lang, f"{b['item_hi']} पूल में {b['committed_cases']}/{b['target_cases']} केस हो गए, "
                             f"{b['remaining_cases']} बाकी हैं। {b['minutes_left']} मिनट बचे हैं।",
                       f"The {b['item']} pool has {b['committed_cases']}/{b['target_cases']} cases, "
                       f"{b['remaining_cases']} to go, {b['minutes_left']} minutes left.")
        else:
            reply = _t(lang, "अभी कोई खुला पूल नहीं है।", "No open pools right now.")
    elif it.kind == "savings":
        s = await pools.savings_summary(session, m)
        reply = _t(lang, f"अब तक {s['pools_joined']} पूल में जुड़कर आपने {fmt_inr(s['total_paise'])} बचाए हैं।",
                   f"You've saved {fmt_inr(s['total_paise'])} across {s['pools_joined']} pools so far.")
    elif it.kind == "trust":
        t = await trust.compute(session, m)
        band_hi = {"Excellent": "बेहतरीन", "Good": "अच्छा", "Building": "बन रहा है"}[t["band"]]
        reply = _t(lang, f"आपका ट्रस्ट स्कोर {t['score']} है, जो {band_hi} है। समय पर डिलीवरी लेने से यह बढ़ता है।",
                   f"Your trust score is {t['score']} ({t['band']}). Confirming deliveries on time raises it.")
    elif it.kind == "stock":
        lines = await stock_lines(session, m, it.item_tokens)
        if lines:
            hi = ", ".join(f"{x['item_hi']} {x['cases']:g} केस" for x in lines)
            en = ", ".join(f"{x['item']} {x['cases']:g} cases" for x in lines)
            reply = _t(lang, f"आपके पास: {hi}।", f"In stock: {en}.")
        else:
            reply = _t(lang, "स्टॉक की जानकारी नहीं मिली। बिल की फ़ोटो से स्टॉक अपडेट कर सकते हैं।",
                       "I don't have stock data yet. You can update it by scanning a bill.")
    elif it.kind == "forecast":
        fc = await forecasts.forecast_summaries(session, m, top=1)
        if fc:
            f = fc[0]
            ev_hi = f" {f['event']} की वजह से" if f["event"] else ""
            reply = _t(lang, f"इस हफ़्ते{ev_hi} {f['label_hi']} की बिक्री {f['uplift']:.1f} गुना रहेगी, "
                             f"रोज़ लगभग {fmt_inr(f['p50_daily_paise'])}।",
                       f"This week {f['label_en'].lower()} sales should be {f['uplift']:.1f}x"
                       f"{' for ' + f['event'] if f['event'] else ''}, about {fmt_inr(f['p50_daily_paise'])} a day.")
        else:
            reply = _t(lang, "अभी अनुमान उपलब्ध नहीं है।", "No forecast available yet.")
    elif it.kind == "credit":
        cands = await candidate_pools(session, m)
        inv = await session.get(PoolInvite, (cands[0].id, m.id)) if cands else None
        amount = (inv.suggested_cases * cands[0].case_price_paise) if inv else 500_000
        o = await credit.offer(session, m, amount)
        reply = _t(lang, f"आपको {fmt_inr(o['limit_paise'])} तक पूल क्रेडिट मिल सकता है, {o['rate_bps'] / 100:.1f}% "
                         f"सालाना, 30 दिन में रोज़ के सेटलमेंट से चुकता।",
                   f"You can get Pool Credit up to {fmt_inr(o['limit_paise'])} at {o['rate_bps'] / 100:.1f}% a year, "
                   f"repaid from daily settlements over 30 days.")
    elif it.kind == "pools":
        cands = await candidate_pools(session, m)
        if cands:
            bs = [await pool_brief(session, p, m) for p in cands[:3]]
            hi = "; ".join(f"{b['item_hi']}: {b['committed_cases']}/{b['target_cases']} केस, {b['disc_pct']:g}% छूट"
                           for b in bs)
            en = "; ".join(f"{b['item']}: {b['committed_cases']}/{b['target_cases']} cases, {b['disc_pct']:g}% off"
                           for b in bs)
            reply = _t(lang, f"आपके पास के पूल: {hi}।", f"Pools near you: {en}.")
        else:
            reply = _t(lang, "अभी आपके एरिया में कोई खुला पूल नहीं है।", "No open pools near you right now.")
    else:
        reply = _t(lang, "मैं पूल में जुड़ने, बचत, स्टॉक और ट्रस्ट स्कोर में मदद कर सकता हूँ। जैसे बोलिए: "
                         "'हाँ, 6 केस डाल दो'।",
                   "I can help you join pools, check savings, stock and your trust score. Try: 'yes, add 6 cases'.")
    out["reply_text"] = reply
    return out


async def _proposal_reply(session: AsyncSession, a: PendingAction, notes: list[str], lang: str) -> str:
    p = a.payload
    pool = await pools.get_pool(session, p["pool_id"])
    sku = await session.get(Sku, pool.sku_id)
    pre_hi, pre_en = [], []
    for n in notes:
        if n.startswith("only_"):
            k = n.split("_")[1]
            pre_hi.append(f"पूल में सिर्फ़ {k} केस बचे हैं।")
            pre_en.append(f"Only {k} cases are left in the pool.")
        elif n.startswith("capped_"):
            k = n.split("_")[1]
            pre_hi.append(f"आपकी ज़रूरत के हिसाब से {k} केस तक ही ले सकते हैं।")
            pre_en.append(f"Based on your need, the most I can add is {k} cases.")
        elif n == "auto_credit":
            pre_hi.append("वॉलेट में पैसे कम हैं, इसलिए पूल क्रेडिट जोड़ा है।")
            pre_en.append("Your wallet is short, so I've added Pool Credit.")
    hi = (f"{p['cases']} केस {sku.name_hi}, {fmt_inr(p['amount_paise'])}, आपकी बचत {fmt_inr(p['savings_paise'])}।")
    en = (f"{p['cases']} cases of {sku.name} for {fmt_inr(p['amount_paise'])}, saving {fmt_inr(p['savings_paise'])}.")
    if p["use_credit"] and p.get("credit"):
        r = p["credit"]["rate_bps"] / 100
        hi += f" पूल क्रेडिट {r:.1f}% सालाना, 30 दिन।"
        en += f" Pool Credit at {r:.1f}% a year for 30 days."
    hi += " कन्फर्म दबाइए या 'हाँ' बोलिए।"
    en += " Tap Confirm or say 'yes'."
    return _t(lang, " ".join(pre_hi + [hi]), " ".join(pre_en + [en]))


# ------------------------------------------------------------------ LLM agent
TOOLS = [
    {"type": "function", "function": {"name": "get_open_pools", "description": "Open buying pools near this shop",
                                      "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_pool", "description": "Details of one pool",
                                      "parameters": {"type": "object", "properties": {"pool_id": {"type": "string"}},
                                                     "required": ["pool_id"]}}},
    {"type": "function", "function": {"name": "get_forecast", "description": "This week's demand forecast for a product category "
                                      "(cold_drinks, snacks, staples, oil_ghee, dairy, bakery, sweets, dry_fruits, tea_coffee, personal_care, pooja, til_gud)",
                                      "parameters": {"type": "object", "properties": {"category": {"type": "string"}},
                                                     "required": ["category"]}}},
    {"type": "function", "function": {"name": "get_stock", "description": "Stock of an item (or top items if empty)",
                                      "parameters": {"type": "object", "properties": {"item": {"type": "string"}}}}},
    {"type": "function", "function": {"name": "propose_commit",
                                      "description": "Prepare a confirmation card to join a pool. Does NOT move money; the "
                                                     "merchant must confirm. use_credit=true if they want to pay later.",
                                      "parameters": {"type": "object", "properties": {
                                          "pool_id": {"type": "string"}, "cases": {"type": "integer"},
                                          "use_credit": {"type": "boolean"}}, "required": ["pool_id", "cases", "use_credit"]}}},
    {"type": "function", "function": {"name": "confirm_pending_action",
                                      "description": "The merchant clearly said yes to the confirmation card already shown. "
                                                     "The app will then execute it.",
                                      "parameters": {"type": "object", "properties": {"action_id": {"type": "string"}},
                                                     "required": ["action_id"]}}},
    {"type": "function", "function": {"name": "get_credit_offer", "description": "Pool Credit offer for an amount in paise",
                                      "parameters": {"type": "object", "properties": {"amount_paise": {"type": "integer"}},
                                                     "required": ["amount_paise"]}}},
    {"type": "function", "function": {"name": "get_trust_score", "description": "The shop's trade trust score",
                                      "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_savings_summary", "description": "Money saved through pools so far",
                                      "parameters": {"type": "object", "properties": {}}}},
]


async def _exec_tool(session: AsyncSession, m: Merchant, name: str, args: dict, state: dict) -> dict:
    if name == "get_open_pools":
        return {"pools": [await pool_brief(session, p, m) for p in (await candidate_pools(session, m))[:5]]}
    if name == "get_pool":
        p = await pools.get_pool(session, args["pool_id"])
        return await pool_brief(session, p, m)
    if name == "get_forecast":
        cat = args.get("category", "")
        fcs = await forecasts.current_forecasts(session, m.id)
        f = next((x for x in fcs if x.category == cat), None)
        if not f:
            return {"error": f"no forecast for {cat}", "categories": [x.category for x in fcs]}
        return {"category": cat, "label": category_meta(cat)["en"], "uplift": f.uplift,
                "p50_week_paise": f.p50, "reason": f.reason}
    if name == "get_stock":
        toks = normalise(args.get("item") or "").split()
        return {"items": await stock_lines(session, m, toks or None, limit=5)}
    if name == "propose_commit":
        p = await pools.get_pool(session, args["pool_id"])
        try:
            a, notes = await actions.propose_commit(session, m, p, int(args["cases"]), bool(args.get("use_credit")),
                                                    clamp=True)
        except actions.GuardrailError as e:
            return {"error": e.detail}
        state["actions"][str(a.id)] = a
        return {"action_id": str(a.id), "notes": notes, **actions.action_dict(a)["payload"],
                "summary_en": a.summary_en}
    if name == "confirm_pending_action":
        live = {str(a.id): a for a in await actions.open_actions(session, m)}
        aid = args.get("action_id") or (next(iter(live)) if live else None)
        if aid in live:
            state["confirm"] = aid
            state["actions"][aid] = live[aid]
            return {"ok": True, "note": "The app will confirm it now."}
        return {"error": "No open confirmation card"}
    if name == "get_credit_offer":
        return credit.public(await credit.offer(session, m, int(args.get("amount_paise") or 0)))
    if name == "get_trust_score":
        t = await trust.compute(session, m)
        return {k: t[k] for k in ("score", "band", "components")}
    if name == "get_savings_summary":
        return await pools.savings_summary(session, m)
    return {"error": f"unknown tool {name}"}


async def llm_turn(session: AsyncSession, m: Merchant, text: str, lang: str) -> dict:
    c = llm.client()
    pending = await actions.open_actions(session, m)
    ctx = {"shop": m.name, "owner": m.owner_name, "demo_time": clock.iso(clock.now()),
           "wallet_balance_paise": m.wallet_balance_paise,
           "open_confirmation_cards": [{"action_id": str(a.id), "summary_en": a.summary_en} for a in pending]}
    system = (
        "You are Mohalla Saathi, a voice assistant on a Paytm Soundbox for an Indian kirana shopkeeper. "
        f"Reply in {'Hindi written in Devanagari (English loanwords like pool, case, credit are fine)' if lang == 'hi' else 'simple English'}, "
        "at most 2 short sentences, spoken style, no emojis, amounts in rupees (tools give paise: divide by 100). "
        "Use tools for facts; never invent numbers. You can never move money: propose_commit only prepares a "
        "confirmation card - after it, say the card is ready and ask them to tap Confirm or say haan; never say the "
        "order is placed. If the shopkeeper wants to pay later (baad mein, udhaar, credit) set use_credit=true. "
        "If they say yes/haan to a card that is already open, call confirm_pending_action and say you are "
        "confirming it now. "
        "If they ask to join without a pool, pick the pool they are invited to. Context: " + json.dumps(ctx, ensure_ascii=False))
    messages: list[dict] = [{"role": "system", "content": system}, {"role": "user", "content": text}]
    state: dict = {"actions": {}, "confirm": None}
    for _ in range(5):
        r = await c.chat.completions.create(model=settings.groq_model_agent, messages=messages, tools=TOOLS,
                                            tool_choice="auto", temperature=0.2, max_tokens=600,
                                            extra_body={"reasoning_effort": "low"})
        msg = r.choices[0].message
        if not msg.tool_calls:
            reply = llm.clean_speech(msg.content or "")
            if not reply:
                raise RuntimeError("empty LLM reply")
            acts = list(state["actions"].values())
            return {"reply_text": reply, "pending_actions": [a for a in acts if a.status == "pending"],
                    "confirm_action_id": state["confirm"]}
        messages.append({"role": "assistant", "content": msg.content or "",
                         "tool_calls": [{"id": tc.id, "type": "function",
                                         "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                                        for tc in msg.tool_calls]})
        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
                result = await _exec_tool(session, m, tc.function.name, args, state)
            except HTTPException as e:
                result = {"error": e.detail}
            messages.append({"role": "tool", "tool_call_id": tc.id,
                             "content": json.dumps(result, ensure_ascii=False, default=str)})
    raise RuntimeError("agent did not finish")


def suggestions(lang: str, has_pending: bool) -> list[str]:
    if lang == "hi":
        base = ["हाँ, 6 केस डाल दो, पैसे बाद में दूंगा", "कितना बचाया?", "मेरा ट्रस्ट स्कोर?", "कोल्ड ड्रिंक का स्टॉक?"]
        return (["हाँ, कन्फर्म करो", "नहीं, रहने दो"] if has_pending else []) + base[: 4 - (2 if has_pending else 0)]
    base = ["Yes, add 6 cases, I'll pay later", "How much have I saved?", "What's my trust score?", "Cold drink stock?"]
    return (["Yes, confirm", "No, cancel"] if has_pending else []) + base[: 4 - (2 if has_pending else 0)]


async def turn(session: AsyncSession, m: Merchant, text: str | None, audio: bytes | None, filename: str | None,
               content_type: str | None, lang: str | None) -> dict:
    lang = lang if lang in ("hi", "en") else (m.lang or "hi")
    transcript = (text or "").strip()
    if audio:
        if not settings.llm_enabled:
            raise HTTPException(400, "Speech-to-text is off (no GROQ_API_KEY). Use browser speech recognition and "
                                     "send `text` instead.")
        transcript = await llm.transcribe(audio, filename or "audio.webm", content_type, lang) or ""
        if not transcript:
            raise HTTPException(502, "Couldn't understand the audio. Please try again or type.")
    if not transcript:
        raise HTTPException(400, "Send `text` or `audio`")
    result = None
    if settings.llm_enabled:
        try:
            result = await llm_turn(session, m, transcript, lang)
        except Exception as e:  # noqa: BLE001 - fall back to rules on any LLM problem
            log.warning("LLM agent failed, using rules: %s", e)
            await session.rollback()
            await session.refresh(m)
    if result is None:
        result = await rule_turn(session, m, transcript, lang)
    acts = result["pending_actions"]
    await session.commit()
    return {"transcript": transcript, "reply_text": result["reply_text"], "reply_lang": lang,
            "reply_audio_url": None, "pending_actions": [actions.action_dict(a) for a in acts],
            "suggestions": suggestions(lang, bool(acts)), "confirm_action_id": result.get("confirm_action_id")}
