"""Pool Credit (rule-based, explainable). In production an NBFC partner decides; Paytm distributes.

avg_inflow = mean of the last 90 days of daily_sales
volatility = coefficient of variation of daily_sales
limit      = min(0.30 x 30 x avg_inflow, 3 x commitment_amount)
rate_bps   = 1800 + 1200 x clamp(volatility, 0, 1) - 300 x (trust_score > 750)     (annual)
repayment  = auto-deduct daily_deduct_bps of daily Paytm settlements over 30 days
"""

from __future__ import annotations

import math

import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..models import Loan, Merchant
from . import forecasts, trust
from .common import fmt_inr

TENURE_DAYS = 30
MIN_TRUST = 550


async def offer(session: AsyncSession, merchant: Merchant, amount_paise: int) -> dict:
    days, vals = await forecasts.sales_series(session, merchant.id)
    today = clock.today()
    recent = np.array([v for d, v in zip(days, vals) if d < today][-90:], dtype=float)
    avg = float(recent.mean()) if len(recent) else 0.0
    vol = float(recent.std() / avg) if avg > 0 else 1.0
    score = await trust.stored_score(session, merchant)
    amount_paise = max(0, int(amount_paise))
    limit = int(min(0.30 * 30 * avg, 3 * amount_paise)) if amount_paise else int(0.30 * 30 * avg)
    rate_bps = int(round(1800 + 1200 * min(max(vol, 0.0), 1.0) - (300 if score > 750 else 0)))
    interest = amount_paise * rate_bps / 10_000 * TENURE_DAYS / 365
    daily_repay = (amount_paise + interest) / TENURE_DAYS
    daily_deduct_bps = max(50, int(math.ceil(daily_repay / avg * 10_000))) if avg > 0 else 10_000
    eligible = amount_paise > 0 and amount_paise <= limit and score >= MIN_TRUST and daily_deduct_bps <= 2500
    rate_pct = rate_bps / 100
    ded_pct = daily_deduct_bps / 100
    if eligible:
        reason_en = (f"Your Paytm sales average {fmt_inr(avg)}/day over 90 days (variation {vol:.0%}) and your "
                     f"trust score is {score}. Limit {fmt_inr(limit)} at {rate_pct:.1f}% a year; about {ded_pct:.1f}% "
                     f"of each day's settlement for {TENURE_DAYS} days.")
        reason_hi = (f"पिछले 90 दिन में आपकी Paytm बिक्री औसतन {fmt_inr(avg)} रोज़ रही, ट्रस्ट स्कोर {score} है। "
                     f"लिमिट {fmt_inr(limit)}, ब्याज {rate_pct:.1f}% सालाना; {TENURE_DAYS} दिन तक रोज़ के सेटलमेंट से "
                     f"लगभग {ded_pct:.1f}% कटेगा।")
    else:
        why_en = ("amount is above your limit" if amount_paise > limit else
                  "trust score is too low" if score < MIN_TRUST else
                  "repayment would take too much of your daily sales" if daily_deduct_bps > 2500 else
                  "no amount requested")
        why_hi = ("रकम आपकी लिमिट से ज़्यादा है" if amount_paise > limit else
                  "ट्रस्ट स्कोर कम है" if score < MIN_TRUST else
                  "किस्त आपकी रोज़ की बिक्री के हिसाब से ज़्यादा होगी" if daily_deduct_bps > 2500 else
                  "कोई रकम नहीं बताई गई")
        reason_en = f"Not eligible right now: {why_en}. Limit {fmt_inr(limit)}."
        reason_hi = f"अभी क्रेडिट नहीं मिल सकता: {why_hi}। लिमिट {fmt_inr(limit)}।"
    return {"amount_paise": amount_paise, "limit_paise": limit, "rate_bps": rate_bps, "tenure_days": TENURE_DAYS,
            "daily_deduct_bps": daily_deduct_bps, "reason_en": reason_en, "reason_hi": reason_hi,
            "eligible": bool(eligible),
            "_decision": {"avg_inflow_paise": int(avg), "volatility": round(vol, 3), "trust_score": score}}


def public(o: dict | None) -> dict | None:
    if o is None:
        return None
    return {k: v for k, v in o.items() if not k.startswith("_")}


def loan_dict(loan: Loan | None) -> dict | None:
    if loan is None:
        return None
    return {"id": str(loan.id), "amount_paise": loan.amount_paise, "rate_bps": loan.rate_bps,
            "tenure_days": loan.tenure_days, "daily_deduct_bps": loan.daily_deduct_bps, "status": loan.status}


def make_loan(merchant: Merchant, o: dict, pool_id) -> Loan:
    return Loan(merchant_id=merchant.id, pool_id=pool_id, amount_paise=o["amount_paise"], rate_bps=o["rate_bps"],
                tenure_days=o["tenure_days"], daily_deduct_bps=o["daily_deduct_bps"], status="active",
                decision={**o.get("_decision", {}), "reason_en": o["reason_en"]}, created_at=clock.now())
