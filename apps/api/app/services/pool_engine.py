"""Pool engine (plan 8.2): find nearby shops that need the same item and open a pool at a slab.

for scheme in active_schemes:
    shops = merchants in the distributor's H3 coverage whose mix includes the SKU's category
    need_cases(m) = floor((p50 x sku_share / unit_price + 0.5 x (p90 - p50) ... - stock) / case_size), keep >= 1
    clusters = shops grouped by H3 res-7 parent
    expected = sum(need_cases) x JOIN_RATE
    slab = highest slab with min_cases <= expected
    if slab and >= 5 shops (privacy rule): create pool, invite each shop with a reason payload + nudge
"""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..core.config import settings
from ..models import CategoryMix, Distributor, Forecast, Inventory, Merchant, Pool, PoolInvite, Scheme, Sku
from . import forecasts, nudges, pools
from .forecasts import sku_ml
from ml import forecast_simple as fs  # noqa: E402

JOIN_RATE = 0.6
MIN_SHOPS = 5
MIN_SHARE = 0.03
MAX_NEW_POOLS = 4  # per run, best candidates first (keeps the demo readable)


async def run(session: AsyncSession) -> list[Pool]:
    today, now = clock.today(), clock.now()
    schemes = (await session.execute(select(Scheme).where(Scheme.valid_from <= today, Scheme.valid_to >= today))).scalars().all()
    if not schemes:
        return []
    merchants = (await session.execute(select(Merchant))).scalars().all()
    mixes: dict = defaultdict(dict)
    for r in (await session.execute(select(CategoryMix))).scalars():
        mixes[r.merchant_id][r.category] = r.share
    fc_rows = (await session.execute(select(Forecast).where(Forecast.window_start <= today,
                                                            Forecast.window_end >= today))).scalars().all()
    fc: dict = {}
    for f in sorted(fc_rows, key=lambda x: x.window_start):
        fc[(f.merchant_id, f.category)] = f
    busy = {(p.sku_id, p.cluster_h3) for p in
            (await session.execute(select(Pool).where(Pool.status.in_(("open", "funded"))))).scalars()}

    created: list[Pool] = []
    candidates: list[tuple] = []
    for sch in schemes:
        sku = await session.get(Sku, sch.sku_id)
        dist = await session.get(Distributor, sch.distributor_id)
        cover = set(dist.coverage_h3 or [])
        stock = {r.merchant_id: r.qty_units for r in
                 (await session.execute(select(Inventory).where(Inventory.sku_id == sku.id))).scalars()}
        clusters: dict[str, list[tuple[Merchant, dict]]] = defaultdict(list)
        for m in merchants:
            if m.h3_r7 not in cover or mixes[m.id].get(sku.category, 0) < MIN_SHARE:
                continue
            f = fc.get((m.id, sku.category))
            if f is None:  # e.g. after time travel: compute this week's forecast now
                for row in await forecasts.current_forecasts(session, m.id, today):
                    fc[(m.id, row.category)] = row
                f = fc.get((m.id, sku.category))
                if f is None:
                    continue
            st = stock.get(m.id, 0)
            n = fs.need_cases({"p50": f.p50, "p90": f.p90}, sku_ml(sku), st)
            if n["need_cases"] >= 1:
                clusters[m.h3_r7].append((m, {"need_cases": n["need_cases"], "stock_units": st,
                                               "uplift": round(f.uplift, 2), "event": (f.reason or {}).get("event") or "",
                                               "event_hi": (f.reason or {}).get("event_hi")}))
        for cell, members in clusters.items():
            if (sku.id, cell) in busy or len(members) < MIN_SHOPS:
                continue
            expected = sum(x["need_cases"] for _, x in members) * JOIN_RATE
            slabs = sorted(sch.slabs, key=lambda s: s["min_cases"])
            slab = None
            for s in slabs:
                if s["min_cases"] <= expected:
                    slab = s
            if not slab:
                continue
            has_demo = any(m.is_demo for m, _ in members)
            score = expected / slab["min_cases"] + len(members) / 50 + (1.0 if has_demo else 0.0)
            candidates.append((score, sch, sku, dist, cell, members, slabs, slab))

    candidates.sort(key=lambda c: -c[0])
    for _score, sch, sku, dist, cell, members, slabs, slab in candidates:
        if len(created) >= MAX_NEW_POOLS:
            break
        if (sku.id, cell) in busy:
            continue
        lat = sum(m.lat for m, _ in members) / len(members)
        lng = sum(m.lng for m, _ in members) / len(members)
        area = max({m.area_name for m, _ in members}, key=lambda a: sum(1 for mm, _ in members if mm.area_name == a))
        p = await pools.create_pool(
            session, sku=sku, distributor=dist, scheme=sch, target=int(slab["min_cases"]),
            disc_bps=int(slab["disc_bps"]), slabs=slabs, center_lat=lat, center_lng=lng, area_name=area,
            cluster_h3=cell, deadline=now + timedelta(minutes=settings.engine_pool_deadline_minutes),
            delivery_deadline=now + timedelta(days=2))
        busy.add((sku.id, cell))
        for m, x in members:
            suggested = max(1, min(x["need_cases"], p.target_cases // 3 or 1))
            reason = {"event": x["event"], "uplift": x["uplift"], "stock_units": x["stock_units"],
                      "need_cases": x["need_cases"]}
            session.add(PoolInvite(pool_id=p.id, merchant_id=m.id, suggested_cases=suggested, reason=reason,
                                   status="invited", created_at=now))
            hi, en = nudges.invite_text(m, category=sku.category, sku_name=sku.name, sku_name_hi=sku.name_hi,
                                        event=x["event"] or None, event_hi=x["event_hi"], uplift=x["uplift"],
                                        stock_cases=x["stock_units"] // sku.case_size,
                                        need_cases=x["need_cases"], shops=len(members), target=p.target_cases,
                                        disc_bps=p.disc_bps)
            await nudges.create(session, m, "pool_invite", hi, en, p.id,
                                facts={"item": sku.name, **reason, "shops": len(members),
                                       "target_cases": p.target_cases, "discount_pct": p.disc_bps / 100})
        created.append(p)
    await session.commit()
    return created
