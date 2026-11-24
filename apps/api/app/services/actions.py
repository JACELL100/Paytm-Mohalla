"""Pending actions: money never moves until the merchant confirms.

Guardrails: cases <= 2 x forecast need, cases <= cases left in the pool, credit <= offer limit,
actions expire after 5 minutes (demo clock), identical open proposals are reused (idempotency).
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..chain.outbox import tx_ref
from ..models import Merchant, PendingAction, Pool, PoolInvite
from . import cache, credit, forecasts, nudges, pools
from .common import fmt_inr

ACTION_TTL = timedelta(minutes=5)


class GuardrailError(HTTPException):
    def __init__(self, msg: str, code: int = 400, cap: int | None = None):
        super().__init__(code, msg)
        self.cap = cap


async def need_cap(session: AsyncSession, pool: Pool, m: Merchant, inv: PoolInvite | None = None,
                   have_invite: bool = False) -> tuple[int, int]:
    """(need_cases, max cases allowed by the 2x-need guardrail)."""
    if not have_invite:
        inv = await session.get(PoolInvite, (pool.id, m.id))
    if inv and inv.reason and inv.reason.get("need_cases") is not None:
        need = int(inv.reason["need_cases"])
    else:
        sku = (await cache.static(session)).skus[pool.sku_id]
        need = int((await forecasts.need_for_sku(session, m.id, sku))["need_cases"])
    suggested = inv.suggested_cases if inv else 0
    return need, max(2 * need, suggested, 2)


def action_dict(a: PendingAction) -> dict:
    p = a.payload
    return {"id": str(a.id), "kind": a.kind, "summary_hi": a.summary_hi, "summary_en": a.summary_en,
            "payload": {"pool_id": p["pool_id"], "cases": p["cases"], "amount_paise": p["amount_paise"],
                        "use_credit": p["use_credit"], "credit": p.get("credit"), "savings_paise": p["savings_paise"]},
            "expires_at": clock.iso(a.expires_at)}


async def open_actions(session: AsyncSession, m: Merchant) -> list[PendingAction]:
    now = clock.now()
    rows = (await session.execute(select(PendingAction).where(PendingAction.merchant_id == m.id,
                                                              PendingAction.status == "pending")
                                  .order_by(PendingAction.created_at.desc()))).scalars().all()
    live = []
    for a in rows:
        if a.expires_at < now:
            a.status = "expired"
        else:
            live.append(a)
    return live


async def propose_commit(session: AsyncSession, m: Merchant, pool: Pool | str | uuid.UUID, cases: int, use_credit: bool,
                         clamp: bool = False) -> tuple[PendingAction, list[str]]:
    """Create (or reuse) a PendingAction. With clamp=True (voice) over-large requests are reduced and
    the notes say why; otherwise they are rejected with HTTP 400."""
    notes: list[str] = []
    v = await pools.get_view(session, pool.id if isinstance(pool, Pool) else pool, m.id)
    pool = v.pool
    if pool.status != "open":
        raise GuardrailError(f"This pool is {pool.status}; it can't take new orders", 409)
    if v.mine is not None:
        raise GuardrailError("You have already joined this pool", 409)
    if cases < 1:
        raise GuardrailError("Choose at least 1 case")
    remaining = pool.target_cases - pool.committed_cases
    need, cap = await need_cap(session, pool, m, v.invite, have_invite=True)
    if cases > remaining:
        if not clamp:
            raise GuardrailError(f"Only {remaining} cases are left in this pool", cap=remaining)
        notes.append(f"only_{remaining}_left")
        cases = remaining
    if cases > cap:
        if not clamp:
            raise GuardrailError(f"That's more than twice what you need ({need} cases). Max {cap} cases.", cap=cap)
        notes.append(f"capped_{cap}")
        cases = cap

    amount = cases * pool.case_price_paise
    savings = cases * (pool.base_case_price_paise - pool.case_price_paise)
    offer = None
    if not use_credit and m.wallet_balance_paise < amount:
        use_credit = True
        notes.append("auto_credit")
    if use_credit:
        offer = await credit.offer(session, m, amount)
        if not offer["eligible"]:
            if m.wallet_balance_paise >= amount:
                use_credit, offer = False, None
                notes.append("credit_not_needed")
            else:
                raise GuardrailError(f"Wallet has {fmt_inr(m.wallet_balance_paise)}, order needs {fmt_inr(amount)}, "
                                     f"and Pool Credit isn't available: {offer['reason_en']}")

    payload = {"pool_id": str(pool.id), "cases": cases, "amount_paise": amount, "use_credit": use_credit,
               "credit": credit.public(offer), "savings_paise": savings,
               "_decision": offer.get("_decision") if offer else None}
    key = f"commit:{pool.id}:{cases}:{int(use_credit)}"
    for a in await open_actions(session, m):
        if a.payload.get("pool_id") == str(pool.id):
            if a.idempotency_key == key:
                return a, notes
            a.status = "cancelled"  # superseded by the new proposal

    sku = (await cache.static(session)).skus[pool.sku_id]
    summary_hi = f"{cases} केस {sku.name_hi}, कुल {fmt_inr(amount)} ({fmt_inr(savings)} की बचत)।"
    summary_en = f"{cases} cases of {sku.name}, total {fmt_inr(amount)} (you save {fmt_inr(savings)})."
    if use_credit and offer:
        summary_hi += f" पूल क्रेडिट: {offer['rate_bps'] / 100:.1f}% सालाना, {offer['tenure_days']} दिन, रोज़ के सेटलमेंट से।"
        summary_en += (f" Pool Credit at {offer['rate_bps'] / 100:.1f}% a year for {offer['tenure_days']} days, "
                       f"repaid from daily settlements.")
    a = PendingAction(merchant_id=m.id, kind="commit", payload=payload, summary_hi=summary_hi, summary_en=summary_en,
                      idempotency_key=key, expires_at=clock.now() + ACTION_TTL, status="pending",
                      created_at=clock.now())
    session.add(a)
    await session.flush()
    return a, notes


async def get_action(session: AsyncSession, m: Merchant, action_id: str) -> PendingAction:
    try:
        aid = uuid.UUID(action_id)
    except ValueError as e:
        raise HTTPException(404, "Action not found") from e
    a = await session.get(PendingAction, aid)
    if not a or a.merchant_id != m.id:
        raise HTTPException(404, "Action not found")
    return a


async def confirm(session: AsyncSession, m: Merchant, action_id: str) -> dict:
    """Runs a pending commit: Pool Credit loan (if any) + commitment + outbox tx, in ~11 statements."""
    a = await get_action(session, m, action_id)
    if a.status == "confirmed":
        raise HTTPException(409, "Already confirmed")
    if a.status != "pending":
        raise HTTPException(409, f"This action was {a.status}")
    if a.expires_at < clock.now():
        a.status = "expired"
        await session.commit()
        raise HTTPException(410, "This action expired (5 minutes). Please ask again.")
    p = a.payload
    async with pools.POOL_LOCK:
        views = await pools.load_views(session, Pool.id == uuid.UUID(p["pool_id"]), m.id, for_update=True,
                                       refresh=True)
        if not views:
            raise HTTPException(404, "Pool not found")
        v = views[0]
        pool = v.pool
        if pool.status == "open" and pool.deadline < clock.now():
            await pools.fail_pool(session, pool, v.members)
            await session.commit()
        if pool.status != "open":
            raise HTTPException(409, f"Pool is {pool.status}")
        if v.mine is not None:
            raise HTTPException(409, "You have already joined this pool")
        if pool.target_cases - pool.committed_cases < p["cases"]:
            raise HTTPException(409, f"Only {pool.target_cases - pool.committed_cases} cases left now; please retry")
        loan = None
        if p["use_credit"]:
            offer = dict(p["credit"] or {})
            if not offer.get("eligible") or offer.get("amount_paise", 0) > offer.get("limit_paise", 0):
                raise HTTPException(400, "Pool Credit is not available for this amount")
            offer["_decision"] = p.get("_decision") or {}
            loan = credit.make_loan(m, offer, pool.id)
            session.add(loan)  # inserted with the outbox row in commit_many's flush
        elif m.wallet_balance_paise < p["amount_paise"]:
            raise HTTPException(400, "Not enough wallet balance. Turn on Pool Credit.")
        (c, tx), = await pools.commit_many(session, pool, [pools.Join(m, p["cases"], loan)], v.members)
        a.status = "confirmed"
        if loan:
            hi, en = nudges.credit_text(m, loan.amount_paise, loan.rate_bps)
            await nudges.create(session, m, "credit", hi, en, pool.id, llm_ok=False)
        await session.commit()
    v.mine, v.commit_tx, v.loan = c, tx, loan
    st = await cache.static(session)
    return {"pool": pools.serialize_view(v, st, viewer=True), "tx": tx_ref(tx), "loan": credit.loan_dict(loan)}


async def cancel(session: AsyncSession, m: Merchant, action_id: str) -> None:
    a = await get_action(session, m, action_id)
    if a.status == "pending":
        a.status = "cancelled"
        await session.commit()
