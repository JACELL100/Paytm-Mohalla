"""Read/compute demand forecasts. Seeded rows come from ml/forecast_simple.py (or ml/forecast_chronos.py);
if the demo clock moves to a week with no stored forecast, it is computed on the fly and cached."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..models import CategoryMix, DailySale, Forecast, Inventory, Merchant, Pool, PoolInvite, Sku
from .common import category_meta
from ml import forecast_simple as fs  # noqa: E402  (mlpath set up by .common)

WINDOW_DAYS = 7
_series_cache: dict[uuid.UUID, tuple[list[date], np.ndarray]] = {}
_mix_cache: dict[uuid.UUID, dict[str, float]] = {}
_fc_cache: dict[tuple[uuid.UUID, date], fs.ShopForecast] = {}


async def sales_series(session: AsyncSession, merchant_id: uuid.UUID) -> tuple[list[date], np.ndarray]:
    if merchant_id not in _series_cache:
        rows = (await session.execute(select(DailySale.day, DailySale.amount_paise)
                                      .where(DailySale.merchant_id == merchant_id)
                                      .order_by(DailySale.day))).all()
        _series_cache[merchant_id] = ([r[0] for r in rows], np.array([r[1] for r in rows], dtype=float))
    return _series_cache[merchant_id]


async def category_mix(session: AsyncSession, merchant_id: uuid.UUID) -> dict[str, float]:
    if merchant_id not in _mix_cache:
        rows = (await session.execute(select(CategoryMix).where(CategoryMix.merchant_id == merchant_id))).scalars()
        _mix_cache[merchant_id] = {r.category: r.share for r in rows}
    return _mix_cache[merchant_id]


async def shop_forecast(session: AsyncSession, merchant_id: uuid.UUID, today: date) -> fs.ShopForecast:
    key = (merchant_id, today)
    if key not in _fc_cache:
        days, vals = await sales_series(session, merchant_id)
        mix = await category_mix(session, merchant_id)
        if len(_fc_cache) > 2000:
            _fc_cache.clear()
        _fc_cache[key] = fs.forecast_shop(days, vals, mix, today)
    return _fc_cache[key]


def forecast_row(merchant_id: uuid.UUID, category: str, w: dict) -> Forecast:
    return Forecast(merchant_id=merchant_id, category=category, window_start=w["window_start"],
                    window_end=w["window_end"], p10=w["p10"], p50=w["p50"], p90=w["p90"], uplift=w["uplift"],
                    reason=w["reason"], model=w["model"])


async def current_forecasts(session: AsyncSession, merchant_id: uuid.UUID, today: date | None = None) -> list[Forecast]:
    """One row per category for the week containing `today` (computed + stored if missing)."""
    today = today or clock.today()
    rows = (await session.execute(select(Forecast).where(Forecast.merchant_id == merchant_id,
                                                         Forecast.window_start <= today,
                                                         Forecast.window_end >= today)
                                  .order_by(Forecast.window_start.desc()))).scalars().all()
    by_cat: dict[str, Forecast] = {}
    for r in rows:
        by_cat.setdefault(r.category, r)
    mix = await category_mix(session, merchant_id)
    missing = [c for c in mix if c not in by_cat]
    if missing:
        sf = await shop_forecast(session, merchant_id, today)
        end = today + timedelta(days=WINDOW_DAYS - 1)
        for c in missing:
            existing = await session.get(Forecast, (merchant_id, c, today))
            if existing:
                by_cat[c] = existing
                continue
            f = forecast_row(merchant_id, c, fs.category_window(sf, mix, c, today, end))
            session.add(f)
            by_cat[c] = f
        await session.commit()
    return list(by_cat.values())


async def stock_units(session: AsyncSession, merchant_id: uuid.UUID, sku_id: uuid.UUID) -> int:
    inv = await session.get(Inventory, (merchant_id, sku_id))
    return inv.qty_units if inv else 0


def sku_ml(s: Sku) -> dict:
    return {"case_size": s.case_size, "unit_retail_paise": s.unit_retail_paise, "sku_share": s.sku_share}


async def need_for_sku(session: AsyncSession, merchant_id: uuid.UUID, sku: Sku, today: date | None = None) -> dict:
    fcs = await current_forecasts(session, merchant_id, today)
    f = next((x for x in fcs if x.category == sku.category), None)
    stock = await stock_units(session, merchant_id, sku.id)
    if not f:
        return {"need_cases": 0, "need_units": 0, "stock_units": stock, "uplift": 1.0, "event": None}
    w = {"p50": f.p50, "p90": f.p90}
    n = fs.need_cases(w, sku_ml(sku), stock)
    return {**n, "stock_units": stock, "uplift": round(f.uplift, 2), "event": (f.reason or {}).get("event"),
            "forecast": f}


async def forecast_summaries(session: AsyncSession, merchant: Merchant, top: int = 3) -> list[dict]:
    fcs = await current_forecasts(session, merchant.id)
    fcs = sorted(fcs, key=lambda f: f.uplift, reverse=True)[:top]
    # SKU used for need_cases: the one in an open invite for this category, else the category's main SKU
    invited = (await session.execute(
        select(Sku).join(Pool, Pool.sku_id == Sku.id).join(PoolInvite, PoolInvite.pool_id == Pool.id)
        .where(PoolInvite.merchant_id == merchant.id, Pool.status == "open"))).scalars().all()
    out = []
    for f in fcs:
        meta = category_meta(f.category)
        sku = next((s for s in invited if s.category == f.category), None)
        if sku is None:
            sku = (await session.execute(select(Sku).where(Sku.category == f.category)
                                         .order_by(Sku.sku_share.desc()))).scalars().first()
        need = None
        if sku:
            stock = await stock_units(session, merchant.id, sku.id)
            need = fs.need_cases({"p50": f.p50, "p90": f.p90}, sku_ml(sku), stock)["need_cases"]
        days = (f.window_end - f.window_start).days + 1
        out.append({
            "category": f.category, "label_hi": meta["hi"], "label_en": meta["en"], "emoji": meta["emoji"],
            "uplift": round(f.uplift, 2), "window_start": f.window_start.isoformat(),
            "window_end": f.window_end.isoformat(), "event": (f.reason or {}).get("event"),
            "p50_daily_paise": int(f.p50 / days), "need_cases": need,
        })
    return out


async def forecast_detail(session: AsyncSession, merchant: Merchant, category: str) -> dict | None:
    mix = await category_mix(session, merchant.id)
    if category not in mix:
        return None
    today = clock.today()
    days, vals = await sales_series(session, merchant.id)
    sf = await shop_forecast(session, merchant.id, today)
    meta = category_meta(category)
    fcs = await current_forecasts(session, merchant.id, today)
    f = next((x for x in fcs if x.category == category), None)
    reason = dict(f.reason) if f else {}
    return {
        "category": category, "label_en": meta["en"], "label_hi": meta["hi"],
        "history": [{"day": r["day"].isoformat(), "value_paise": r["value_paise"]}
                    for r in fs.category_history(days, vals, mix, category, today, 60)],
        "forecast": [{"day": r["day"].isoformat(), "p10_paise": r["p10_paise"], "p50_paise": r["p50_paise"],
                      "p90_paise": r["p90_paise"]} for r in fs.category_daily(sf, mix, category)],
        "reason": {"event": reason.get("event"), "last_year_uplift": reason.get("last_year_uplift"),
                   "explanation_en": reason.get("explanation_en", ""),
                   "explanation_hi": reason.get("explanation_hi", "")},
    }
