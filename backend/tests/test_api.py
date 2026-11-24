from __future__ import annotations

import re
from datetime import datetime, timedelta

import pytest

from app.core.config import settings

from .conftest import D, M, O
from .shapes import (
    CREDIT_OFFER, DISTRIBUTOR, FORECAST_SUMMARY, HEX, HOME, KPIS, LOAN, ME, MERCHANT, NUDGE, PENDING_ACTION,
    PENDING_PAYLOAD, TRUST, TXREF, VOICE, check_pool, has,
)


async def cola(c) -> dict:
    home = (await c.get("/m/home", headers=M)).json()
    return next(p for p in home["invites"] if p["sku"]["name"] == "Cola 2L")


async def me_id(c) -> str:
    return (await c.get("/me", headers=M)).json()["merchant"]["id"]


# ------------------------------------------------------------------ public + auth
async def test_public_endpoints(client):
    h = (await client.get("/health")).json()
    assert h == {"status": "ok", "auth_mode": "dev", "chain_mode": "off", "llm": False, "stt": False,
                 "demo_mode": True}
    accts = (await client.get("/demo/accounts")).json()
    assert [a["token"] for a in accts] == ["dev-merchant", "dev-distributor", "dev-ops"]
    for a in accts:
        has(a, {"token", "role", "display_name", "subtitle"})
    st = (await client.get("/demo/state")).json()
    has(st, {"now", "demo_mode", "clock_offset_minutes"})
    assert st["now"].startswith("2026-12-26T09:00")


async def test_dev_auth(client):
    assert (await client.get("/me")).status_code == 401
    assert (await client.get("/me", headers={"Authorization": "Bearer nope"})).status_code == 401
    assert (await client.get("/me", headers={"Authorization": "Bearer dev-unknown"})).status_code == 401
    me = (await client.get("/me", headers=M)).json()
    has(me, ME)
    assert me["profile"]["role"] == "merchant"
    has(me["merchant"], MERCHANT)
    assert me["merchant"]["name"] == "Ramesh General Store" and me["merchant"]["owner_name"] == "Ramesh Gupta"
    d = (await client.get("/me", headers=D)).json()
    assert d["profile"]["role"] == "distributor"
    has(d["distributor"], DISTRIBUTOR)
    assert d["distributor"]["name"] == "Shree Ganesh Distributors"
    assert (await client.get("/me", headers=O)).json()["profile"]["role"] == "ops"
    # role checks
    assert (await client.get("/ops/kpis", headers=M)).status_code == 403
    assert (await client.get("/m/home", headers=O)).status_code == 403
    assert (await client.post("/demo/reset", headers=M)).status_code == 403
    assert (await client.get("/d/orders", headers=M)).status_code == 403
    # PATCH /me
    r = (await client.patch("/me", headers=M, json={"lang": "en"})).json()
    assert r["profile"]["lang"] == "en" and r["merchant"]["lang"] == "en"


# ------------------------------------------------------------------ home + seeded state
async def test_home_payload_and_seeded_state(client):
    home = (await client.get("/m/home", headers=M)).json()
    has(home, HOME)
    has(home["merchant"], MERCHANT)
    assert 1 <= len(home["nudges"]) <= 10
    for n in home["nudges"]:
        has(n, NUDGE)
    assert home["nudges"][0]["kind"] == "pool_invite" and "40" in home["nudges"][0]["text_hi"]
    assert len(home["forecasts"]) == 3
    for f in home["forecasts"]:
        has(f, FORECAST_SUMMARY)
    top = home["forecasts"][0]
    assert top["category"] == "cold_drinks" and top["event"] == "New Year week" and 2.0 < top["uplift"] < 2.6
    for p in home["invites"] + home["active_pools"]:
        check_pool(p, merchant_view=True)
    p = await cola(client)
    assert (p["target_cases"], p["committed_cases"], p["member_count"]) == (40, 27, 11)
    assert p["slabs"] == [{"min_cases": 20, "disc_bps": 300}, {"min_cases": 40, "disc_bps": 600}]
    assert p["sku"]["case_size"] == 9 and p["sku"]["emoji"] == "🥤" and p["status"] == "open"
    assert p["mine"]["invited"] and p["mine"]["suggested_cases"] == 6
    assert p["mine"]["reason"]["stock_units"] == 36 and p["mine"]["reason"]["need_cases"] >= 6
    now = datetime.fromisoformat((await client.get("/demo/state")).json()["now"])
    assert timedelta(minutes=2, seconds=50) < datetime.fromisoformat(p["deadline"]) - now <= timedelta(minutes=3)
    assert len(p["recent_joins"]) == 10
    assert home["savings"]["pools_joined"] == 3 and home["savings"]["total_paise"] > 0
    assert 700 <= home["trust"]["score"] <= 725 and home["trust"]["band"] == "Good"
    assert home["wallet"]["balance_paise"] == 300_000
    # 2 more open pools exist
    pools = (await client.get("/pools?scope=near", headers=M)).json()
    names = {x["sku"]["name"] for x in pools if x["status"] == "open"}
    assert {"Cola 2L", "Masala Chips 50g", "Sunflower Oil 1L"} <= names


async def test_nudge_heard(client):
    n = (await client.get("/m/home", headers=M)).json()["nudges"][0]
    assert (await client.post(f"/m/nudges/{n['id']}/heard", headers=M)).json() == {"ok": True}
    n2 = (await client.get("/m/home", headers=M)).json()["nudges"][0]
    assert n2["heard"] is True


# ------------------------------------------------------------------ commit flows
async def test_commit_with_credit(client, monkeypatch):
    p = await cola(client)
    r = await client.post(f"/pools/{p['id']}/commit", headers=M, json={"cases": 6, "use_credit": True})
    assert r.status_code == 200, r.text
    a = r.json()
    has(a, PENDING_ACTION)
    has(a["payload"], PENDING_PAYLOAD)
    assert a["payload"]["cases"] == 6 and a["payload"]["use_credit"] is True
    assert a["payload"]["amount_paise"] == 6 * p["case_price_paise"]
    assert a["payload"]["savings_paise"] == 6 * p["savings_per_case_paise"]
    has(a["payload"]["credit"], CREDIT_OFFER)
    assert a["payload"]["credit"]["eligible"]
    # idempotent: same request returns the same action
    a2 = (await client.post(f"/pools/{p['id']}/commit", headers=M, json={"cases": 6, "use_credit": True})).json()
    assert a2["id"] == a["id"]
    r = (await client.post(f"/actions/{a['id']}/confirm", headers=M)).json()
    has(r, {"pool", "tx", "loan"})
    check_pool(r["pool"], merchant_view=True)
    assert r["pool"]["committed_cases"] == 33 and r["pool"]["member_count"] == 12
    has(r["tx"], TXREF)
    assert r["tx"]["kind"] == "commit" and r["tx"]["status"] == "pending"
    has(r["loan"], LOAN)
    assert r["loan"]["status"] == "active" and r["loan"]["amount_paise"] == a["payload"]["amount_paise"]
    assert r["pool"]["mine"]["committed_cases"] == 6 and r["pool"]["mine"]["loan"]["id"] == r["loan"]["id"]
    # second confirm is rejected; tx becomes simulated
    assert (await client.post(f"/actions/{a['id']}/confirm", headers=M)).status_code == 409
    monkeypatch.setattr(settings, "sim_tx_delay_seconds", 0)
    tx = (await client.get(f"/txs/{r['tx']['id']}", headers=M)).json()
    assert tx["status"] == "simulated" and tx["tx_hash"].startswith("0x") and len(tx["tx_hash"]) == 66
    assert tx["explorer_url"] is None
    home = (await client.get("/m/home", headers=M)).json()
    assert home["wallet"]["balance_paise"] == 300_000  # loan paid for it
    assert any(x["id"] == p["id"] for x in home["active_pools"])
    assert not any(x["id"] == p["id"] for x in home["invites"])
    kinds = [n["kind"] for n in home["nudges"]]
    assert "credit" in kinds


async def test_commit_without_credit(client):
    p = await cola(client)
    a = (await client.post(f"/pools/{p['id']}/commit", headers=M, json={"cases": 3, "use_credit": False})).json()
    assert a["payload"]["use_credit"] is False and a["payload"]["credit"] is None
    r = (await client.post(f"/actions/{a['id']}/confirm", headers=M)).json()
    assert r["loan"] is None and r["pool"]["committed_cases"] == 30
    home = (await client.get("/m/home", headers=M)).json()
    assert home["wallet"]["balance_paise"] == 300_000 - 3 * p["case_price_paise"]


async def test_commit_auto_credit_and_cancel(client):
    p = await cola(client)
    # 6 cases (~₹5,076) is more than the ₹3,000 wallet -> credit is switched on automatically
    a = (await client.post(f"/pools/{p['id']}/commit", headers=M, json={"cases": 6, "use_credit": False})).json()
    assert a["payload"]["use_credit"] is True
    assert (await client.post(f"/actions/{a['id']}/cancel", headers=M)).json() == {"ok": True}
    assert (await client.post(f"/actions/{a['id']}/confirm", headers=M)).status_code == 409


async def test_guardrails(client):
    p = await cola(client)
    r = await client.post(f"/pools/{p['id']}/commit", headers=M, json={"cases": 14, "use_credit": True})
    assert r.status_code == 400 and "13" in r.json()["detail"]
    v = (await client.post("/voice/turn", headers=M, data={"text": "haan 30 case daal do, udhaar pe"})).json()
    assert v["pending_actions"][0]["payload"]["cases"] == 13  # clamped to what's left
    offer = (await client.get("/credit/offer?amount_paise=100000000", headers=M)).json()
    has(offer, CREDIT_OFFER)
    assert offer["eligible"] is False and offer["limit_paise"] < 100_000_000


async def test_action_expires(client):
    p = await cola(client)
    a = (await client.post(f"/pools/{p['id']}/commit", headers=M, json={"cases": 2, "use_credit": False})).json()
    await client.post("/demo/clock", headers=O, json={"advance_minutes": 2.5})
    a2 = (await client.post(f"/pools/{p['id']}/commit", headers=M, json={"cases": 2, "use_credit": False})).json()
    assert a2["id"] == a["id"]
    # 5 minutes later the action has expired (and the 3-minute pool too)
    await client.post("/demo/clock", headers=O, json={"advance_minutes": 3})
    r = await client.post(f"/actions/{a['id']}/confirm", headers=M)
    assert r.status_code == 410


# ------------------------------------------------------------------ funded -> delivery -> trust
async def _commit_and_fill(client) -> dict:
    p = await cola(client)
    a = (await client.post(f"/pools/{p['id']}/commit", headers=M, json={"cases": 6, "use_credit": True})).json()
    await client.post(f"/actions/{a['id']}/confirm", headers=M)
    r = (await client.post(f"/demo/pools/{p['id']}/simulate-joins", headers=O, json={"fill": True})).json()
    check_pool(r, merchant_view=False)
    assert r["status"] == "funded" and r["committed_cases"] == 40
    return r


async def test_simulate_joins_funded(client):
    pool = await _commit_and_fill(client)
    mine = (await client.get(f"/pools/{pool['id']}", headers=M)).json()
    assert mine["status"] == "funded" and mine["mine"]["delivery_status"] == "pending"
    home = (await client.get("/m/home", headers=M)).json()
    assert home["nudges"][0]["kind"] == "pool_funded"
    orders = (await client.get("/d/orders", headers=D)).json()
    o = next(x for x in orders if x["pool"]["id"] == pool["id"])
    check_pool(o["pool"], merchant_view=False)
    assert sum(d["cases"] for d in o["deliveries"]) == 40
    for d in o["deliveries"]:
        has(d, {"merchant", "cases", "amount_paise", "status"})
        has(d["merchant"], {"id", "name", "lat", "lng"})
    s = (await client.get("/d/summary", headers=D)).json()
    has(s, {"funded_pools", "cases_to_deliver", "received_paise", "pending_paise", "on_time_rate"})
    assert s["funded_pools"] >= 1 and s["cases_to_deliver"] == 40
    md = (await client.get("/m/deliveries", headers=M)).json()
    assert any(x["pool"]["id"] == pool["id"] and x["status"] == "pending" and x["cases"] == 6 for x in md)
    # count-based joins on another pool
    chips = next(x for x in (await client.get("/m/home", headers=M)).json()["invites"]
                 if x["sku"]["name"] == "Masala Chips 50g")
    r = (await client.post(f"/demo/pools/{chips['id']}/simulate-joins", headers=O, json={"count": 2})).json()
    assert r["member_count"] == chips["member_count"] + 2


async def test_qr_delivery_trust(client):
    pool = await _commit_and_fill(client)
    mid = await me_id(client)
    k0 = (await client.get("/ops/kpis", headers=O)).json()
    q = (await client.get(f"/d/deliveries/{pool['id']}/{mid}/qr", headers=D)).json()
    has(q, {"qr_payload", "expires_at"})
    # tampered QR is rejected
    bad = q["qr_payload"][:-2] + ("00" if not q["qr_payload"].endswith("00") else "11")
    assert (await client.post("/m/deliveries/confirm", headers=M, json={"qr_payload": bad})).status_code == 400
    r = (await client.post("/m/deliveries/confirm", headers=M, json={"qr_payload": q["qr_payload"]})).json()
    has(r, {"pool", "tx", "payout_paise", "fee_paise", "attestation_url", "trust"})
    amount = 6 * pool["case_price_paise"]
    assert r["fee_paise"] == amount // 100 and r["payout_paise"] == amount - amount // 100
    assert r["trust"]["delta"] > 0 and r["trust"]["score"] > 700
    assert r["tx"]["kind"] == "deliver" and r["attestation_url"] is None
    assert r["pool"]["mine"]["delivery_status"] == "delivered"
    # QR can't be reused
    assert (await client.post("/m/deliveries/confirm", headers=M, json={"qr_payload": q["qr_payload"]})).status_code == 409
    t = (await client.get("/trust/me", headers=M)).json()
    has(t, TRUST)
    has(t["components"], {"honoured_rate", "pools_joined", "sales_stability", "tenure_months"})
    assert t["score"] == r["trust"]["score"] and t["components"]["pools_joined"] == 4
    assert t["attestations"][0]["pool_id"] == pool["id"]
    for a in t["attestations"]:
        has(a, {"kind", "pool_id", "url", "created_at"})
    k1 = (await client.get("/ops/kpis", headers=O)).json()
    assert k1["fee_revenue_paise"] == k0["fee_revenue_paise"] + r["fee_paise"]
    # the rest of the shops get their delivery -> pool settles
    s = (await client.post(f"/demo/pools/{pool['id']}/simulate-delivery", headers=O, json={})).json()
    assert s["status"] == "settled" and s["delivered"] == s["member_count"] - 1
    home = (await client.get("/m/home", headers=M)).json()
    assert home["nudges"][0]["kind"] == "delivery"
    assert home["savings"]["pools_joined"] == 4


async def test_pool_fails_on_deadline(client):
    p = await cola(client)
    a = (await client.post(f"/pools/{p['id']}/commit", headers=M, json={"cases": 6, "use_credit": True})).json()
    await client.post(f"/actions/{a['id']}/confirm", headers=M)
    r = (await client.post("/demo/clock", headers=O, json={"advance_minutes": 4})).json()
    assert r["closed_pools"] >= 1
    after = (await client.get(f"/pools/{p['id']}", headers=M)).json()
    assert after["status"] == "failed" and after["mine"]["delivery_status"] == "refunded"
    assert after["mine"]["loan"]["status"] == "repaid"
    home = (await client.get("/m/home", headers=M)).json()
    assert home["wallet"]["balance_paise"] == 300_000
    assert not any(x["id"] == p["id"] for x in home["invites"] + home["active_pools"])
    txs = (await client.get("/ops/txs", headers=O)).json()
    kinds = {t["kind"] for t in txs}
    assert {"mark_failed", "refund"} <= kinds
    # simulate-joins on a failed pool is refused
    assert (await client.post(f"/demo/pools/{p['id']}/simulate-joins", headers=O, json={})).status_code == 409


async def test_demo_reset(client):
    p = await cola(client)
    a = (await client.post(f"/pools/{p['id']}/commit", headers=M, json={"cases": 6, "use_credit": True})).json()
    await client.post(f"/actions/{a['id']}/confirm", headers=M)
    await client.post(f"/demo/pools/{p['id']}/simulate-joins", headers=O, json={"fill": True})
    await client.post("/demo/clock", headers=O, json={"offset_minutes": 600})
    r = await client.post("/demo/reset", headers=O)
    assert r.status_code == 200 and r.json()["seconds"] < 3
    st = (await client.get("/demo/state")).json()
    assert st["clock_offset_minutes"] < 1
    p2 = await cola(client)
    assert p2["committed_cases"] == 27 and p2["member_count"] == 11 and p2["id"] != p["id"]
    home = (await client.get("/m/home", headers=M)).json()
    assert home["wallet"]["balance_paise"] == 300_000 and home["active_pools"] == []


# ------------------------------------------------------------------ voice (no-key fallback)
async def test_voice_hinglish_commit_then_haan(client):
    v = (await client.post("/voice/turn", headers=M,
                           data={"text": "haan 6 case daal do, paise baad mein dunga"})).json()
    has(v, VOICE)
    assert v["reply_lang"] == "hi" and v["reply_audio_url"] is None and v["suggestions"]
    a = v["pending_actions"][0]
    has(a, PENDING_ACTION)
    assert a["payload"]["cases"] == 6 and a["payload"]["use_credit"] is True
    assert "6" in v["reply_text"] and "क्रेडिट" in v["reply_text"]
    v2 = (await client.post("/voice/turn", headers=M, data={"text": "haan"})).json()
    assert v2["confirm_action_id"] == a["id"]
    r = (await client.post(f"/actions/{v2['confirm_action_id']}/confirm", headers=M)).json()
    assert r["pool"]["committed_cases"] == 33


async def test_voice_devanagari_and_questions(client):
    v = (await client.post("/voice/turn", headers=M, data={"text": "हाँ छह केस डाल दो, पैसे बाद में दूंगा"})).json()
    assert v["pending_actions"][0]["payload"]["cases"] == 6 and v["pending_actions"][0]["payload"]["use_credit"]
    v = (await client.post("/voice/turn", headers=M, data={"text": "nahi, rehne do"})).json()
    assert v["pending_actions"] == [] and "रद्द" in v["reply_text"]
    v = (await client.post("/voice/turn", headers=M, data={"text": "mera score kitna hai"})).json()
    assert re.search(r"7[0-2]\d", v["reply_text"])
    v = (await client.post("/voice/turn", headers=M, data={"text": "kitna bachaya ab tak"})).json()
    assert "₹" in v["reply_text"]
    v = (await client.post("/voice/turn", headers=M, data={"text": "cola ka stock kitna hai"})).json()
    assert "कोला" in v["reply_text"] and "4" in v["reply_text"]
    v = (await client.post("/voice/turn", headers=M, data={"text": "kaunse pool chal rahe hain"})).json()
    assert "कोला" in v["reply_text"]
    v = (await client.post("/voice/turn", headers=M, data={"text": "Yes, add 4 cases of chips", "lang": "en"})).json()
    a = v["pending_actions"][0]
    assert v["reply_lang"] == "en" and a["payload"]["cases"] == 4
    pool = (await client.get(f"/pools/{a['payload']['pool_id']}", headers=M)).json()
    assert pool["sku"]["name"] == "Masala Chips 50g"
    assert (await client.post("/voice/turn", headers=M, data={})).status_code == 400
    # audio without a Groq key -> clear error so the app uses browser speech recognition
    r = await client.post("/voice/turn", headers=M, files={"audio": ("a.webm", b"\x00" * 10, "audio/webm")})
    assert r.status_code == 400


# ------------------------------------------------------------------ forecasts, engine, ops, onboarding
async def test_forecast_detail_and_time_travel(client):
    f = (await client.get("/forecasts/cold_drinks", headers=M)).json()
    has(f, {"category", "label_en", "label_hi", "history", "forecast", "reason"})
    assert len(f["history"]) == 60 and len(f["forecast"]) == 28
    has(f["forecast"][0], {"day", "p10_paise", "p50_paise", "p90_paise"})
    assert f["forecast"][0]["p10_paise"] <= f["forecast"][0]["p50_paise"] <= f["forecast"][0]["p90_paise"]
    has(f["reason"], {"event", "last_year_uplift", "explanation_en", "explanation_hi"})
    assert f["reason"]["event"] == "New Year week"
    assert (await client.get("/forecasts/nope", headers=M)).status_code == 404
    # Demo Director time travel to the week before Diwali 2026 (8 Nov)
    await client.post("/demo/clock", headers=O, json={"iso": "2026-11-02T09:00:00+05:30"})
    home = (await client.get("/m/home", headers=M)).json()
    cats = {x["category"]: x for x in home["forecasts"]}
    assert "oil_ghee" in cats and cats["oil_ghee"]["event"] == "Diwali" and cats["oil_ghee"]["uplift"] > 2.5
    oil = (await client.get("/forecasts/oil_ghee", headers=M)).json()
    assert "Diwali" in oil["reason"]["explanation_en"]


async def test_pool_engine(client):
    r = (await client.post("/demo/run-pool-engine", headers=O)).json()
    assert 1 <= len(r["created"]) <= 4
    for p in r["created"]:
        check_pool(p, merchant_view=False)
        assert p["status"] == "open" and p["committed_cases"] == 0
        assert p["target_cases"] in [s["min_cases"] for s in p["slabs"]]
    again = (await client.post("/demo/run-pool-engine", headers=O)).json()
    created_ids = {p["id"] for p in r["created"]}
    assert not created_ids & {p["id"] for p in again["created"]}


async def test_ops_endpoints(client):
    k = (await client.get("/ops/kpis", headers=O)).json()
    has(k, KPIS)
    assert k["merchants"] == 300 and k["active_pools"] == 3 and k["pooled_gmv_paise"] > 0
    assert len(k["series"]) == 30 and set(k["series"][0]) == {"day", "gmv_paise", "savings_paise"}
    hexes = (await client.get("/ops/hexes", headers=O)).json()
    assert len(hexes) > 5
    for h in hexes:
        has(h, HEX)
        assert 0 <= h["demand_index"] <= 1 and len(h["boundary"]) >= 5
    assert sum(h["merchants"] for h in hexes) == 300
    pools = (await client.get("/ops/pools", headers=O)).json()
    for p in pools:
        check_pool(p, merchant_view=False)
    assert {p["status"] for p in pools} >= {"open", "settled"}
    txs = (await client.get("/ops/txs", headers=O)).json()
    assert 0 < len(txs) <= 20
    for t in txs:
        has(t, TXREF)
    # distributor views pools without `mine`
    for p in (await client.get("/pools?scope=all", headers=D)).json():
        check_pool(p, merchant_view=False)


async def test_pools_scopes_and_privacy(client):
    for scope in ("near", "mine", "all"):
        ps = (await client.get(f"/pools?scope={scope}", headers=M)).json()
        assert ps
        for p in ps:
            check_pool(p, merchant_view=True)
            assert p["member_count"] >= 5 or p["mine"]["invited"] or p["mine"]["committed_cases"]
    assert (await client.get("/pools/not-a-uuid", headers=M)).status_code == 404


async def test_onboarding(client):
    shops = (await client.get("/onboarding/shops", headers=D)).json()
    assert 0 < len(shops) <= 20
    has(shops[0], MERCHANT)
    r = (await client.post("/onboarding", headers=D, json={"role": "merchant", "merchant_id": shops[0]["id"]})).json()
    assert r["profile"]["role"] == "merchant" and r["merchant"]["id"] == shops[0]["id"]
    h = await client.get("/m/home", headers=D)
    assert h.status_code == 200
    r = (await client.post("/onboarding", headers=D, json={"role": "distributor"})).json()
    assert r["profile"]["role"] == "distributor" and r["distributor"] is not None


async def test_clock_endpoint(client):
    r = (await client.post("/demo/clock", headers=O, json={"offset_minutes": 90})).json()
    assert r["clock_offset_minutes"] == pytest.approx(90, abs=0.1)
    assert (await client.get("/demo/state")).json()["now"].startswith("2026-12-26T10:30")
    assert (await client.post("/demo/clock", headers=O, json={})).status_code == 400


async def test_attributions(client):
    a = (await client.get("/meta/attributions")).json()
    texts = " ".join(x["text"] for x in a)
    assert "OpenStreetMap" in texts and "Open-Meteo" in texts
