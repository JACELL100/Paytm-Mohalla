"""Load the synthetic world into the DB and build the seeded demo state (docs/API_CONTRACT.md).

seed_all():     static tables (shops, sales, catalogue, forecasts...) + dynamic demo state. ~10-30 s on SQLite.
seed_dynamic(): only pools / invites / commitments / deliveries / loans / nudges / txs / trust. Used by
                POST /demo/reset (< 3 s).
"""

from __future__ import annotations

import logging
import random
import secrets
import time
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..chain import wallets
from ..core import clock
from ..core.config import settings
from ..models import (
    CategoryMix,
    ChainTx,
    DailySale,
    Delivery,
    Distributor,
    Forecast,
    Inventory,
    Invoice,
    Loan,
    Merchant,
    Nudge,
    PendingAction,
    Pool,
    PoolCommitment,
    PoolInvite,
    Profile,
    Scheme,
    Sku,
    Transaction,
    TrustScore,
)
from . import forecasts, nudges, pools, trust
from .common import fee_of
from ml import forecast_simple as fs  # noqa: E402
from ml.generate_synthetic import generate  # noqa: E402

log = logging.getLogger("mohalla.seed")
NS = uuid.UUID("6d6f6861-6c6c-6100-8000-000000000000")  # "mohalla"


def sid(kind: str, key) -> uuid.UUID:
    return uuid.uuid5(NS, f"{kind}:{key}")


DEV_PROFILES = [
    {"token": "dev-merchant", "role": "merchant", "display_name": "Ramesh Gupta"},
    {"token": "dev-distributor", "role": "distributor", "display_name": "Shree Ganesh Distributors"},
    {"token": "dev-ops", "role": "ops", "display_name": "Paytm Ops"},
]
DEMO_MERCHANT_ID = sid("merchant", 1)
DEMO_DISTRIBUTOR_ID = sid("distributor", "ganesh")


# ------------------------------------------------------------------ static
async def seed_static(session: AsyncSession, seed: int = 42) -> None:
    t0 = time.time()
    w = generate(seed)
    demo_day = clock.clock.base.astimezone(clock.IST).date()
    log.info("generated synthetic world in %.1fs", time.time() - t0)

    merchants = []
    for si, s in enumerate(w.shops):
        stability = trust.stability_from_sales(w.sales[si][: len(w.days)])
        merchants.append(dict(
            id=sid("merchant", s["shop_no"]), shop_no=s["shop_no"], name=s["name"], owner_name=s["owner_name"],
            category=s["category"], lat=s["lat"], lng=s["lng"], h3_r8=s["h3_r8"], h3_r7=s["h3_r7"],
            area_name=s["area_name"], lang=s["lang"], wallet_index=s["wallet_index"],
            wallet_address=wallets.address(s["wallet_index"]), wallet_balance_paise=s["seed_balance_paise"],
            seed_balance_paise=s["seed_balance_paise"], base_daily_paise=s["base_daily_paise"],
            sales_stability=round(stability, 4), onboarded_on=s["onboarded_on"], is_demo=s["is_demo"],
            created_at=datetime.combine(s["onboarded_on"], datetime.min.time(), clock.IST)))
    await session.execute(insert(Merchant), merchants)
    mid = {s["shop_no"]: sid("merchant", s["shop_no"]) for s in w.shops}

    rows = []
    for si, s in enumerate(w.shops):
        m = mid[s["shop_no"]]
        for di, d in enumerate(w.days):
            v = int(w.sales[si, di])
            if v > 0:
                rows.append({"merchant_id": m, "day": d, "txn_count": int(w.txns[si, di]), "amount_paise": v,
                             "unique_payers": int(w.payers[si, di])})
    for i in range(0, len(rows), 20_000):
        await session.execute(insert(DailySale), rows[i:i + 20_000])
    await session.execute(insert(Transaction), [{"merchant_id": mid[1], **t} for t in w.transactions])

    skus = [dict(id=sid("sku", s["code"]), code=s["code"], name=s["name"], name_hi=s["name_hi"],
                 category=s["category"], case_size=s["case_size"], case_price_paise=s["case_price_paise"],
                 unit_retail_paise=s["unit_retail_paise"], sku_share=s["sku_share"], emoji=s["emoji"]) for s in w.skus]
    await session.execute(insert(Sku), skus)
    await session.execute(insert(Distributor), [dict(
        id=sid("distributor", d["key"]), key=d["key"], name=d["name"], coverage_h3=d["coverage_h3"],
        categories=d["categories"], wallet_index=d["wallet_index"], wallet_address=wallets.address(d["wallet_index"]))
        for d in w.distributors])
    await session.execute(insert(Scheme), [dict(
        id=sid("scheme", f"{s['distributor_key']}:{s['sku_code']}:{s['valid_from']}"),
        distributor_id=sid("distributor", s["distributor_key"]), sku_id=sid("sku", s["sku_code"]), slabs=s["slabs"],
        valid_from=s["valid_from"], valid_to=s["valid_to"]) for s in w.schemes])
    now = clock.now()
    await session.execute(insert(Inventory), [dict(
        merchant_id=mid[r["shop_no"]], sku_id=sid("sku", r["sku_code"]), qty_units=r["qty_units"],
        seed_qty_units=r["qty_units"], source="bills", updated_at=now) for r in w.inventory])
    await session.execute(insert(CategoryMix), [dict(merchant_id=mid[r["shop_no"]], category=r["category"],
                                                     share=r["share"]) for r in w.category_mix])

    # forecasts for the demo week (same code path as a batch job would use)
    t1 = time.time()
    end = demo_day + timedelta(days=forecasts.WINDOW_DAYS - 1)
    fc_rows = []
    for si, s in enumerate(w.shops):
        sf = fs.forecast_shop(w.days, w.sales[si], s["mix"], demo_day)
        for cat in s["mix"]:
            win = fs.category_window(sf, s["mix"], cat, demo_day, end)
            fc_rows.append(dict(merchant_id=mid[s["shop_no"]], category=cat, window_start=demo_day, window_end=end,
                                p10=win["p10"], p50=win["p50"], p90=win["p90"], uplift=win["uplift"],
                                reason=win["reason"], model=win["model"]))
    await session.execute(insert(Forecast), fc_rows)
    log.info("forecasts: %d rows in %.1fs", len(fc_rows), time.time() - t1)

    for p in DEV_PROFILES:
        session.add(Profile(id=sid("profile", p["token"]), role=p["role"], display_name=p["display_name"],
                            dev_token=p["token"], lang="hi" if p["role"] == "merchant" else "en",
                            merchant_id=DEMO_MERCHANT_ID if p["role"] == "merchant" else None,
                            distributor_id=DEMO_DISTRIBUTOR_ID if p["role"] == "distributor" else None,
                            created_at=now))
    await session.commit()
    from . import cache

    cache.invalidate_all()
    log.info("static seed done in %.1fs", time.time() - t0)


# ------------------------------------------------------------------ dynamic (demo state)
DYNAMIC_TABLES = [ChainTx, PendingAction, Nudge, Delivery, PoolCommitment, PoolInvite, Loan, TrustScore, Invoice, Pool]


async def clear_dynamic(session: AsyncSession) -> None:
    for t in DYNAMIC_TABLES:
        await session.execute(delete(t))
    await session.execute(update(Merchant).values(wallet_balance_paise=Merchant.seed_balance_paise))
    await session.execute(update(Merchant).where(Merchant.is_demo.is_(True)).values(lang="hi"))
    # MERCHANT_MNEMONIC changed since the seed (e.g. switching to Sepolia)? re-derive every wallet address
    demo = await session.get(Merchant, DEMO_MERCHANT_ID)
    if demo is not None and demo.wallet_address != wallets.address(demo.wallet_index):
        for m in (await session.execute(select(Merchant))).scalars():
            m.wallet_address = wallets.address(m.wallet_index)
        for d in (await session.execute(select(Distributor))).scalars():
            d.wallet_address = wallets.address(d.wallet_index)
        log.info("wallet addresses re-derived for the current MERCHANT_MNEMONIC")
    await session.execute(delete(Inventory).where(Inventory.seed_qty_units == 0))
    await session.execute(update(Inventory).values(qty_units=Inventory.seed_qty_units, source="bills"))
    for p in DEV_PROFILES:
        prof = await session.get(Profile, sid("profile", p["token"]))
        if prof:
            prof.role = p["role"]
            prof.lang = "hi" if p["role"] == "merchant" else "en"
            prof.merchant_id = DEMO_MERCHANT_ID if p["role"] == "merchant" else None
            prof.distributor_id = DEMO_DISTRIBUTOR_ID if p["role"] == "distributor" else None


async def _stockists(session, sku: Sku, cluster: str | None, exclude: set) -> list[Merchant]:
    q = select(Merchant).join(CategoryMix, CategoryMix.merchant_id == Merchant.id).where(
        CategoryMix.category == sku.category, CategoryMix.share >= 0.03, Merchant.is_demo.is_(False))
    if cluster:
        q = q.where(Merchant.h3_r7 == cluster)
    ms = [m for m in (await session.execute(q.order_by(Merchant.shop_no))).scalars().all() if m.id not in exclude]
    return ms


async def _scheme(session, dist_key: str, sku_code: str, on: date) -> Scheme:
    return (await session.execute(select(Scheme).where(
        Scheme.distributor_id == sid("distributor", dist_key), Scheme.sku_id == sid("sku", sku_code),
        Scheme.valid_from <= on, Scheme.valid_to >= on))).scalars().first()


async def _historic_pool(session, rng, *, dist_key, sku_code, target, disc_bps, opened: datetime, ramesh_cases,
                         cluster, demo: Merchant | None):
    sku = await session.get(Sku, sid("sku", sku_code))
    dist = await session.get(Distributor, sid("distributor", dist_key))
    sch = await _scheme(session, dist_key, sku_code, opened.date())
    members = await _stockists(session, sku, cluster, set())
    rng.shuffle(members)
    center = demo or members[0]
    p = await pools.create_pool(session, sku=sku, distributor=dist, scheme=sch, target=target, disc_bps=disc_bps,
                                slabs=sch.slabs if sch else [{"min_cases": target, "disc_bps": disc_bps}],
                                center_lat=center.lat, center_lng=center.lng, area_name=center.area_name,
                                cluster_h3=cluster, deadline=opened + timedelta(days=2),
                                delivery_deadline=opened + timedelta(days=5), status="open", created_at=opened,
                                chain=False)
    plan: list[tuple[Merchant, int]] = []
    left = target
    if demo is not None:
        plan.append((demo, ramesh_cases))
        left -= ramesh_cases
    for m in members:
        if left <= 0:
            break
        c = min(left, rng.randint(2, 5))
        plan.append((m, c))
        left -= c
    if left > 0 and plan:
        m_last, c_last = plan[-1]
        plan[-1] = (m_last, c_last + left)
    for i, (m, c) in enumerate(plan):
        at = opened + timedelta(hours=2 + i * 3)
        amount = c * p.case_price_paise
        session.add(PoolCommitment(pool_id=p.id, merchant_id=m.id, cases=c, amount_paise=amount, status="delivered",
                                   created_at=at))
        p.committed_cases += c
    p.status, p.funded_at = "funded", opened + timedelta(days=1, hours=6)
    for i, (m, c) in enumerate(plan):
        amount = c * p.case_price_paise
        fee = fee_of(amount, settings.fee_bps)
        done = opened + timedelta(days=2, hours=10 + i % 6)
        session.add(Delivery(pool_id=p.id, merchant_id=m.id, qr_nonce=secrets.token_hex(8), status="delivered",
                             confirmed_at=done, on_time=True, payout_paise=amount - fee, fee_paise=fee))
    p.status, p.settled_at = "settled", opened + timedelta(days=3)
    return p


async def _open_pool(session, rng, *, dist_key, sku_code, target, disc_bps, deadline_minutes, member_cases,
                     demo: Merchant, demo_suggested: int | None, extra_invites: int):
    now = clock.now()
    sku = await session.get(Sku, sid("sku", sku_code))
    dist = await session.get(Distributor, sid("distributor", dist_key))
    sch = await _scheme(session, dist_key, sku_code, clock.today())
    cluster = demo.h3_r7
    members = await _stockists(session, sku, cluster, {demo.id})
    rng.shuffle(members)
    chosen = members[: len(member_cases)]
    lat = (sum(m.lat for m in chosen) + demo.lat) / (len(chosen) + 1)
    lng = (sum(m.lng for m in chosen) + demo.lng) / (len(chosen) + 1)
    off = settings.chain_mode == "off"
    p = await pools.create_pool(session, sku=sku, distributor=dist, scheme=sch, target=target, disc_bps=disc_bps,
                                slabs=sch.slabs, center_lat=round(lat, 6), center_lng=round(lng, 6),
                                area_name="Marol, Andheri East", cluster_h3=cluster,
                                deadline=now + timedelta(minutes=deadline_minutes),
                                delivery_deadline=now + timedelta(days=2), created_at=now - timedelta(hours=3),
                                tx_simulated=off)
    joins = []
    for i, (m, c) in enumerate(zip(chosen, member_cases)):
        at = now - timedelta(minutes=150 - i * (140 // max(1, len(chosen))))
        session.add(PoolInvite(pool_id=p.id, merchant_id=m.id, suggested_cases=c,
                               reason={"event": "", "uplift": 1.0, "stock_units": 0, "need_cases": c},
                               status="invited", created_at=now - timedelta(hours=3)))
        m.wallet_balance_paise = max(m.wallet_balance_paise, c * p.case_price_paise)
        joins.append(pools.Join(m, c, at=at))
    await session.flush()
    await pools.commit_many(session, p, joins, [], simulated_tx=off)
    for m in members[len(member_cases): len(member_cases) + extra_invites]:
        session.add(PoolInvite(pool_id=p.id, merchant_id=m.id, suggested_cases=rng.randint(2, 4),
                               reason={"event": "", "uplift": 1.0, "stock_units": 0, "need_cases": 3},
                               status="invited", created_at=now - timedelta(hours=3)))
    invite = None
    if demo_suggested is not None:
        need = await forecasts.need_for_sku(session, demo.id, sku)
        f = need.get("forecast")
        reason = {"event": need["event"] or "", "uplift": need["uplift"], "stock_units": need["stock_units"],
                  "need_cases": need["need_cases"]}
        invite = PoolInvite(pool_id=p.id, merchant_id=demo.id, suggested_cases=demo_suggested, reason=reason,
                            status="invited", created_at=now - timedelta(minutes=2))
        session.add(invite)
        hi, en = nudges.invite_text(demo, category=sku.category, sku_name=sku.name, sku_name_hi=sku.name_hi,
                                    event=need["event"], event_hi=(f.reason or {}).get("event_hi") if f else None,
                                    uplift=need["uplift"], stock_cases=need["stock_units"] // sku.case_size,
                                    need_cases=need["need_cases"], shops=len(chosen), target=target,
                                    disc_bps=disc_bps)
        invite._nudge = (hi, en)  # type: ignore[attr-defined]
    await session.flush()
    return p, invite


async def seed_dynamic(session: AsyncSession) -> dict:
    t0 = time.time()
    rng = random.Random(7)
    await clear_dynamic(session)
    await session.flush()
    demo = await session.get(Merchant, DEMO_MERCHANT_ID)
    await session.refresh(demo)
    now = clock.now()

    # 3 historic settled pools with Ramesh + 3 without (other neighbourhoods) -> savings, trust, KPI history
    base = clock.clock.base
    cl = demo.h3_r7
    other_cells = [c for c in (await session.execute(select(Merchant.h3_r7).distinct())).scalars() if c != cl]
    await _historic_pool(session, rng, dist_key="mahalaxmi", sku_code="sunflower_oil_1l", target=30, disc_bps=500,
                         opened=base - timedelta(days=60), ramesh_cases=5, cluster=cl, demo=demo)
    await _historic_pool(session, rng, dist_key="mahalaxmi", sku_code="sugar_1kg", target=40, disc_bps=400,
                         opened=base - timedelta(days=36), ramesh_cases=4, cluster=cl, demo=demo)
    await _historic_pool(session, rng, dist_key="ganesh", sku_code="cream_biscuit_100", target=30, disc_bps=500,
                         opened=base - timedelta(days=24), ramesh_cases=3, cluster=cl, demo=demo)
    for i, (dk, sc, tgt, disc, days) in enumerate([("mahalaxmi", "basmati_5kg", 30, 500, 27),
                                                   ("mahalaxmi", "toor_dal_1kg", 25, 450, 14),
                                                   ("ganesh", "cream_biscuit_100", 30, 500, 20)]):
        await _historic_pool(session, rng, dist_key=dk, sku_code=sc, target=tgt, disc_bps=disc,
                             opened=base - timedelta(days=days), ramesh_cases=0,
                             cluster=other_cells[i % len(other_cells)] if other_cells else cl, demo=None)
    await session.flush()

    # the live demo pools
    cola, cola_inv = await _open_pool(session, rng, dist_key="ganesh", sku_code="cola_2l", target=40, disc_bps=600,
                                      deadline_minutes=settings.demo_pool_deadline_minutes,
                                      member_cases=[3, 2, 4, 2, 3, 2, 1, 3, 2, 3, 2], demo=demo, demo_suggested=6,
                                      extra_invites=10)
    chips, chips_inv = await _open_pool(session, rng, dist_key="ganesh", sku_code="masala_chips_50", target=30,
                                        disc_bps=550, deadline_minutes=6 * 60, member_cases=[3, 2, 3, 2, 2, 2],
                                        demo=demo, demo_suggested=3, extra_invites=6)
    oil, _ = await _open_pool(session, rng, dist_key="mahalaxmi", sku_code="sunflower_oil_1l", target=25,
                              disc_bps=500, deadline_minutes=26 * 60, member_cases=[2, 2, 1, 2, 2], demo=demo,
                              demo_suggested=None, extra_invites=5)

    # Ramesh's soundbox feed (newest last created)
    fcs = await forecasts.forecast_summaries(session, demo, top=1)
    score, _ = await trust.refresh(session, demo)
    hi, en = nudges.trust_text(demo, score)
    await nudges.create(session, demo, "trust", hi, en, at=now - timedelta(days=1), llm_ok=False)
    if fcs:
        f = fcs[0]
        fr = next((x for x in await forecasts.current_forecasts(session, demo.id) if x.category == f["category"]), None)
        hi, en = nudges.forecast_text(demo, f["category"], f["uplift"], f["event"],
                                      (fr.reason or {}).get("event_hi") if fr else None)
        await nudges.create(session, demo, "forecast", hi, en, at=now - timedelta(hours=3), llm_ok=False)
    hi, en = chips_inv._nudge
    await nudges.create(session, demo, "pool_invite", hi, en, chips.id, at=now - timedelta(hours=2), llm_ok=False)
    hi, en = cola_inv._nudge
    await nudges.create(session, demo, "pool_invite", hi, en, cola.id, at=now - timedelta(minutes=1), llm_ok=False)

    # trust scores for every shop (bulk, same formula) + suppliers
    delivered = {}
    for (m_id,) in (await session.execute(select(PoolCommitment.merchant_id)
                                          .where(PoolCommitment.status == "delivered"))).all():
        delivered[m_id] = delivered.get(m_id, 0) + 1
    today = clock.today()
    rows = []
    for m in (await session.execute(select(Merchant))).scalars():
        if m.id == demo.id:
            continue
        n = delivered.get(m.id, 0)
        comps = {"honoured_rate": 1.0 if n else trust.NEW_MERCHANT_HONOURED_PRIOR, "pools_joined": n,
                 "sales_stability": round(m.sales_stability, 3),
                 "tenure_months": round(trust.months_between(m.onboarded_on, today), 1)}
        rows.append(dict(subject_address=m.wallet_address, subject_type="merchant", merchant_id=m.id,
                         score=trust.score_formula(comps["honoured_rate"], n, m.sales_stability, comps["tenure_months"]),
                         components=comps, updated_at=now))
    for d in (await session.execute(select(Distributor))).scalars():
        rows.append(dict(subject_address=d.wallet_address, subject_type="supplier", merchant_id=None, score=800,
                         components={"on_time_rate": 1.0, "fill_rate": 1.0}, updated_at=now))
    await session.execute(insert(TrustScore), rows)
    await session.commit()
    log.info("dynamic seed done in %.2fs", time.time() - t0)
    return {"pools": [str(cola.id), str(chips.id), str(oil.id)], "trust": score, "_now": now}


async def reset(session: AsyncSession) -> dict:
    """Restore the seeded demo state: fast path from the snapshot (~15 statements on Postgres), else a full
    seed_dynamic followed by a snapshot capture."""
    from ..chain import relayer
    from . import cache, snapshot

    t0 = time.time()
    clock.clock.reset()
    relayer.reset_local_state()
    nudges.reset_stamp()
    async with pools.POOL_LOCK:
        info = await snapshot.restore(session)
        mode = "snapshot"
        if info is None:
            mode = "full"
            info = await seed_dynamic(session)
            await snapshot.capture(session, info.pop("_now"))
            cache.invalidate_static()  # wallet addresses may have been re-derived
        elif "trust" not in info:
            info["trust"] = (await session.execute(select(TrustScore.score).where(
                TrustScore.merchant_id == DEMO_MERCHANT_ID))).scalar_one_or_none()
    trust.clear_cache()
    cache.invalidate_claimed()
    cache.bump()
    return {**info, "mode": mode, "seconds": round(time.time() - t0, 2)}
