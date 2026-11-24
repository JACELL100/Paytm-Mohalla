"""Trade Trust Score (rule-based, explainable).

merchant score (300-900) = 300 + 600 x (0.5 x honoured_commit_rate
                                       + 0.2 x min(1, pools_joined / 10)
                                       + 0.2 x sales_stability
                                       + 0.1 x min(1, months_on_paytm / 24))
sales_stability = clamp(1 - CV(daily sales, last 90 days) / 0.35, 0, 1)

In CHAIN_MODE=sepolia every delivery is also attested on EAS so anyone can recompute it;
otherwise it is computed from the DB (which mirrors the Delivered/Refunded events).
"""

from __future__ import annotations

from datetime import date

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..chain.config import easscan_url
from ..core import clock
from ..models import Delivery, Merchant, Pool, PoolCommitment, TrustScore
from .common import trust_band

CV_SCALE = 0.35
NEW_MERCHANT_HONOURED_PRIOR = 0.7


def stability_from_sales(values) -> float:
    v = np.asarray(values, dtype=float)
    v = v[v > 0][-90:]
    if len(v) < 14:
        return 0.5
    cv = float(v.std() / v.mean())
    return float(np.clip(1 - cv / CV_SCALE, 0, 1))


def months_between(a: date, b: date) -> float:
    return max(0.0, (b - a).days / 30.44)


def score_formula(honoured: float, pools_joined: int, stability: float, tenure_months: float) -> int:
    x = 0.5 * honoured + 0.2 * min(1.0, pools_joined / 10) + 0.2 * stability + 0.1 * min(1.0, tenure_months / 24)
    return int(round(300 + 600 * x))


async def _history(session: AsyncSession, merchant: Merchant):
    rows = (await session.execute(
        select(PoolCommitment, Pool, Delivery)
        .join(Pool, Pool.id == PoolCommitment.pool_id)
        .outerjoin(Delivery, (Delivery.pool_id == PoolCommitment.pool_id) & (Delivery.merchant_id == merchant.id))
        .where(PoolCommitment.merchant_id == merchant.id))).all()
    return rows


async def compute(session: AsyncSession, merchant: Merchant) -> dict:
    now = clock.now()
    rows = await _history(session, merchant)
    delivered = [(c, p, d) for c, p, d in rows if c.status == "delivered"]
    defaulted = [(c, p, d) for c, p, d in rows if c.status == "committed" and p.status in ("funded", "settled")
                 and p.delivery_deadline < now]
    n_del = len(delivered)
    honoured = n_del / (n_del + len(defaulted)) if (n_del + len(defaulted)) else NEW_MERCHANT_HONOURED_PRIOR
    tenure = months_between(merchant.onboarded_on, clock.today())
    stability = merchant.sales_stability
    score = score_formula(honoured, n_del, stability, tenure)

    # history: score after each delivered pool, oldest first
    hist = []
    delivered_sorted = sorted(delivered, key=lambda t: (t[2].confirmed_at if t[2] and t[2].confirmed_at else now))
    for i, (_c, _p, d) in enumerate(delivered_sorted, start=1):
        at = d.confirmed_at if d and d.confirmed_at else now
        hist.append({"date": at.astimezone(clock.IST).date().isoformat(),
                     "score": score_formula(1.0 if not defaulted else honoured, i, stability,
                                            months_between(merchant.onboarded_on, at.date()))})
    if not hist or hist[-1]["score"] != score:
        hist.append({"date": clock.today().isoformat(), "score": score})

    attestations = []
    for c, p, d in delivered_sorted:
        if d:
            attestations.append({"kind": "delivery", "pool_id": str(p.id), "url": easscan_url(d.attestation_uid),
                                 "created_at": clock.iso(d.confirmed_at)})
    return {
        "score": score, "band": trust_band(score),
        "components": {"honoured_rate": round(honoured, 3), "pools_joined": n_del,
                       "sales_stability": round(stability, 3), "tenure_months": round(tenure, 1)},
        "history": hist, "attestations": list(reversed(attestations)),
    }


_scores: dict = {}  # merchant id -> stored score (in-process mirror of trust_scores)


def clear_cache() -> None:
    _scores.clear()


def _score_from(rows, merchant, now) -> tuple[int, dict]:
    """rows: [(commitment_status, pool_status, pool_delivery_deadline)] for one merchant."""
    n_del = sum(1 for cs, _ps, _dl in rows if cs == "delivered")
    n_def = sum(1 for cs, ps, dl in rows if cs == "committed" and ps in ("funded", "settled") and dl < now)
    honoured = n_del / (n_del + n_def) if (n_del + n_def) else NEW_MERCHANT_HONOURED_PRIOR
    tenure = months_between(merchant.onboarded_on, clock.today())
    comps = {"honoured_rate": round(honoured, 3), "pools_joined": n_del,
             "sales_stability": round(merchant.sales_stability, 3), "tenure_months": round(tenure, 1)}
    return score_formula(honoured, n_del, merchant.sales_stability, tenure), comps


async def refresh_many(session: AsyncSession, merchants) -> dict:
    """Recompute + store scores for many shops in 3 statements. Returns {merchant_id: (score, delta)}.
    `merchants`: ORM Merchant or cache.MerchantInfo objects."""
    from sqlalchemy import bindparam, update

    ms = {m.id: m for m in merchants}
    if not ms:
        return {}
    now = clock.now()
    hist: dict = {mid: [] for mid in ms}
    for mid, cs, ps, dl in (await session.execute(
            select(PoolCommitment.merchant_id, PoolCommitment.status, Pool.status, Pool.delivery_deadline)
            .join(Pool, Pool.id == PoolCommitment.pool_id)
            .where(PoolCommitment.merchant_id.in_(list(ms))))).all():
        hist[mid].append((cs, ps, dl))
    old = {mid: sc for mid, sc in (await session.execute(
        select(TrustScore.merchant_id, TrustScore.score).where(TrustScore.merchant_id.in_(list(ms))))).all()}
    out, upd, new = {}, [], []
    for mid, m in ms.items():
        score, comps = _score_from(hist[mid], m, now)
        prev = old.get(mid, score)
        out[mid] = (score, score - prev)
        _scores[mid] = score
        if mid in old:
            upd.append({"b_addr": m.wallet_address, "score": score, "components": comps, "updated_at": now})
        else:
            new.append(TrustScore(subject_address=m.wallet_address, subject_type="merchant", merchant_id=mid,
                                  score=score, components=comps, updated_at=now))
    if upd:
        t = TrustScore.__table__
        await session.execute(update(t).where(t.c.subject_address == bindparam("b_addr"))
                              .values(score=bindparam("score"), components=bindparam("components"),
                                      updated_at=bindparam("updated_at")), upd)
    session.add_all(new)
    from . import cache

    cache.bump()
    return out


async def refresh(session: AsyncSession, merchant: Merchant) -> tuple[int, int]:
    """Recompute and store; returns (new_score, delta vs the stored score)."""
    return (await refresh_many(session, [merchant]))[merchant.id]


async def stored_score(session: AsyncSession, merchant: Merchant) -> int:
    if merchant.id in _scores:
        return _scores[merchant.id]
    row = (await session.execute(select(TrustScore.score).where(TrustScore.merchant_id == merchant.id))).first()
    if row:
        _scores[merchant.id] = row[0]
        return row[0]
    score, _ = await refresh(session, merchant)
    await session.commit()
    return score
