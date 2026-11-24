"""Pool lifecycle. The DB is the source of truth for the UI; every state change also queues a
chain transaction in the outbox (create_pool, commit, mark_failed, refund, deliver, attest)."""

from __future__ import annotations

import asyncio
import random
import secrets
import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..chain.config import explorer_address, fee_bps, pool_id_hex, pools_address
from ..chain.outbox import enqueue, tx_ref
from ..core import clock
from ..core.config import settings
from ..models import (
    CategoryMix,
    ChainTx,
    Delivery,
    Distributor,
    Inventory,
    Loan,
    Merchant,
    Pool,
    PoolCommitment,
    PoolInvite,
    Profile,
    Scheme,
    Sku,
)
from . import nudges
from .common import discounted_price, fee_of, haversine_km, sku_dict
from .credit import loan_dict

# Serialises every change to pool counters (single API process). On Postgres we also lock the row.
POOL_LOCK = asyncio.Lock()
PRIVACY_MIN_SHOPS = 5


# ------------------------------------------------------------------ reading
async def get_pool(session: AsyncSession, pool_id: str | uuid.UUID, for_update: bool = False) -> Pool:
    try:
        pid = uuid.UUID(str(pool_id))
    except ValueError as e:
        raise HTTPException(404, "Pool not found") from e
    q = select(Pool).where(Pool.id == pid)
    if for_update and not settings.is_sqlite:
        q = q.with_for_update()
    p = (await session.execute(q)).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Pool not found")
    return p


async def commitments(session: AsyncSession, pool_id: uuid.UUID) -> list[PoolCommitment]:
    return list((await session.execute(select(PoolCommitment).where(PoolCommitment.pool_id == pool_id)
                                       .order_by(PoolCommitment.created_at.desc()))).scalars())


async def serialize(session: AsyncSession, pool: Pool, viewer: Merchant | None) -> dict:
    sku = await session.get(Sku, pool.sku_id)
    dist = await session.get(Distributor, pool.distributor_id)
    cs = await commitments(session, pool.id)
    create_tx = await session.get(ChainTx, pool.create_tx_id) if pool.create_tx_id else None
    mine = None
    if viewer is not None:
        inv = await session.get(PoolInvite, (pool.id, viewer.id))
        c = next((x for x in cs if x.merchant_id == viewer.id), None)
        loan = await session.get(Loan, c.loan_id) if c and c.loan_id else None
        d = await session.get(Delivery, (pool.id, viewer.id)) if c else None
        status = None
        if c:
            if c.status == "refunded":
                status = "refunded"
            elif d:
                status = d.status
            elif pool.status in ("funded", "settled"):
                status = "pending"
        r = inv.reason if inv else None
        mine = {
            "invited": inv is not None, "suggested_cases": inv.suggested_cases if inv else None,
            "reason": {"event": r.get("event") or "", "uplift": r.get("uplift", 1.0),
                       "stock_units": r.get("stock_units", 0), "need_cases": r.get("need_cases", 0)} if r else None,
            "committed_cases": c.cases if c else 0, "amount_paise": c.amount_paise if c else 0,
            "loan": loan_dict(loan), "delivery_status": status,
            "commit_tx": tx_ref(await session.get(ChainTx, c.tx_id)) if c and c.tx_id else None,
        }
    addr = pools_address()
    return {
        "id": str(pool.id), "sku": sku_dict(sku), "distributor": {"id": str(dist.id), "name": dist.name},
        "target_cases": pool.target_cases, "committed_cases": pool.committed_cases, "member_count": len(cs),
        "base_case_price_paise": pool.base_case_price_paise, "case_price_paise": pool.case_price_paise,
        "disc_bps": pool.disc_bps, "savings_per_case_paise": pool.base_case_price_paise - pool.case_price_paise,
        "slabs": [{"min_cases": int(s["min_cases"]), "disc_bps": int(s["disc_bps"])} for s in pool.slabs],
        "deadline": clock.iso(pool.deadline), "delivery_deadline": clock.iso(pool.delivery_deadline),
        "status": pool.status,
        "center": {"lat": pool.center_lat, "lng": pool.center_lng, "area_name": pool.area_name},
        "mine": mine,
        "chain": {"pool_id_hex": pool.chain_id_hex, "contract_address": addr, "contract_url": explorer_address(addr),
                  "create_tx": tx_ref(create_tx)},
        "recent_joins": [{"at": clock.iso(c.created_at), "cases": c.cases} for c in cs[:10]],
    }


async def visible_to_merchant(session: AsyncSession, pool: Pool, m: Merchant) -> bool:
    """Privacy rule: merchants only see pools with 5+ shops, unless they were invited or joined."""
    if await session.get(PoolInvite, (pool.id, m.id)) or await session.get(PoolCommitment, (pool.id, m.id)):
        return True
    return len(await commitments(session, pool.id)) >= PRIVACY_MIN_SHOPS


# ------------------------------------------------------------------ creating
async def create_pool(session: AsyncSession, *, sku: Sku, distributor: Distributor, scheme: Scheme | None,
                      target: int, disc_bps: int, slabs: list, center_lat: float, center_lng: float,
                      area_name: str, cluster_h3: str | None, deadline: datetime, delivery_deadline: datetime,
                      status: str = "open", created_at: datetime | None = None, chain: bool = True,
                      tx_simulated: bool = False) -> Pool:
    import h3

    pid = uuid.uuid4()
    p = Pool(id=pid, chain_id_hex=pool_id_hex(pid), sku_id=sku.id, distributor_id=distributor.id,
             scheme_id=scheme.id if scheme else None, target_cases=target, committed_cases=0,
             base_case_price_paise=sku.case_price_paise, case_price_paise=discounted_price(sku.case_price_paise, disc_bps),
             disc_bps=disc_bps, slabs=slabs, center_h3=h3.latlng_to_cell(center_lat, center_lng, 8),
             cluster_h3=cluster_h3, center_lat=center_lat, center_lng=center_lng, area_name=area_name,
             deadline=deadline, delivery_deadline=delivery_deadline, status=status,
             created_at=created_at or clock.now())
    session.add(p)
    await session.flush()
    if chain:
        tx = await enqueue(session, "create_pool", {
            "pool_id": str(pid), "pool_id_hex": p.chain_id_hex, "supplier": distributor.wallet_address,
            "unit_price": p.case_price_paise, "target": target}, simulated=tx_simulated)
        p.create_tx_id = tx.id
    return p


# ------------------------------------------------------------------ committing
async def apply_commit(session: AsyncSession, pool: Pool, m: Merchant, cases: int, loan: Loan | None = None,
                       at: datetime | None = None, simulated_tx: bool = False) -> tuple[PoolCommitment, ChainTx]:
    """Caller holds POOL_LOCK and has validated the request."""
    amount = cases * pool.case_price_paise
    if loan is not None:
        m.wallet_balance_paise += loan.amount_paise
    m.wallet_balance_paise -= amount
    tx = await enqueue(session, "commit", {"pool_id": str(pool.id), "pool_id_hex": pool.chain_id_hex,
                                           "merchant_id": str(m.id), "wallet_index": m.wallet_index,
                                           "cases": cases, "amount_paise": amount},
                       depends_on=pool.create_tx_id, simulated=simulated_tx)
    c = PoolCommitment(pool_id=pool.id, merchant_id=m.id, cases=cases, amount_paise=amount,
                       loan_id=loan.id if loan else None, status="committed", tx_id=tx.id, created_at=at or clock.now())
    session.add(c)
    pool.committed_cases += cases
    inv = await session.get(PoolInvite, (pool.id, m.id))
    if inv:
        inv.status = "joined"
    await session.flush()
    if pool.committed_cases >= pool.target_cases:
        await mark_funded(session, pool)
    return c, tx


async def mark_funded(session: AsyncSession, pool: Pool, at: datetime | None = None, notify: bool = True) -> None:
    pool.status = "funded"
    pool.funded_at = at or clock.now()
    sku = await session.get(Sku, pool.sku_id)
    dist = await session.get(Distributor, pool.distributor_id)
    for c in await commitments(session, pool.id):
        if not await session.get(Delivery, (pool.id, c.merchant_id)):
            session.add(Delivery(pool_id=pool.id, merchant_id=c.merchant_id, qr_nonce=secrets.token_hex(8),
                                 status="pending"))
        if notify:
            m = await session.get(Merchant, c.merchant_id)
            hi, en = nudges.funded_text(m, sku.name, sku.name_hi, pool.target_cases, c.cases, dist.name)
            await nudges.create(session, m, "pool_funded", hi, en, pool.id, llm_ok=False)
    await session.flush()


async def fail_pool(session: AsyncSession, pool: Pool) -> None:
    pool.status = "failed"
    mf = await enqueue(session, "mark_failed", {"pool_id": str(pool.id), "pool_id_hex": pool.chain_id_hex},
                       depends_on=pool.create_tx_id)
    for c in await commitments(session, pool.id):
        if c.status != "committed":
            continue
        c.status = "refunded"
        m = await session.get(Merchant, c.merchant_id)
        m.wallet_balance_paise += c.amount_paise
        if c.loan_id:
            loan = await session.get(Loan, c.loan_id)
            if loan and loan.status == "active":
                loan.status = "repaid"  # loan cancelled: the refund goes straight back to the lender
                m.wallet_balance_paise -= loan.amount_paise
        await enqueue(session, "refund", {"pool_id": str(pool.id), "pool_id_hex": pool.chain_id_hex,
                                          "merchant_id": str(m.id), "wallet_index": m.wallet_index,
                                          "amount_paise": c.amount_paise}, depends_on=mf.id)
        inv = await session.get(PoolInvite, (pool.id, m.id))
        if inv:
            inv.status = "invited"


async def close_expired(session: AsyncSession) -> int:
    """Open pools past their deadline fail (all-or-nothing). Returns how many were closed."""
    now = clock.now()
    async with POOL_LOCK:
        expired = (await session.execute(select(Pool).where(Pool.status == "open", Pool.deadline < now))).scalars().all()
        for p in expired:
            await fail_pool(session, p)
        if expired:
            await session.commit()
    return len(expired)


async def ensure_fresh(session: AsyncSession, pool: Pool) -> None:
    if pool.status == "open" and pool.deadline < clock.now():
        await close_expired(session)
        await session.refresh(pool)


# ------------------------------------------------------------------ delivery
async def confirm_delivery(session: AsyncSession, pool: Pool, m: Merchant, at: datetime | None = None,
                           chain: bool = True) -> dict:
    """Caller holds POOL_LOCK. Releases this merchant's share to the distributor (minus the Paytm fee)."""
    if pool.status not in ("funded", "settled"):
        raise HTTPException(409, "Pool is not funded yet")
    d = await session.get(Delivery, (pool.id, m.id))
    c = await session.get(PoolCommitment, (pool.id, m.id))
    if not d or not c:
        raise HTTPException(404, "This shop has no delivery in this pool")
    if d.status != "pending":
        raise HTTPException(409, f"Delivery already {d.status}")
    now = at or clock.now()
    fee = fee_of(c.amount_paise, fee_bps())
    d.status, d.confirmed_at, d.on_time = "delivered", now, now <= pool.delivery_deadline
    d.fee_paise, d.payout_paise = fee, c.amount_paise - fee
    c.status = "delivered"
    tx = None
    if chain:
        dist = await session.get(Distributor, pool.distributor_id)
        tx = await enqueue(session, "deliver", {"pool_id": str(pool.id), "pool_id_hex": pool.chain_id_hex,
                                                "merchant_id": str(m.id), "wallet_index": m.wallet_index,
                                                "amount_paise": c.amount_paise, "fee_paise": fee},
                           depends_on=c.tx_id)
        d.tx_id = tx.id
        if settings.chain_mode == "sepolia":
            await enqueue(session, "attest", {"pool_id": str(pool.id), "pool_id_hex": pool.chain_id_hex,
                                              "merchant_id": str(m.id), "merchant": m.wallet_address,
                                              "supplier": dist.wallet_address, "cases": c.cases,
                                              "on_time": bool(d.on_time), "amount_paise": c.amount_paise},
                          depends_on=tx.id)
    # stock arrives
    sku = await session.get(Sku, pool.sku_id)
    inv = await session.get(Inventory, (m.id, sku.id))
    if inv:
        inv.qty_units += c.cases * sku.case_size
        inv.updated_at = now
    else:
        session.add(Inventory(merchant_id=m.id, sku_id=sku.id, qty_units=c.cases * sku.case_size, seed_qty_units=0,
                              source="pool", updated_at=now))
    await session.flush()
    pending = (await session.execute(select(Delivery).where(Delivery.pool_id == pool.id,
                                                            Delivery.status == "pending"))).first()
    if pending is None:
        pool.status, pool.settled_at = "settled", now
    return {"delivery": d, "tx": tx, "payout_paise": d.payout_paise, "fee_paise": fee, "commitment": c}


# ------------------------------------------------------------------ demo: other shops join
async def _candidates(session: AsyncSession, pool: Pool) -> list[tuple[Merchant, int | None]]:
    sku = await session.get(Sku, pool.sku_id)
    committed = {c.merchant_id for c in await commitments(session, pool.id)}
    claimed = {r[0] for r in (await session.execute(select(Profile.merchant_id)
                                                    .where(Profile.merchant_id.is_not(None)))).all()}
    invites = (await session.execute(select(PoolInvite, Merchant).join(Merchant, Merchant.id == PoolInvite.merchant_id)
                                     .where(PoolInvite.pool_id == pool.id))).all()
    out: list[tuple[Merchant, int | None]] = []
    seen = set()
    for inv, m in sorted(invites, key=lambda t: t[1].shop_no):
        if m.id in committed or m.is_demo or m.id in claimed:
            continue
        out.append((m, inv.suggested_cases))
        seen.add(m.id)
    stockists = {r[0] for r in (await session.execute(select(CategoryMix.merchant_id)
                                                      .where(CategoryMix.category == sku.category))).all()}
    others = (await session.execute(select(Merchant).where(Merchant.is_demo.is_(False)))).scalars().all()
    others = [m for m in others if m.id not in committed and m.id not in seen and m.id not in claimed
              and m.id in stockists]
    others.sort(key=lambda m: haversine_km(pool.center_lat, pool.center_lng, m.lat, m.lng))
    out += [(m, None) for m in others]
    return out


async def simulate_joins(session: AsyncSession, pool: Pool, fill: bool = True, count: int | None = None) -> int:
    """Caller holds POOL_LOCK. Seeded shops commit until the target is reached (or `count` shops joined)."""
    if pool.status != "open":
        raise HTTPException(409, f"Pool is {pool.status}")
    rng = random.Random(str(pool.id) + str(pool.committed_cases))
    joined = 0
    for m, suggested in await _candidates(session, pool):
        remaining = pool.target_cases - pool.committed_cases
        if remaining <= 0 or (count is not None and joined >= count) or (count is None and not fill):
            break
        cases = min(remaining, suggested or rng.randint(1, 4))
        amount = cases * pool.case_price_paise
        m.wallet_balance_paise = max(m.wallet_balance_paise, amount)  # demo shops always have the money
        await apply_commit(session, pool, m, cases)
        joined += 1
        if pool.status != "open":
            break
    return joined


async def savings_summary(session: AsyncSession, m: Merchant) -> dict:
    rows = (await session.execute(select(PoolCommitment, Pool).join(Pool, Pool.id == PoolCommitment.pool_id)
                                  .where(PoolCommitment.merchant_id == m.id,
                                         PoolCommitment.status != "refunded"))).all()
    total = sum(c.cases * (p.base_case_price_paise - p.case_price_paise) for c, p in rows)
    return {"total_paise": int(total), "pools_joined": len(rows)}


async def merchant_pools(session: AsyncSession, m: Merchant) -> tuple[list[Pool], list[Pool]]:
    """(open invites not yet joined, active pools joined: open or funded and not yet delivered)."""
    await close_expired(session)
    inv = (await session.execute(select(Pool).join(PoolInvite, PoolInvite.pool_id == Pool.id)
                                 .where(PoolInvite.merchant_id == m.id, Pool.status == "open")
                                 .order_by(Pool.deadline))).scalars().all()
    joined_ids = {r[0] for r in (await session.execute(select(PoolCommitment.pool_id)
                                                       .where(PoolCommitment.merchant_id == m.id))).all()}
    invites = [p for p in inv if p.id not in joined_ids]
    active = (await session.execute(
        select(Pool).join(PoolCommitment, PoolCommitment.pool_id == Pool.id)
        .where(PoolCommitment.merchant_id == m.id, PoolCommitment.status == "committed",
               Pool.status.in_(("open", "funded")))
        .order_by(Pool.deadline))).scalars().all()
    return invites, list(active)
