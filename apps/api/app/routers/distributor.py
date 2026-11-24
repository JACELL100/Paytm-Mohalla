from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..core.auth import CurrentUser, distributor_or_ops
from ..core.db import get_session
from ..models import Delivery, Merchant, Pool, PoolCommitment
from ..services import pools, qr

router = APIRouter(prefix="/d", tags=["distributor"])


def _scope(q, user: CurrentUser):
    if user.role == "distributor" and user.distributor:
        return q.where(Pool.distributor_id == user.distributor.id)
    return q


async def _order(session: AsyncSession, p: Pool) -> dict:
    rows = (await session.execute(select(PoolCommitment, Merchant).join(Merchant, Merchant.id == PoolCommitment.merchant_id)
                                  .where(PoolCommitment.pool_id == p.id).order_by(Merchant.shop_no))).all()
    out = []
    for c, m in rows:
        d = await session.get(Delivery, (p.id, m.id))
        status = "refunded" if c.status == "refunded" else (d.status if d else "pending")
        out.append({"merchant": {"id": str(m.id), "name": m.name, "lat": m.lat, "lng": m.lng}, "cases": c.cases,
                    "amount_paise": c.amount_paise, "status": status})
    return {"pool": await pools.serialize(session, p, None), "deliveries": out}


@router.get("/orders")
async def orders(user: CurrentUser = Depends(distributor_or_ops), session: AsyncSession = Depends(get_session)):
    q = _scope(select(Pool).where(Pool.status.in_(("funded", "settled"))), user)
    ps = (await session.execute(q)).scalars().all()
    ps = sorted(ps, key=lambda p: (p.status != "funded", -(p.funded_at or p.created_at).timestamp()))[:20]
    return [await _order(session, p) for p in ps]


@router.get("/deliveries/{pool_id}/{merchant_id}/qr")
async def delivery_qr(pool_id: str, merchant_id: str, user: CurrentUser = Depends(distributor_or_ops),
                      session: AsyncSession = Depends(get_session)):
    p = await pools.get_pool(session, pool_id)
    if user.role == "distributor" and user.distributor and p.distributor_id != user.distributor.id:
        raise HTTPException(403, "Not your pool")
    mid = _uuid(merchant_id)
    d = await session.get(Delivery, (p.id, mid)) if mid else None
    if not d:
        raise HTTPException(404, "No delivery for this shop in this pool (is the pool funded?)")
    if d.status != "pending":
        raise HTTPException(409, f"Delivery already {d.status}")
    payload, exp = qr.make(str(p.id), str(d.merchant_id), d.qr_nonce)
    return {"qr_payload": payload, "expires_at": clock.iso(exp)}


def _uuid(s: str):
    try:
        return uuid.UUID(s)
    except ValueError:
        return None


@router.get("/summary")
async def summary(user: CurrentUser = Depends(distributor_or_ops), session: AsyncSession = Depends(get_session)):
    ps = (await session.execute(_scope(select(Pool), user))).scalars().all()
    ids = [p.id for p in ps]
    funded = [p for p in ps if p.status == "funded"]
    ds = (await session.execute(select(Delivery, PoolCommitment).join(
        PoolCommitment, (PoolCommitment.pool_id == Delivery.pool_id) & (PoolCommitment.merchant_id == Delivery.merchant_id))
        .where(Delivery.pool_id.in_(ids)))).all() if ids else []
    delivered = [(d, c) for d, c in ds if d.status == "delivered"]
    pending = [(d, c) for d, c in ds if d.status == "pending"]
    on_time = sum(1 for d, _ in delivered if d.on_time)
    return {"funded_pools": len(funded), "cases_to_deliver": sum(c.cases for _, c in pending),
            "received_paise": int(sum(d.payout_paise or 0 for d, _ in delivered)),
            "pending_paise": int(sum(c.amount_paise for _, c in pending)),
            "on_time_rate": round(on_time / len(delivered), 3) if delivered else 1.0}
