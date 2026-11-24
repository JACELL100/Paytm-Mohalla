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
from ..models import Delivery, Merchant, Sku
from ..services import nudges, pool_engine, pools, seed, trust

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
    return {"created": [await pools.serialize(session, p, None) for p in created]}


@router.post("/pools/{pool_id}/simulate-joins")
async def simulate_joins(pool_id: str, body: JoinsBody | None = Body(default=None),
                         user: CurrentUser = Depends(ops_user), session: AsyncSession = Depends(get_session)):
    _demo_only()
    body = body or JoinsBody()
    async with pools.POOL_LOCK:
        p = await pools.get_pool(session, pool_id, for_update=True)
        if p.status == "open" and p.deadline < clock.now():
            raise HTTPException(409, "Pool deadline has passed")
        joined = await pools.simulate_joins(session, p, fill=body.fill, count=body.count)
        await session.commit()
    await session.refresh(p)
    out = await pools.serialize(session, p, None)
    out["joined"] = joined
    return out


@router.post("/pools/{pool_id}/simulate-delivery")
async def simulate_delivery(pool_id: str, body: SimDeliveryBody | None = Body(default=None),
                            user: CurrentUser = Depends(ops_user), session: AsyncSession = Depends(get_session)):
    _demo_only()
    body = body or SimDeliveryBody()
    async with pools.POOL_LOCK:
        p = await pools.get_pool(session, pool_id, for_update=True)
        if p.status not in ("funded", "settled"):
            raise HTTPException(409, f"Pool is {p.status}; deliveries need a funded pool")
        q = select(Delivery).where(Delivery.pool_id == p.id, Delivery.status == "pending")
        if body.merchant_id:
            try:
                q = q.where(Delivery.merchant_id == uuid.UUID(body.merchant_id))
            except ValueError as e:
                raise HTTPException(400, "Bad merchant_id") from e
        ds = (await session.execute(q)).scalars().all()
        sku = await session.get(Sku, p.sku_id)
        done = 0
        for d in ds:
            m = await session.get(Merchant, d.merchant_id)
            if m.is_demo and not body.merchant_id:
                continue
            res = await pools.confirm_delivery(session, p, m)
            score, delta = await trust.refresh(session, m)
            hi, en = nudges.delivery_text(m, sku.name, sku.name_hi, res["commitment"].cases, res["payout_paise"],
                                          score, delta)
            await nudges.create(session, m, "delivery", hi, en, p.id, llm_ok=False)
            done += 1
        await session.commit()
    await session.refresh(p)
    out = await pools.serialize(session, p, None)
    out["delivered"] = done
    return out


@router.post("/reset")
async def reset(user: CurrentUser = Depends(ops_user), session: AsyncSession = Depends(get_session)):
    _demo_only()
    from ..chain import relayer

    relayer.reset_local_state()
    info = await seed.reset(session)
    return {"ok": True, "now": clock.iso(clock.now()), **info}

