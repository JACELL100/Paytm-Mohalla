"""Lightweight demand forecaster (no torch): weekday profile + trend + festival uplift
learned from last year's same window + weather (Open-Meteo forecast, climatology beyond it)
as known-future covariates, with empirical p10/p50/p90 bands.

    category_demand(shop, category, window) =
        forecast of the shop's Paytm daily sales (festival-free baseline)
      x category share (from purchase-bill history)
      x festival uplift for that category (calendar effect x this shop's observed uplift last year)

Used by the API seed and on the fly by the API (e.g. after the Demo Director time-travels).
`ml/forecast_chronos.py` swaps the baseline for Amazon Chronos-2 and writes the same table.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ml.festivals import (  # noqa: E402
    CATEGORIES,
    Festival,
    category_multiplier,
    festivals_on,
    footfall,
    main_festival_in,
    previous_occurrence,
    total_multiplier,
    total_multipliers,
    weather_multiplier,
)

MODEL_NAME = "seasonal-profile-v1"
HORIZON = 28


@dataclass
class ShopForecast:
    today: date
    days: list[date]  # future days (today .. today+horizon-1)
    base: np.ndarray  # festival-free p50 of total daily sales, paise
    q10: float  # multiplicative residual quantiles
    q90: float
    shop_adj: dict[str, float]  # festival key -> this shop's observed / expected uplift last year
    observed_uplift: dict[str, float]  # festival key -> observed total-sales uplift last year

    def festival_factor(self, category: str, d: date) -> float:
        best = 1.0
        for f in festivals_on(d):
            m = category_multiplier(category, d)
            if m > 1.0:
                best = max(best, 1 + (m - 1) * self.shop_adj.get(f.key, 1.0))
        return best

    def category_factor(self, category: str, d: date) -> float:
        """festival (this shop's learned bump) x weather (rain/heat) x footfall."""
        return self.festival_factor(category, d) * weather_multiplier(category, d) * footfall(d)


def _salary(d: date, s: float) -> float:
    return s if d.day <= 7 else 1.0


def forecast_shop(days: list[date], values: np.ndarray, mix: dict[str, float], today: date,
                  horizon: int = HORIZON) -> ShopForecast:
    """`days`/`values`: the shop's daily Paytm sales history (paise). Only days < today are used."""
    hist = [(d, float(v)) for d, v in zip(days, values) if d < today and v > 0]
    if len(hist) < 28:
        level = float(np.mean([v for _, v in hist])) if hist else 100_000.0
        fut = [today + timedelta(days=i) for i in range(horizon)]
        return ShopForecast(today, fut, np.full(horizon, level), 0.75, 1.3, {}, {})
    hd = [d for d, _ in hist]
    hv = np.array([v for _, v in hist])
    F = total_multipliers(mix, hd)  # festival x weather, known covariates
    fest_day = np.array([bool(festivals_on(d)) for d in hd])
    wd = np.array([d.weekday() for d in hd])
    sal_day = np.array([d.day <= 7 for d in hd])

    recent = np.arange(len(hd)) >= len(hd) - 182
    clean = recent & ~fest_day & ~sal_day
    overall = hv[clean].mean() if clean.any() else hv.mean()
    weekday = np.array([hv[clean & (wd == w)].mean() / overall if (clean & (wd == w)).any() else 1.0
                        for w in range(7)])
    adj0 = hv / weekday[wd]
    m_sal = adj0[recent & sal_day & ~fest_day]
    m_norm = adj0[recent & ~sal_day & ~fest_day]
    salary = float(np.clip(m_sal.mean() / m_norm.mean(), 0.9, 1.3)) if len(m_sal) and len(m_norm) else 1.0

    a = hv / (weekday[wd] * np.where(sal_day, salary, 1.0) * F)  # festival-free, weekday-free level series
    level = float(np.median(a[-28:]))

    # yearly growth: last 28 days vs the same 28 days a year earlier
    idx_by_day = {d: i for i, d in enumerate(hd)}
    ly = [idx_by_day.get(d - timedelta(days=364)) for d in hd[-28:]]
    ly = [i for i in ly if i is not None]
    growth = float(np.clip(level / np.median(a[ly]) - 1, -0.3, 0.5)) if len(ly) >= 14 else 0.0

    # residual spread
    tail = a[-120:]
    roll = np.array([np.median(a[max(0, len(a) - 120 + i - 28):len(a) - 120 + i + 1]) for i in range(len(tail))])
    r = tail / roll
    q10 = float(np.clip(np.quantile(r, 0.1), 0.5, 0.97))
    q90 = float(np.clip(np.quantile(r, 0.9), 1.03, 1.7))

    fut = [today + timedelta(days=i) for i in range(horizon)]
    base = np.array([level * weekday[d.weekday()] * _salary(d, salary) * (1 + growth) ** ((d - hd[-1]).days / 365)
                     for d in fut])

    # festival uplift from last year's same window (aligned by festival, not by date)
    shop_adj, observed = {}, {}
    upcoming: dict[str, Festival] = {}
    for d in fut:
        for f in festivals_on(d):
            upcoming.setdefault(f.key, f)
    for key, f in upcoming.items():
        prev = previous_occurrence(f)
        if not prev:
            continue
        idx = [idx_by_day[d] for d in _days(prev.start, prev.end) if d in idx_by_day]
        before = [idx_by_day[d] for d in _days(prev.start - timedelta(days=35), prev.start - timedelta(days=1))
                  if d in idx_by_day and not fest_day[idx_by_day[d]]]
        if len(idx) < 2 or len(before) < 10:
            continue
        ly_level = np.median(adj0[before] / np.where(sal_day[before], salary, 1.0))
        obs = float(np.mean(adj0[idx] / np.where(sal_day[idx], salary, 1.0)) / ly_level)
        exp = float(np.mean(F[idx]))
        observed[key] = round(obs, 3)
        # how much stronger/weaker this shop's festival bump was than the calendar suggests
        shop_adj[key] = float(np.clip((obs - 1) / max(exp - 1, 1e-3), 0.8, 1.2)) if exp > 1.001 else 1.0
    return ShopForecast(today, fut, base, q10, q90, shop_adj, observed)


def _days(a: date, b: date):
    d = a
    while d <= b:
        yield d
        d += timedelta(days=1)


def category_daily(sf: ShopForecast, mix: dict[str, float], category: str) -> list[dict]:
    share = mix.get(category, 0.0)
    out = []
    for d, b in zip(sf.days, sf.base):
        p50 = b * share * sf.category_factor(category, d)
        out.append({"day": d, "p10_paise": int(p50 * sf.q10), "p50_paise": int(p50), "p90_paise": int(p50 * sf.q90)})
    return out


def category_history(days: list[date], values, mix: dict[str, float], category: str, today: date,
                     n: int = 60) -> list[dict]:
    """Estimated daily sales of one category: total x share x (category effect / whole-shop effect)."""
    share = mix.get(category, 0.0)
    rows = [(d, v) for d, v in zip(days, values) if d < today][-n:]
    return [{"day": d, "value_paise": int(v * share * category_multiplier(category, d) * weather_multiplier(category, d)
                                          * footfall(d) / total_multiplier(mix, d))}
            for d, v in rows]


def fmt_inr(paise: float) -> str:
    """₹ with Indian digit grouping, no decimals."""
    r = int(round(paise / 100))
    s = str(abs(r))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return ("-" if r < 0 else "") + "₹" + s


def category_window(sf: ShopForecast, mix: dict[str, float], category: str, start: date, end: date) -> dict:
    """Window totals (paise), uplift and a human reason in en + hi."""
    share = mix.get(category, 0.0)
    days = [d for d in _days(start, end)]
    n = len(days)
    base_by_day = {d: b for d, b in zip(sf.days, sf.base)}
    fallback = float(np.mean(sf.base)) if len(sf.base) else 0.0
    base = np.array([base_by_day.get(d, fallback) for d in days]) * share
    cat = np.array([sf.category_factor(category, d) for d in days])
    p50 = float((base * cat).sum())
    uplift = float(p50 / base.sum()) if base.sum() > 0 else 1.0
    spread = 1 / np.sqrt(max(n, 1)) * 1.6
    p10 = p50 * (1 - (1 - sf.q10) * spread)
    p90 = p50 * (1 + (sf.q90 - 1) * spread)

    meta = CATEGORIES.get(category, {"en": category, "hi": category})
    fest = main_festival_in(start, end, category)
    lift = category_multiplier(category, fest.peak) if fest else 1.0
    event = event_hi = None
    ly_uplift = None
    if fest and lift > 1.0:
        event, event_hi = fest.name_en, fest.name_hi
        ly_uplift = round(1 + (lift - 1) * sf.shop_adj.get(fest.key, 1.0), 1)
        explanation_en = (f"Last {event} your {meta['en'].lower()} sales were {ly_uplift}x normal. "
                          f"Expect about {fmt_inr(p50 / n)} a day this week.")
        explanation_hi = (f"पिछले {event_hi} में आपकी {meta['hi']} की बिक्री {ly_uplift} गुना थी। "
                          f"इस हफ़्ते रोज़ लगभग {fmt_inr(p50 / n)} की बिक्री होगी।")
    else:
        explanation_en = f"A normal week: about {fmt_inr(p50 / n)} a day of {meta['en'].lower()}."
        explanation_hi = f"सामान्य हफ़्ता: रोज़ लगभग {fmt_inr(p50 / n)} की {meta['hi']} बिकेगी।"
    return {
        "window_start": start, "window_end": end, "p10": int(p10), "p50": int(p50), "p90": int(p90),
        "uplift": round(uplift, 2), "model": MODEL_NAME,
        "reason": {"event": event, "event_hi": event_hi, "last_year_uplift": ly_uplift,
                   "festival_key": fest.key if fest and event else None,
                   "explanation_en": explanation_en, "explanation_hi": explanation_hi},
    }


def need_cases(window: dict, sku: dict, stock_units: int) -> dict:
    """need_units = p50 x sku_share / unit price + safety(0.5 x (p90 - p50)) - stock"""
    unit = sku["unit_retail_paise"]
    p50_units = window["p50"] * sku["sku_share"] / unit
    safety = 0.5 * (window["p90"] - window["p50"]) * sku["sku_share"] / unit
    need_units = p50_units + safety - stock_units
    return {"need_units": int(round(max(0.0, need_units))),
            "need_cases": int(max(0, np.floor(need_units / sku["case_size"]))),
            "p50_units": int(round(p50_units))}
