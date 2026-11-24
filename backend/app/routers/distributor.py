from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..core.auth import CurrentUser, distributor_or_ops
from ..core.db import get_session
from ..models import Delivery, Pool, PoolCommitment
from ..services import cache, pools, qr

router = APIRouter(prefix="/d", tags=["distributor"])


def _scope(q, user: CurrentUser):
    if user.role == "distributor" and user.distributor:
        return q.where(Pool.distributor_id == user.distributor.id)
    return q


def _uuid(s: str):
    try:
        return uuid.UUID(s)
    except ValueError:
        return None


@router.get("/orders")
async def orders(user: CurrentUser = Depends(distributor_or_ops), session: AsyncSession = Depends(get_session)):
    """4 statements: auth, pools, members, deliveries (shop names come from the static cache)."""
    where = Pool.status.in_(("funded", "settled"))
    if user.role == "distributor" and user.distributor:
        where = (Pool.status.in_(("funded", "settled"))) & (Pool.distributor_id == user.distributor.id)
    views = await pools.load_views(session, where)
    views = sorted(views, key=lambda v: (v.pool.status != "funded",
                                         -(v.pool.funded_at or v.pool.created_at).timestamp()))[:20]
    dels = {}
    if views:
        for d in (await session.execute(select(Delivery).where(
                Delivery.pool_id.in_([v.pool.id for v in views])))).scalars():
            dels[(d.pool_id, d.merchant_id)] = d
    st = await cache.static(session)
    out = []
    for v, pd in zip(views, await pools.serialize_many(session, views, viewer=False)):
        rows = []
        for c in sorted(v.members, key=lambda c: st.merchants[c.merchant_id].shop_no):
            m = st.merchants[c.merchant_id]
            d = dels.get((v.pool.id, c.merchant_id))
            status = "refunded" if c.status == "refunded" else (d.status if d else "pending")
            rows.append({"merchant": {"id": str(m.id), "name": m.name, "lat": m.lat, "lng": m.lng}, "cases": c.cases,
                         "amount_paise": c.amount_paise, "status": status})
        out.append({"pool": pd, "deliveries": rows})
    return out


@router.get("/deliveries/{pool_id}/{merchant_id}/qr")
async def delivery_qr(pool_id: str, merchant_id: str, user: CurrentUser = Depends(distributor_or_ops),
                      session: AsyncSession = Depends(get_session)):
    pid, mid = _uuid(pool_id), _uuid(merchant_id)
    row = (await session.execute(select(Pool.distributor_id, Delivery).outerjoin(
        Delivery, (Delivery.pool_id == Pool.id) & (Delivery.merchant_id == mid)).where(Pool.id == pid))).first() \
        if pid and mid else None
    if row is None:
        raise HTTPException(404, "Pool not found")
    dist_id, d = row
    if user.role == "distributor" and user.distributor and dist_id != user.distributor.id:
        raise HTTPException(403, "Not your pool")
    if not d:
        raise HTTPException(404, "No delivery for this shop in this pool (is the pool funded?)")
    if d.status != "pending":
        raise HTTPException(409, f"Delivery already {d.status}")
    payload, exp = qr.make(str(pid), str(d.merchant_id), d.qr_nonce)
    return {"qr_payload": payload, "expires_at": clock.iso(exp)}


@router.get("/summary")
async def summary(user: CurrentUser = Depends(distributor_or_ops), session: AsyncSession = Depends(get_session)):
    """3 statements: auth, pools by status, deliveries joined to commitments."""
    funded = (await session.execute(_scope(select(Pool.id).where(Pool.status == "funded"), user))).all()
    ds = (await session.execute(_scope(
        select(Delivery, PoolCommitment).join(
            PoolCommitment, (PoolCommitment.pool_id == Delivery.pool_id)
            & (PoolCommitment.merchant_id == Delivery.merchant_id)).join(Pool, Pool.id == Delivery.pool_id),
        user))).all()
    delivered = [(d, c) for d, c in ds if d.status == "delivered"]
    pending = [(d, c) for d, c in ds if d.status == "pending"]
    on_time = sum(1 for d, _ in delivered if d.on_time)
    return {"funded_pools": len(funded), "cases_to_deliver": sum(c.cases for _, c in pending),
            "received_paise": int(sum(d.payout_paise or 0 for d, _ in delivered)),
            "pending_paise": int(sum(c.amount_paise for _, c in pending)),
            "on_time_rate": round(on_time / len(delivered), 3) if delivered else 1.0}
