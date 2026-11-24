from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.auth import CurrentUser, current_user, load_user
from ..core.db import get_session
from ..models import Distributor, Merchant, Profile
from ..services.seed import DEMO_DISTRIBUTOR_ID

router = APIRouter(tags=["profile"])


def merchant_dict(m: Merchant | None) -> dict | None:
    if m is None:
        return None
    return {"id": str(m.id), "name": m.name, "owner_name": m.owner_name, "category": m.category, "lat": m.lat,
            "lng": m.lng, "h3_r8": m.h3_r8, "lang": m.lang if m.lang in ("hi", "en") else "hi",
            "wallet_address": m.wallet_address}


def distributor_dict(d: Distributor | None) -> dict | None:
    if d is None:
        return None
    return {"id": str(d.id), "name": d.name, "wallet_address": d.wallet_address}


def me_dict(u: CurrentUser) -> dict:
    p = u.profile
    return {"profile": {"id": str(p.id), "role": p.role, "display_name": p.display_name, "lang": p.lang or "hi"},
            "merchant": merchant_dict(u.merchant), "distributor": distributor_dict(u.distributor)}


class OnboardingBody(BaseModel):
    role: Literal["merchant", "distributor", "ops"]
    merchant_id: str | None = None


class PatchMe(BaseModel):
    lang: Literal["hi", "en"]


@router.get("/me")
async def get_me(user: CurrentUser = Depends(current_user)):
    return me_dict(user)


@router.patch("/me")
async def patch_me(body: PatchMe, user: CurrentUser = Depends(current_user),
                   session: AsyncSession = Depends(get_session)):
    p = await session.get(Profile, user.profile.id)
    p.lang = body.lang
    if p.merchant_id:
        m = await session.get(Merchant, p.merchant_id)
        m.lang = body.lang
    await session.commit()
    return me_dict(await load_user(session, p))


async def _claimed(session: AsyncSession) -> set:
    return {r[0] for r in (await session.execute(select(Profile.merchant_id)
                                                 .where(Profile.merchant_id.is_not(None)))).all()}


@router.get("/onboarding/shops")
async def onboarding_shops(user: CurrentUser = Depends(current_user), session: AsyncSession = Depends(get_session)):
    claimed = await _claimed(session)
    ms = (await session.execute(select(Merchant).where(Merchant.is_demo.is_(False)).order_by(Merchant.shop_no)
                                .limit(80))).scalars().all()
    return [merchant_dict(m) for m in ms if m.id not in claimed][:20]


@router.post("/onboarding")
async def onboarding(body: OnboardingBody, user: CurrentUser = Depends(current_user),
                     session: AsyncSession = Depends(get_session)):
    p = await session.get(Profile, user.profile.id)
    p.role = body.role
    p.merchant_id = None if body.role != "merchant" else p.merchant_id
    p.distributor_id = None
    if body.role == "merchant":
        claimed = await _claimed(session) - {p.merchant_id}
        if body.merchant_id:
            try:
                m = await session.get(Merchant, uuid.UUID(body.merchant_id))
            except ValueError:
                m = None
            if not m:
                raise HTTPException(404, "Shop not found")
            if m.id in claimed or (m.is_demo and p.dev_token != "dev-merchant"):
                raise HTTPException(409, "This shop is already claimed")
        elif p.merchant_id:
            m = await session.get(Merchant, p.merchant_id)
        else:
            m = (await session.execute(select(Merchant).where(Merchant.is_demo.is_(False))
                                       .where(Merchant.id.not_in(claimed) if claimed else True)
                                       .order_by(Merchant.shop_no))).scalars().first()
            if not m:
                raise HTTPException(409, "No unclaimed shops left")
        p.merchant_id = m.id
    elif body.role == "distributor":
        p.distributor_id = DEMO_DISTRIBUTOR_ID
    await session.commit()
    return me_dict(await load_user(session, p))
