"""Paytm ops console: KPIs and the H3 heatmap."""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

import h3
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..models import Delivery, Forecast, Loan, Pool, PoolCommitment, TrustScore
from . import cache


async def kpis(session: AsyncSession) -> dict:
    """2 statements (commitment rows for GMV/savings/series + one row of scalar aggregates); cached until
    the next write (cache.version) or day change."""
    key = (cache.version(), clock.today())
    hit = cache.memo_get("kpis", key)
    if hit is not None:
        return hit
    st = await cache.static(session)
    rows = (await session.execute(
        select(PoolCommitment.amount_paise, PoolCommitment.cases, PoolCommitment.created_at,
               Pool.base_case_price_paise - Pool.case_price_paise)
        .join(Pool, Pool.id == PoolCommitment.pool_id).where(PoolCommitment.status != "refunded"))).all()
    agg = (await session.execute(select(
        select(func.coalesce(func.sum(Loan.amount_paise), 0)).where(Loan.status.in_(("active", "repaid")))
        .scalar_subquery(),
        select(func.coalesce(func.sum(Delivery.fee_paise), 0)).where(Delivery.status == "delivered").scalar_subquery(),
        select(func.avg(TrustScore.score)).where(TrustScore.subject_type == "merchant").scalar_subquery(),
        select(func.count()).select_from(Pool).where(Pool.status == "open").scalar_subquery(),
        select(func.count()).select_from(Pool).where(Pool.status == "funded").scalar_subquery(),
    ))).one()
    loans, fees, avg_trust, n_open, n_funded = agg
    gmv = sum(r[0] for r in rows)
    savings = sum(r[1] * r[3] for r in rows)
    today = clock.today()
    days = [today - timedelta(days=i) for i in range(29, -1, -1)]
    by_day: dict = defaultdict(lambda: [0, 0])
    for amount, cases, created, per_case in rows:
        d = created.astimezone(clock.IST).date()
        by_day[d][0] += amount
        by_day[d][1] += cases * per_case
    out = {
        "pooled_gmv_paise": int(gmv), "merchant_savings_paise": int(savings), "loans_paise": int(loans or 0),
        "fee_revenue_paise": int(fees or 0), "active_pools": int(n_open or 0),
        "funded_pools": int(n_funded or 0), "merchants": len(st.merchants),
        "avg_trust": int(round(avg_trust)) if avg_trust else 0,
        "series": [{"day": d.isoformat(), "gmv_paise": int(by_day[d][0]), "savings_paise": int(by_day[d][1])}
                   for d in days],
    }
    cache.memo_set("kpis", key, out)
    return out


async def hexes(session: AsyncSession) -> list[dict]:
    """2 statements (forecast uplift, live pools); cached until the next write or day change."""
    today = clock.today()
    key = (cache.version(), today)
    hit = cache.memo_get("hexes", key)
    if hit is not None:
        return hit
    st = await cache.static(session)
    uplift = defaultdict(float)
    for f in (await session.execute(select(Forecast.merchant_id, Forecast.uplift)
                                    .where(Forecast.window_start <= today, Forecast.window_end >= today))).all():
        uplift[f[0]] = max(uplift[f[0]], f[1])
    cells: dict[str, list] = defaultdict(list)
    for m in st.merchants.values():
        cells[m.h3_r8].append(uplift.get(m.id, 1.0))
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
    cache.memo_set("hexes", key, out)
    return out
