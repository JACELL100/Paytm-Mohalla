"""Festival calendar (dates from the `holidays` package at runtime, see ml/sources/festivals.py),
per-category festival multipliers, and weather effects (Open-Meteo, see ml/sources/fetch_weather.py).

The multipliers stand in for what a real system would learn from each shop's purchase
bills: how much more of a product category moves during a festival window or in rain / heat.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"

# Product categories that SKUs belong to and forecasts are made for.
CATEGORIES: dict[str, dict] = {
    "cold_drinks": {"en": "Cold drinks", "hi": "कोल्ड ड्रिंक", "emoji": "🥤"},
    "snacks": {"en": "Snacks & namkeen", "hi": "नमकीन-स्नैक्स", "emoji": "🍟"},
    "staples": {"en": "Staples (atta, dal, rice)", "hi": "राशन (आटा, दाल, चावल)", "emoji": "🌾"},
    "oil_ghee": {"en": "Oil & ghee", "hi": "तेल-घी", "emoji": "🛢️"},
    "dairy": {"en": "Dairy", "hi": "दूध-डेयरी", "emoji": "🥛"},
    "bakery": {"en": "Bakery", "hi": "बेकरी", "emoji": "🍞"},
    "sweets": {"en": "Sweets", "hi": "मिठाई", "emoji": "🍬"},
    "dry_fruits": {"en": "Dry fruits", "hi": "ड्राई फ्रूट्स", "emoji": "🥜"},
    "tea_coffee": {"en": "Tea & coffee", "hi": "चाय-कॉफ़ी", "emoji": "🍵"},
    "personal_care": {"en": "Personal care & household", "hi": "साबुन-शैम्पू", "emoji": "🧼"},
    "pooja": {"en": "Pooja items & flowers", "hi": "पूजा सामग्री", "emoji": "🪔"},
    "til_gud": {"en": "Til & jaggery", "hi": "तिल-गुड़", "emoji": "🟤"},
}

# How much each product category sells during a festival window vs a normal week.
CATEGORY_UPLIFT: dict[str, dict[str, float]] = {
    "new_year": {"cold_drinks": 2.2, "snacks": 2.0, "bakery": 1.9, "sweets": 1.3, "dairy": 1.2, "dry_fruits": 1.2},
    "christmas": {"bakery": 2.4, "cold_drinks": 1.8, "snacks": 1.6, "sweets": 1.2},
    "diwali": {"oil_ghee": 3.1, "sweets": 3.0, "dry_fruits": 3.5, "pooja": 2.6, "snacks": 1.7, "staples": 1.3,
               "personal_care": 1.2},
    "ganesh": {"sweets": 2.6, "pooja": 2.5, "dairy": 1.4, "dry_fruits": 1.5, "snacks": 1.3},
    "holi": {"cold_drinks": 1.6, "sweets": 1.8, "snacks": 1.5, "dairy": 1.4},
    "sankranti": {"til_gud": 3.2, "sweets": 1.5, "staples": 1.1},
    "raksha_bandhan": {"sweets": 2.2, "dry_fruits": 1.6},
    "dussehra": {"sweets": 1.6, "pooja": 2.0, "dry_fruits": 1.3},
}


@dataclass(frozen=True)
class Festival:
    key: str
    name_en: str
    name_hi: str
    year: int
    peak: date
    start: date
    end: date

    def contains(self, d: date) -> bool:
        return self.start <= d <= self.end

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1


@lru_cache(maxsize=1)
def load_festivals() -> tuple[Festival, ...]:
    from ml.sources.festivals import build

    out = [Festival(r["key"], r["name_en"], r["name_hi"], int(r["year"]), r["peak_date"], r["start_date"],
                    r["end_date"]) for r in build()]
    return tuple(sorted(out, key=lambda x: x.start))


@lru_cache(maxsize=8192)
def festivals_on(d: date) -> tuple[Festival, ...]:
    return tuple(f for f in load_festivals() if f.contains(d))


@lru_cache(maxsize=65536)
def category_multiplier(category: str, d: date) -> float:
    """Calendar-driven multiplier for a product category on day d (1.0 on normal days)."""
    m = 1.0
    for f in festivals_on(d):
        m = max(m, CATEGORY_UPLIFT.get(f.key, {}).get(category, 1.0))
    return m


def shop_multiplier(mix: dict[str, float], d: date) -> float:
    """Total-sales multiplier for a shop with category mix `mix` (shares sum to 1)."""
    fs = festivals_on(d)
    if not fs:
        return 1.0
    return sum(share * category_multiplier(cat, d) for cat, share in mix.items())


def previous_occurrence(f: Festival) -> Festival | None:
    """Same festival one year earlier (used for 'last year's same window')."""
    for g in load_festivals():
        if g.key == f.key and g.year == f.year - 1:
            return g
    return None


def main_festival_in(start: date, end: date, category: str | None = None) -> Festival | None:
    """The festival overlapping [start, end] with the biggest effect on `category` (or longest overlap)."""
    best, best_score = None, 0.0
    for f in load_festivals():
        overlap = (min(end, f.end) - max(start, f.start)).days + 1
        if overlap <= 0:
            continue
        lift = CATEGORY_UPLIFT.get(f.key, {}).get(category, 1.0) if category else 1.0
        score = overlap * lift
        if score > best_score:
            best, best_score = f, score
    return best


def daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


# ------------------------------------------------------------------ weather (Open-Meteo)
def footfall(d: date) -> float:
    """Heavy rain keeps customers at home."""
    from ml.sources.fetch_weather import weather

    rain = weather(d)[0]
    return 0.8 if rain > 30 else 0.92 if rain > 10 else 1.0


@lru_cache(maxsize=65536)
def weather_multiplier(category: str, d: date) -> float:
    """Rain lifts chai and snacks (pakoda weather); heat lifts cold drinks and dairy (lassi, curd)."""
    from ml.sources.fetch_weather import weather

    rain, tmax, _ = weather(d)
    m = 1.0
    if rain > 10 and category in ("tea_coffee", "snacks"):
        m *= 1.25 if category == "tea_coffee" else 1.15
    if tmax > 33:
        if category == "cold_drinks":
            m *= 1 + 0.07 * min(tmax - 33, 5)
        elif category == "dairy":
            m *= 1.05
    return m


def total_multiplier(mix: dict[str, float], d: date) -> float:
    """Festival x weather multiplier on a shop's total Paytm sales (used to deflate/inflate totals)."""
    return footfall(d) * sum(share * category_multiplier(cat, d) * weather_multiplier(cat, d)
                             for cat, share in mix.items())


# ------------------------------------------------------------------ vectorised (fast path for 300 shops)
CAT_KEYS = list(CATEGORIES)
_RANGE_START, _RANGE_END = date(2023, 1, 1), date(2030, 12, 31)


@lru_cache(maxsize=1)
def _range_matrix():
    import numpy as np

    n = (_RANGE_END - _RANGE_START).days + 1
    days = [_RANGE_START + timedelta(days=i) for i in range(n)]
    m = np.array([[category_multiplier(c, d) * weather_multiplier(c, d) for c in CAT_KEYS] for d in days])
    foot = np.array([footfall(d) for d in days])
    return m * foot[:, None]


def total_multipliers(mix: dict[str, float], days) -> "np.ndarray":  # noqa: F821
    """Vectorised total_multiplier for many days."""
    import numpy as np

    m = _range_matrix()
    idx = np.array([(d - _RANGE_START).days for d in days])
    vec = np.array([mix.get(c, 0.0) for c in CAT_KEYS])
    if len(idx) and (idx.min() < 0 or idx.max() >= len(m)):
        return np.array([total_multiplier(mix, d) for d in days])
    return m[idx] @ vec
