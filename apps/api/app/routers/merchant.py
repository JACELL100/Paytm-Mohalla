from __future__ import annotations

import secrets
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..chain.config import easscan_url
from ..chain.outbox import tx_ref
from ..core import clock
from ..core.auth import CurrentUser, current_user, merchant_user
from ..core.config import settings
from ..core.db import get_session
from ..models import ChainTx, Nudge, Pool, PoolCommitment, PoolInvite
from ..services import actions, cache, credit, forecasts, nudges, pools, qr, trust, voice
from ..services.common import haversine_km, trust_band
from .me import merchant_dict

router = APIRouter(tags=["merchant"])


class CommitBody(BaseModel):
    cases: int = Field(ge=1, le=500)
    use_credit: bool = False


class DeliveryConfirmBody(BaseModel):
    qr_payload: str


@router.get("/m/home")
async def home(user: CurrentUser = Depends(merchant_user), session: AsyncSession = Depends(get_session)):
    """6 statements when warm: auth, pools (+ viewer joins), members, nudges, forecasts, stock."""
    m = user.merchant
    views = await pools.merchant_views(session, m)
    invites, active, savings = pools.split_merchant_views(views)
    ns = (await session.execute(select(Nudge).where(Nudge.merchant_id == m.id)
                                .order_by(Nudge.created_at.desc()).limit(10))).scalars().all()
    score = await trust.stored_score(session, m)
    fc = await forecasts.forecast_summaries(session, m, top=3, invited_sku_ids=[v.pool.sku_id for v in invites])
    return {
        "merchant": merchant_dict(m),
        "nudges": [nudges.nudge_dict(n, settings.public_api_url) for n in ns],
        "forecasts": fc,
        "invites": await pools.serialize_many(session, invites, viewer=True),
        "active_pools": await pools.serialize_many(session, active, viewer=True),
        "savings": savings,
        "trust": {"score": score, "band": trust_band(score)},
        "wallet": {"balance_paise": int(m.wallet_balance_paise)},
    }


@router.post("/m/nudges/{nudge_id}/heard")
async def nudge_heard(nudge_id: str, user: CurrentUser = Depends(merchant_user),
                      session: AsyncSession = Depends(get_session)):
    try:
        n = await session.get(Nudge, uuid.UUID(nudge_id))
    except ValueError:
        n = None
    if not n or n.merchant_id != user.merchant.id:
        raise HTTPException(404, "Nudge not found")
    if not n.heard_at:
        n.heard_at = clock.now()
        await session.commit()
    return {"ok": True}


@router.get("/forecasts/{category}")
async def forecast(category: str, user: CurrentUser = Depends(merchant_user),
                   session: AsyncSession = Depends(get_session)):
    out = await forecasts.forecast_detail(session, user.merchant, category)
    if out is None:
        raise HTTPException(404, f"No forecast for category '{category}' in this shop")
    return out


@router.get("/pools")
async def list_pools(scope: Literal["near", "mine", "all"] = Query("near"), user: CurrentUser = Depends(current_user),
                     session: AsyncSession = Depends(get_session)):
    m = user.merchant if user.role == "merchant" else None
    where = Pool.status != "draft"
    if scope == "near":
        where = Pool.status.in_(("open", "funded"))
    if m is not None and scope == "mine":
        where = and_(where, or_(Pool.id.in_(select(PoolInvite.pool_id).where(PoolInvite.merchant_id == m.id)),
                                Pool.id.in_(select(PoolCommitment.pool_id).where(PoolCommitment.merchant_id == m.id))))
    elif m is None and scope == "mine" and user.role == "distributor" and user.distributor:
        where = and_(where, Pool.distributor_id == user.distributor.id)
    views = await pools.fresh_views(session, where, m.id if m else None)
    if m is not None:
        if scope == "near":
            views = [v for v in views if haversine_km(m.lat, m.lng, v.pool.center_lat, v.pool.center_lng) <= 3.5]
        if scope != "mine":
            views = [v for v in views if v.visible_to_viewer()]
    order = {"open": 0, "funded": 1, "settled": 2, "failed": 3, "draft": 4}
    views = sorted(views, key=lambda v: (order.get(v.pool.status, 9), v.pool.deadline.timestamp()
                                         if v.pool.status == "open" else -v.pool.created_at.timestamp()))[:60]
    return await pools.serialize_many(session, views, viewer=m is not None)


@router.get("/pools/{pool_id}")
async def get_pool(pool_id: str, user: CurrentUser = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """3 statements: auth, pool (+ viewer joins), members."""
    m = user.merchant if user.role == "merchant" else None
    v = await pools.get_view(session, pool_id, m.id if m else None)
    if m is not None and not v.visible_to_viewer():
        raise HTTPException(404, "Pool not found")
    return (await pools.serialize_many(session, [v], viewer=m is not None))[0]


@router.post("/pools/{pool_id}/commit")
async def commit(pool_id: str, body: CommitBody, user: CurrentUser = Depends(merchant_user),
                 session: AsyncSession = Depends(get_session)):
    a, _notes = await actions.propose_commit(session, user.merchant, pool_id, body.cases, body.use_credit, clamp=False)
    await session.commit()
    return actions.action_dict(a)


@router.get("/credit/offer")
async def credit_offer(amount_paise: int = Query(..., ge=0), user: CurrentUser = Depends(merchant_user),
                       session: AsyncSession = Depends(get_session)):
    return credit.public(await credit.offer(session, user.merchant, amount_paise))


@router.post("/actions/{action_id}/confirm")
async def confirm_action(action_id: str, user: CurrentUser = Depends(merchant_user),
                         session: AsyncSession = Depends(get_session)):
    return await actions.confirm(session, user.merchant, action_id)


@router.post("/actions/{action_id}/cancel")
async def cancel_action(action_id: str, user: CurrentUser = Depends(merchant_user),
                        session: AsyncSession = Depends(get_session)):
    await actions.cancel(session, user.merchant, action_id)
    return {"ok": True}


@router.post("/voice/turn")
async def voice_turn(audio: UploadFile | None = File(default=None), text: str | None = Form(default=None),
                     lang: str | None = Form(default=None), user: CurrentUser = Depends(merchant_user),
                     session: AsyncSession = Depends(get_session)):
    data = await audio.read() if audio is not None else None
    return await voice.turn(session, user.merchant, text, data or None, audio.filename if audio else None,
                            audio.content_type if audio else None, lang)


@router.get("/m/deliveries")
async def my_deliveries(user: CurrentUser = Depends(merchant_user), session: AsyncSession = Depends(get_session)):
    m = user.merchant
    views = await pools.fresh_views(
        session, and_(Pool.status.in_(("funded", "settled", "failed")),
                      Pool.id.in_(select(PoolCommitment.pool_id).where(PoolCommitment.merchant_id == m.id))), m.id)
    views.sort(key=lambda v: v.pool.deadline, reverse=True)
    out = []
    for v, d in zip(views, await pools.serialize_many(session, views, viewer=True)):
        c = v.mine
        status = "refunded" if c.status == "refunded" else (v.delivery.status if v.delivery else "pending")
        out.append({"pool": d, "cases": c.cases, "amount_paise": c.amount_paise, "status": status})
    return out


@router.post("/m/deliveries/confirm")
async def confirm_delivery(body: DeliveryConfirmBody, user: CurrentUser = Depends(merchant_user),
                           session: AsyncSession = Depends(get_session)):
    m = user.merchant
    data = qr.verify(body.qr_payload)
    if data["m"] != str(m.id):
        raise HTTPException(403, "This QR is for a different shop")
    async with pools.POOL_LOCK:
        views = await pools.load_views(session, Pool.id == pools._uuid(data["p"]), m.id, for_update=True,
                                       refresh=True)
        if not views:
            raise HTTPException(404, "Pool not found")
        v = views[0]
        p, d = v.pool, v.delivery
        if not d:
            raise HTTPException(404, "No delivery for this shop in this pool")
        if d.status == "pending" and d.qr_nonce != data["n"]:
            raise HTTPException(409, "This QR was already used. Ask for a fresh one.")
        res = await pools.confirm_delivery(session, p, m, members=v.members)
        res["delivery"].qr_nonce = secrets.token_hex(8)  # single use
        score, delta = await trust.refresh(session, m)
        st = await cache.static(session)
        sku = st.skus[p.sku_id]
        hi, en = nudges.delivery_text(m, sku.name, sku.name_hi, res["commitment"].cases, res["payout_paise"], score,
                                      delta)
        await nudges.create(session, m, "delivery", hi, en, p.id, llm_ok=False)
        await session.commit()
    return {"pool": pools.serialize_view(v, st, viewer=True), "tx": tx_ref(res["tx"]),
            "payout_paise": res["payout_paise"], "fee_paise": res["fee_paise"],
            "attestation_url": easscan_url(res["delivery"].attestation_uid),
            "trust": {"score": score, "delta": delta}}


@router.get("/trust/me")
async def trust_me(user: CurrentUser = Depends(merchant_user), session: AsyncSession = Depends(get_session)):
    return await trust.compute(session, user.merchant)


@router.get("/txs/{tx_id}")
async def get_tx(tx_id: str, user: CurrentUser = Depends(current_user), session: AsyncSession = Depends(get_session)):
    try:
        tx = await session.get(ChainTx, int(tx_id))
    except ValueError:
        tx = None
    if not tx:
        raise HTTPException(404, "Transaction not found")
    if settings.chain_mode == "off" and tx.status == "pending":
        from ..chain.relayer import simulate_due

        if await simulate_due(session, only_id=tx.id):
            await session.refresh(tx)
    return tx_ref(tx)


