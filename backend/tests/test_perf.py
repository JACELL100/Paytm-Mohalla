"""Statement budgets per request (on Supabase every statement is a network round trip).
Counts are database-independent, so they are asserted on SQLite. Caches are warmed by one call first."""

from __future__ import annotations

from contextlib import contextmanager

from sqlalchemy import event

from app.core.config import settings
from app.core.db import engine

from .conftest import D, M, O

BUDGETS = {
    "GET /m/home": 6, "GET /pools/{id}": 4, "GET /ops/pools": 5, "GET /d/orders": 5, "GET /ops/kpis": 5,
    "GET /ops/hexes": 3, "POST /actions/{id}/confirm": 12, "POST /demo/reset": 25,
}


@contextmanager
def count_statements():
    box = {"n": 0}

    def _count(*_a, **_k):
        box["n"] += 1

    event.listen(engine.sync_engine, "before_cursor_execute", _count)
    try:
        yield box
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", _count)


async def measure(client, method: str, url: str, headers: dict, warm: bool = True, **kw) -> tuple[int, dict]:
    if warm:
        await client.request(method, url, headers=headers, **kw)
    with count_statements() as box:
        r = await client.request(method, url, headers=headers, **kw)
    assert r.status_code == 200, r.text
    return box["n"], r.json()


async def test_read_budgets(client):
    n, home = await measure(client, "GET", "/m/home", M)
    assert n <= BUDGETS["GET /m/home"], n
    pid = home["invites"][0]["id"]
    n, _ = await measure(client, "GET", f"/pools/{pid}", M)
    assert n <= BUDGETS["GET /pools/{id}"], n
    n, _ = await measure(client, "GET", "/ops/pools", O)
    assert n <= BUDGETS["GET /ops/pools"], n
    n, _ = await measure(client, "GET", "/ops/kpis", O)
    assert n <= BUDGETS["GET /ops/kpis"], n
    n, _ = await measure(client, "GET", "/ops/hexes", O)
    assert n <= BUDGETS["GET /ops/hexes"], n


async def test_confirm_and_orders_budgets(client):
    home = (await client.get("/m/home", headers=M)).json()
    pid = home["invites"][0]["id"]
    a = (await client.post(f"/pools/{pid}/commit", headers=M, json={"cases": 6, "use_credit": True})).json()
    n, r = await measure(client, "POST", f"/actions/{a['id']}/confirm", M, warm=False)
    assert n <= BUDGETS["POST /actions/{id}/confirm"], n
    assert r["pool"]["committed_cases"] == 33 and r["loan"] is not None
    await client.post(f"/demo/pools/{pid}/simulate-joins", headers=O, json={"fill": True})
    n, orders = await measure(client, "GET", "/d/orders", D)
    assert n <= BUDGETS["GET /d/orders"], n
    assert any(o["pool"]["id"] == pid for o in orders)


async def test_reset_budget_and_snapshot(client):
    # the fixture already reset once, so a snapshot exists: this is the fast path
    n, r = await measure(client, "POST", "/demo/reset", O, warm=False)
    assert n <= BUDGETS["POST /demo/reset"], n
    assert r["mode"] == "snapshot" and len(r["pools"]) == 3 and 700 <= r["trust"] <= 725
    # pool ids are fresh on every reset (on-chain ids must be unique), and so are their hex ids
    r2 = (await client.post("/demo/reset", headers=O)).json()
    assert not set(r["pools"]) & set(r2["pools"])
    p = (await client.get(f"/pools/{r2['pools'][0]}", headers=M)).json()
    assert p["committed_cases"] == 27 and p["member_count"] == 11 and p["sku"]["name"] == "Cola 2L"
    assert p["chain"]["create_tx"]["status"] == "pending"
    txs = (await client.get("/ops/txs", headers=O)).json()
    pool_hexes = {x["chain"]["pool_id_hex"] for x in (await client.get("/ops/pools", headers=O)).json()}
    assert p["chain"]["pool_id_hex"] in pool_hexes and txs


async def test_snapshot_fingerprint_fallback(client, monkeypatch):
    monkeypatch.setattr(settings, "demo_pool_deadline_minutes", 4.0)
    r = (await client.post("/demo/reset", headers=O)).json()
    assert r["mode"] == "full"  # settings changed -> rebuild + re-capture
    r = (await client.post("/demo/reset", headers=O)).json()
    assert r["mode"] == "snapshot"
    monkeypatch.setattr(settings, "demo_pool_deadline_minutes", 3.0)
    assert (await client.post("/demo/reset", headers=O)).json()["mode"] == "full"


async def test_delivery_flow_is_batched(client):
    home = (await client.get("/m/home", headers=M)).json()
    pid = home["invites"][0]["id"]
    await client.post(f"/demo/pools/{pid}/simulate-joins", headers=O, json={"fill": True})
    with count_statements() as box:
        r = await client.post(f"/demo/pools/{pid}/simulate-delivery", headers=O, json={})
    assert r.status_code == 200 and r.json()["delivered"] >= 10
    assert box["n"] <= 30, box["n"]  # was ~190 when done shop by shop
