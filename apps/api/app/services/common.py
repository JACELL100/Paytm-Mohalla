from __future__ import annotations

import math

from ..core import mlpath  # noqa: F401
from ..models import Sku
from ml.festivals import CATEGORIES  # noqa: E402
from ml.forecast_simple import fmt_inr  # noqa: E402,F401


def sku_dict(s: Sku) -> dict:
    return {"id": str(s.id), "name": s.name, "category": s.category, "case_size": s.case_size, "emoji": s.emoji,
            "base_case_price_paise": s.case_price_paise}


def trust_band(score: int) -> str:
    if score >= 750:
        return "Excellent"
    if score >= 650:
        return "Good"
    return "Building"


def category_meta(cat: str) -> dict:
    return CATEGORIES.get(cat, {"en": cat, "hi": cat, "emoji": "📦"})


def haversine_km(a_lat, a_lng, b_lat, b_lng) -> float:
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def discounted_price(base_paise: int, disc_bps: int) -> int:
    return base_paise * (10_000 - disc_bps) // 10_000


def fee_of(amount_paise: int, fee_bps: int) -> int:
    return amount_paise * fee_bps // 10_000
