"""Demo Director (ops role, DEMO_MODE only)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..core.auth import CurrentUser, ops_user
from ..core.config import settings
from ..core.db import get_session
from ..models import Pool
from ..services import cache, nudges, pool_engine, pools, seed, trust

router = APIRouter(prefix="/demo", tags=["demo director"])


def _demo_only():
    if not settings.demo_mode:
        raise HTTPException(403, "Demo Director is off (DEMO_MODE=false)")


class ClockBody(BaseModel):
    offset_minutes: float | None = None  # absolute: now = DEMO_NOW + offset_minutes
    iso: str | None = None  # absolute timestamp
    advance_minutes: float | None = None  # relative jump


class JoinsBody(BaseModel):
    fill: bool = True
    count: int | None = None


class SimDeliveryBody(BaseModel):
    merchant_id: str | None = None


@router.post("/clock")
async def set_clock(body: ClockBody, user: CurrentUser = Depends(ops_user), session: AsyncSession = Depends(get_session)):
    _demo_only()
    if body.iso:
        try:
            clock.clock.set_iso(body.iso)
        except ValueError as e:
            raise HTTPException(400, "Bad iso timestamp") from e
    elif body.offset_minutes is not None:
        clock.clock.set_offset_minutes(body.offset_minutes)
    elif body.advance_minutes is not None:
        clock.clock.advance(body.advance_minutes)
    else:
        raise HTTPException(400, "Send offset_minutes, iso or advance_minutes")
    closed = await pools.close_expired(session)
    return {"now": clock.iso(clock.now()), "demo_mode": settings.demo_mode,
            "clock_offset_minutes": clock.clock.offset_minutes(), "closed_pools": closed}


@router.post("/run-pool-engine")
async def run_engine(user: CurrentUser = Depends(ops_user), session: AsyncSession = Depends(get_session)):
    _demo_only()
    created = await pool_engine.run(session)
    views = await pools.load_views(session, Pool.id.in_([p.id for p in created])) if created else []
    return {"created": await pools.serialize_many(session, views, viewer=False)}


@router.post("/pools/{pool_id}/simulate-joins")
async def simulate_joins(pool_id: str, body: JoinsBody | None = Body(default=None),
                         user: CurrentUser = Depends(ops_user), session: AsyncSession = Depends(get_session)):
    _demo_only()
    body = body or JoinsBody()
    async with pools.POOL_LOCK:
        views = await pools.load_views(session, Pool.id == pools._uuid(pool_id), for_update=True, refresh=True)
        if not views:
            raise HTTPException(404, "Pool not found")
        v = views[0]
        if v.pool.status == "open" and v.pool.deadline < clock.now():
            raise HTTPException(409, "Pool deadline has passed")
        joined = await pools.simulate_joins(session, v.pool, fill=body.fill, count=body.count, members=v.members)
        await session.commit()
    out = (await pools.serialize_many(session, [v], viewer=False))[0]
    out["joined"] = joined
    return out


@router.post("/pools/{pool_id}/simulate-delivery")
async def simulate_delivery(pool_id: str, body: SimDeliveryBody | None = Body(default=None),
                            user: CurrentUser = Depends(ops_user), session: AsyncSession = Depends(get_session)):
    """Batched: one round of reads and writes for all shops, not per shop."""
    _demo_only()
    body = body or SimDeliveryBody()
    async with pools.POOL_LOCK:
        views = await pools.load_views(session, Pool.id == pools._uuid(pool_id), for_update=True, refresh=True)
        if not views:
            raise HTTPException(404, "Pool not found")
        v = views[0]
        p = v.pool
        if p.status not in ("funded", "settled"):
            raise HTTPException(409, f"Pool is {p.status}; deliveries need a funded pool")
        st = await cache.static(session)
        if body.merchant_id:
            try:
                ids = [uuid.UUID(body.merchant_id)]
            except ValueError as e:
                raise HTTPException(400, "Bad merchant_id") from e
        else:
            ids = [c.merchant_id for c in v.members if not st.merchants[c.merchant_id].is_demo]
        res = await pools.confirm_deliveries(session, p, ids, members=v.members, strict=False)
        scores = await trust.refresh_many(session, [st.merchants[mid] for mid in res])
        sku = st.skus[p.sku_id]
        for mid, r in res.items():
            m = st.merchants[mid]
            score, delta = scores[mid]
            hi, en = nudges.delivery_text(m, sku.name, sku.name_hi, r["commitment"].cases, r["payout_paise"],
                                          score, delta)
            await nudges.create(session, m, "delivery", hi, en, p.id, llm_ok=False)
        await session.commit()
    out = (await pools.serialize_many(session, [v], viewer=False))[0]
    out["delivered"] = len(res)
    return out


@router.post("/reset")
async def reset(user: CurrentUser = Depends(ops_user), session: AsyncSession = Depends(get_session)):
    _demo_only()
    info = await seed.reset(session)
    return {"ok": True, "now": clock.iso(clock.now()), **info}

