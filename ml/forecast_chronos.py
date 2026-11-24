"""Optional: Amazon Chronos-2 forecasts -> the same `forecasts` table the API reads.

    pip install -r ml/requirements-chronos.txt          # torch + chronos-forecasting>=2.0 (CPU is fine)
    cd apps/api && python ../../ml/forecast_chronos.py --today 2026-12-26 [--limit 50]

Chronos-2 forecasts each shop's total Paytm daily sales (p10/p50/p90, 28 days) using known-future covariates:
festival x weather multiplier (holidays package + Open-Meteo forecast/climatology), rain, max temperature,
salary week and weekend. Category demand is then (as in plan 8.1):

    category_demand = Chronos total / whole-shop effect x category share x category effect (festival, weather)

It writes rows with model='chronos-2' for the 7-day window starting --today (replacing existing rows for that
window), so the API (`/m/home`, `/forecasts/{category}` reason) and the pool engine use them automatically.
Uses the database from DATABASE_URL / apps/api/.env, like the API.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "apps" / "api"))

import numpy as np  # noqa: E402

from ml import forecast_simple as fs  # noqa: E402
from ml.festivals import total_multipliers  # noqa: E402
from ml.sources.fetch_weather import weather  # noqa: E402

HORIZON = 28
QUANTILES = [0.1, 0.5, 0.9]


def covariates(days: list[date], mix: dict[str, float]) -> dict[str, list]:
    F = total_multipliers(mix, days)
    w = [weather(d) for d in days]
    return {"effect": list(F), "rain_mm": [x[0] for x in w], "tmax_c": [x[1] for x in w],
            "salary_week": [1.0 if d.day <= 7 else 0.0 for d in days],
            "weekend": [1.0 if d.weekday() >= 5 else 0.0 for d in days]}


def run_chronos(series: dict, mixes: dict, today: date):
    """series: {merchant_id: (days, values)} -> {merchant_id: {'p10','p50','p90': np.ndarray(HORIZON)}}"""
    import pandas as pd
    from chronos import Chronos2Pipeline

    pipe = Chronos2Pipeline.from_pretrained("amazon/chronos-2", device_map="cpu")
    fut_days = [today + timedelta(days=i) for i in range(HORIZON)]
    ctx, fut = [], []
    for mid, (days, vals) in series.items():
        keep = [(d, v) for d, v in zip(days, vals) if d < today and v > 0][-400:]
        if len(keep) < 60:
            continue
        cd = [d for d, _ in keep]
        cov = covariates(cd, mixes[mid])
        ctx.append(pd.DataFrame({"id": str(mid), "timestamp": pd.to_datetime(cd),
                                 "target": [float(v) for _, v in keep], **cov}))
        fcov = covariates(fut_days, mixes[mid])
        fut.append(pd.DataFrame({"id": str(mid), "timestamp": pd.to_datetime(fut_days), **fcov}))
    pred = pipe.predict_df(pd.concat(ctx), future_df=pd.concat(fut), prediction_length=HORIZON,
                           quantile_levels=QUANTILES, id_column="id", timestamp_column="timestamp", target="target")
    out = {}
    for mid, g in pred.groupby("id"):
        g = g.sort_values("timestamp")
        out[mid] = {f"p{int(q * 100)}": g[str(q)].to_numpy() for q in QUANTILES}
    return out, fut_days


async def main(today: date, limit: int | None) -> None:
    from sqlalchemy import delete, select

    from app.core.db import SessionLocal, engine
    from app.models import CategoryMix, DailySale, Forecast, Merchant

    async with SessionLocal() as s:
        ms = (await s.execute(select(Merchant).order_by(Merchant.shop_no))).scalars().all()[: limit or None]
        series, mixes = {}, {}
        for m in ms:
            rows = (await s.execute(select(DailySale.day, DailySale.amount_paise)
                                    .where(DailySale.merchant_id == m.id).order_by(DailySale.day))).all()
            series[m.id] = ([r[0] for r in rows], np.array([r[1] for r in rows], dtype=float))
            mixes[m.id] = {r.category: r.share for r in
                           (await s.execute(select(CategoryMix).where(CategoryMix.merchant_id == m.id))).scalars()}
        preds, fut_days = run_chronos(series, mixes, today)
        end = today + timedelta(days=6)  # same 7-day window as the API
        n = 0
        for m in ms:
            p = preds.get(str(m.id))
            if p is None:
                continue
            days, vals = series[m.id]
            mix = mixes[m.id]
            # festival-free baseline from Chronos, then reuse the simple model's category logic and reasons
            sf = fs.forecast_shop(days, vals, mix, today)
            effect = total_multipliers(mix, fut_days)
            sf.base = np.maximum(p["p50"] / effect, 0)
            ratio_lo = np.clip(np.nanmedian(p["p10"] / np.maximum(p["p50"], 1)), 0.4, 0.99)
            ratio_hi = np.clip(np.nanmedian(p["p90"] / np.maximum(p["p50"], 1)), 1.01, 2.0)
            sf.q10, sf.q90 = float(ratio_lo), float(ratio_hi)
            await s.execute(delete(Forecast).where(Forecast.merchant_id == m.id, Forecast.window_start == today))
            for cat in mix:
                w = fs.category_window(sf, mix, cat, today, end)
                s.add(Forecast(merchant_id=m.id, category=cat, window_start=today, window_end=end, p10=w["p10"],
                               p50=w["p50"], p90=w["p90"], uplift=w["uplift"],
                               reason={**w["reason"], "model": "chronos-2"}, model="chronos-2"))
                n += 1
        await s.commit()
    await engine.dispose()
    print(f"wrote {n} chronos-2 forecast rows for window {today}..{end}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", default="2026-12-26")
    ap.add_argument("--limit", type=int, default=None, help="only the first N shops (quick test)")
    a = ap.parse_args()
    asyncio.run(main(date.fromisoformat(a.today), a.limit))
