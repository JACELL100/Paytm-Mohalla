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


async def refresh(session: AsyncSession, merchant: Merchant) -> tuple[int, int]:
    """Recompute and store; returns (new_score, delta vs the stored score)."""
    t = await compute(session, merchant)
    row = await session.get(TrustScore, merchant.wallet_address)
    old = row.score if row else t["score"]
    if row is None:
        row = TrustScore(subject_address=merchant.wallet_address, subject_type="merchant", merchant_id=merchant.id,
                         score=t["score"], components=t["components"], updated_at=clock.now())
        session.add(row)
    else:
        row.score, row.components, row.updated_at = t["score"], t["components"], clock.now()
    return t["score"], t["score"] - old


async def stored_score(session: AsyncSession, merchant: Merchant) -> int:
    row = await session.get(TrustScore, merchant.wallet_address)
    if row:
        return row.score
    score, _ = await refresh(session, merchant)
    await session.commit()
    return score
