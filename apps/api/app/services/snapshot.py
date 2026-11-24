"""Fast demo reset from a snapshot (POST /demo/reset).

After a full `seed_dynamic` we capture every dynamic table (plus wallet balances that differ from the seed)
into one JSON row in `demo_snapshots`. A fast reset then:
  1. reads the snapshot (1 statement),
  2. wipes the dynamic tables (Postgres: ONE `TRUNCATE ... RESTART IDENTITY`; SQLite: one DELETE each),
  3. resets wallet balances / inventory / dev profiles with CASE updates (4 statements),
  4. bulk-inserts each table's rows (one statement per non-empty table) with
     - every timestamp shifted by (now - snapshot time),
     - pool ids remapped to fresh uuid4s (and pool_id_hex, also inside JSON payloads such as chain_txs.ref),
       because on-chain pool ids must be unique,
     - chain_txs reset to pending with no hash (the relayer simulates / sends them again),
  5. Postgres: moves the chain_txs id sequence past the restored ids.
The snapshot is ignored (slow path + re-capture) when it is missing or its fingerprint (wallet mnemonic,
demo settings, format) doesn't match.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime

from sqlalchemy import Date, Uuid, case, delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..chain import wallets
from ..chain.config import pool_id_hex
from ..core import clock
from ..core.config import settings
from ..core.db import TZDateTime
from ..models import (
    ChainTx,
    DemoSnapshot,
    Delivery,
    Inventory,
    Invoice,
    Loan,
    Merchant,
    Nudge,
    PendingAction,
    Pool,
    PoolCommitment,
    PoolInvite,
    Profile,
    TrustScore,
)

log = logging.getLogger("mohalla.snapshot")
FORMAT = 2
# insert order (parents first)
DYNAMIC = [Pool, PoolInvite, PoolCommitment, Delivery, Loan, TrustScore, ChainTx, Nudge, PendingAction, Invoice]
DEMO_WALLET_INDEX = 101  # shop #1 (Ramesh)


def fingerprint() -> dict:
    return {"format": FORMAT, "demo_wallet": wallets.address(DEMO_WALLET_INDEX),
            "pool_minutes": settings.demo_pool_deadline_minutes, "fee_bps": settings.fee_bps,
            "demo_now": settings.demo_now}


def _enc(v):
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


async def capture(session: AsyncSession, snapshot_now: datetime) -> None:
    data = {}
    for model in DYNAMIC:
        t = model.__table__
        rows = (await session.execute(select(t))).mappings().all()
        data[t.name] = [{k: _enc(v) for k, v in r.items()} for r in rows]
    mt = Merchant.__table__
    balances = {str(i): b for i, b in (await session.execute(
        select(mt.c.id, mt.c.wallet_balance_paise).where(mt.c.wallet_balance_paise != mt.c.seed_balance_paise))).all()}
    await session.execute(delete(DemoSnapshot))
    session.add(DemoSnapshot(id=1, created_at=clock.now(), data=data,
                             meta={"fp": fingerprint(), "now": snapshot_now.isoformat(), "balances": balances}))
    await session.commit()
    log.info("demo snapshot captured (%s)", {k: len(v) for k, v in data.items()})


def _decoder(col):
    if isinstance(col.type, Uuid):
        return uuid.UUID
    if isinstance(col.type, TZDateTime):
        return datetime.fromisoformat
    if isinstance(col.type, Date):
        return date.fromisoformat
    return None


async def restore(session: AsyncSession) -> dict | None:
    """Fast path. Returns {"pools": [...]} or None if the snapshot can't be used."""
    from ..services.seed import DEMO_DISTRIBUTOR_ID, DEMO_MERCHANT_ID

    row = (await session.execute(select(DemoSnapshot.meta, DemoSnapshot.data).where(DemoSnapshot.id == 1))).first()
    if row is None:
        return None
    meta, data = row
    if meta.get("fp") != fingerprint():
        log.info("demo snapshot fingerprint changed; rebuilding")
        return None
    now = clock.now()
    delta = now - datetime.fromisoformat(meta["now"])

    # fresh pool ids (on-chain ids must be unique) + their keccak hex
    remap: dict[str, str] = {}
    for p in data.get("pools", []):
        new = uuid.uuid4()
        remap[p["id"]] = str(new)
        remap[p["chain_id_hex"]] = pool_id_hex(new)

    def swap(v):
        if isinstance(v, str):
            return remap.get(v, v)
        if isinstance(v, dict):
            return {k: swap(x) for k, x in v.items()}
        if isinstance(v, list):
            return [swap(x) for x in v]
        return v

    tables = {}
    for model in DYNAMIC:
        t = model.__table__
        decoders = {c.name: (_decoder(c), isinstance(c.type, TZDateTime)) for c in t.columns}
        out = []
        for r in data.get(t.name, []):
            new_row = {}
            for name, (dec, is_ts) in decoders.items():
                v = swap(r.get(name))
                if v is not None and dec is not None:
                    v = dec(v)
                    if is_ts:
                        v = v + delta
                new_row[name] = v
            if t.name == "chain_txs":
                new_row.update(status="pending", tx_hash=None, error=None, attempts=0, next_attempt_at=None,
                               updated_at=new_row["created_at"])
            out.append(new_row)
        tables[t.name] = out

    # wipe dynamic tables
    names = [m.__table__.name for m in DYNAMIC]
    if settings.is_sqlite:
        for m in reversed(DYNAMIC):
            await session.execute(delete(m.__table__))
    else:
        await session.execute(text(f"TRUNCATE TABLE {', '.join(names)} RESTART IDENTITY"))

    # wallets, stock and dev profiles back to the seeded state
    mt = Merchant.__table__
    balances = {uuid.UUID(k): v for k, v in (meta.get("balances") or {}).items()}
    bal = case(balances, value=mt.c.id, else_=mt.c.seed_balance_paise) if balances else mt.c.seed_balance_paise
    await session.execute(update(mt).values(wallet_balance_paise=bal,
                                            lang=case((mt.c.is_demo.is_(True), "hi"), else_=mt.c.lang)))
    it = Inventory.__table__
    await session.execute(delete(it).where(it.c.seed_qty_units == 0))
    await session.execute(update(it).where(it.c.qty_units != it.c.seed_qty_units)
                          .values(qty_units=it.c.seed_qty_units, source="bills"))
    pt = Profile.__table__
    tok = pt.c.dev_token
    await session.execute(update(pt).where(tok.in_(["dev-merchant", "dev-distributor", "dev-ops"])).values(
        role=case((tok == "dev-merchant", "merchant"), (tok == "dev-distributor", "distributor"), else_="ops"),
        merchant_id=case((tok == "dev-merchant", DEMO_MERCHANT_ID), else_=None),
        distributor_id=case((tok == "dev-distributor", DEMO_DISTRIBUTOR_ID), else_=None),
        lang=case((tok == "dev-merchant", "hi"), else_="en")))

    # bulk inserts, one statement per table
    for model in DYNAMIC:
        rows = tables[model.__table__.name]
        if rows:
            await session.execute(model.__table__.insert(), rows)
    if not settings.is_sqlite:
        await session.execute(text("SELECT setval(pg_get_serial_sequence('chain_txs', 'id'), "
                                   "COALESCE((SELECT MAX(id) FROM chain_txs), 0) + 1, false)"))
    await session.commit()
    pools = tables["pools"]
    # same order as the slow path: cola, chips, oil (the 3 open pools, by deadline)
    open_pools = sorted([p for p in pools if p["status"] == "open"], key=lambda p: p["deadline"])
    demo_trust = next((r["score"] for r in tables["trust_scores"] if r["merchant_id"] == DEMO_MERCHANT_ID), None)
    return {"pools": [str(p["id"]) for p in open_pools], "trust": demo_trust}
