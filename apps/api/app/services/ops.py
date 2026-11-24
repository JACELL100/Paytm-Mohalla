"""Paytm ops console: KPIs and the H3 heatmap."""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

import h3
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..models import Delivery, Forecast, Loan, Merchant, Pool, PoolCommitment, TrustScore


async def kpis(session: AsyncSession) -> dict:
    rows = (await session.execute(select(PoolCommitment, Pool).join(Pool, Pool.id == PoolCommitment.pool_id)
                                  .where(PoolCommitment.status != "refunded"))).all()
    gmv = sum(c.amount_paise for c, _ in rows)
    savings = sum(c.cases * (p.base_case_price_paise - p.case_price_paise) for c, p in rows)
    loans = (await session.execute(select(func.coalesce(func.sum(Loan.amount_paise), 0))
                                   .where(Loan.status.in_(("active", "repaid"))))).scalar_one()
    fees = (await session.execute(select(func.coalesce(func.sum(Delivery.fee_paise), 0))
                                  .where(Delivery.status == "delivered"))).scalar_one()
    counts = dict((await session.execute(select(Pool.status, func.count()).group_by(Pool.status))).all())
    merchants = (await session.execute(select(func.count()).select_from(Merchant))).scalar_one()
    avg_trust = (await session.execute(select(func.avg(TrustScore.score))
                                       .where(TrustScore.subject_type == "merchant"))).scalar_one()
    today = clock.today()
    days = [today - timedelta(days=i) for i in range(29, -1, -1)]
    by_day: dict = defaultdict(lambda: [0, 0])
    for c, p in rows:
        d = c.created_at.astimezone(clock.IST).date()
        by_day[d][0] += c.amount_paise
        by_day[d][1] += c.cases * (p.base_case_price_paise - p.case_price_paise)
    return {
        "pooled_gmv_paise": int(gmv), "merchant_savings_paise": int(savings), "loans_paise": int(loans),
        "fee_revenue_paise": int(fees), "active_pools": int(counts.get("open", 0)),
        "funded_pools": int(counts.get("funded", 0)), "merchants": int(merchants),
        "avg_trust": int(round(avg_trust)) if avg_trust else 0,
        "series": [{"day": d.isoformat(), "gmv_paise": int(by_day[d][0]), "savings_paise": int(by_day[d][1])}
                   for d in days],
    }


async def hexes(session: AsyncSession) -> list[dict]:
    today = clock.today()
    ms = (await session.execute(select(Merchant.id, Merchant.h3_r8))).all()
    uplift = defaultdict(float)
    for f in (await session.execute(select(Forecast.merchant_id, Forecast.uplift)
                                    .where(Forecast.window_start <= today, Forecast.window_end >= today))).all():
        uplift[f[0]] = max(uplift[f[0]], f[1])
    cells: dict[str, list] = defaultdict(list)
    for mid, cell in ms:
        cells[cell].append(uplift.get(mid, 1.0))
    pools = defaultdict(int)
    for cell, in (await session.execute(select(Pool.center_h3).where(Pool.status.in_(("open", "funded"))))).all():
        pools[cell] += 1
    raw = {c: (sum(v) / len(v)) * (1 + 0.04 * len(v)) for c, v in cells.items()}
    lo, hi = (min(raw.values()), max(raw.values())) if raw else (0, 1)
    out = []
    for c, v in sorted(cells.items()):
        lat, lng = h3.cell_to_latlng(c)
        out.append({"h3": c, "center": {"lat": round(lat, 6), "lng": round(lng, 6)},
                    "boundary": [[round(a, 6), round(b, 6)] for a, b in h3.cell_to_boundary(c)],
                    "demand_index": round((raw[c] - lo) / (hi - lo), 3) if hi > lo else 0.5,
                    "merchants": len(v), "active_pools": pools.get(c, 0)})
    return out
