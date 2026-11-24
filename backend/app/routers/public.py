from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..core.config import settings
from ..core.db import get_session
from ..models import Distributor, Merchant
from ..services.seed import DEMO_DISTRIBUTOR_ID, DEMO_MERCHANT_ID

router = APIRouter(tags=["public"])


@router.get("/health")
async def health():
    return {"status": "ok", "auth_mode": settings.effective_auth_mode, "chain_mode": settings.chain_mode,
            "llm": settings.llm_enabled, "stt": settings.llm_enabled, "demo_mode": settings.demo_mode}


@router.get("/demo/accounts")
async def demo_accounts(session: AsyncSession = Depends(get_session)):
    if not settings.demo_mode:
        return []
    m = await session.get(Merchant, DEMO_MERCHANT_ID)
    d = await session.get(Distributor, DEMO_DISTRIBUTOR_ID)
    return [
        {"token": "dev-merchant", "role": "merchant", "display_name": m.owner_name if m else "Ramesh Gupta",
         "subtitle": f"{m.name if m else 'Ramesh General Store'} · kirana · Marol, Andheri East"},
        {"token": "dev-distributor", "role": "distributor", "display_name": d.name if d else "Shree Ganesh Distributors",
         "subtitle": "Cold drinks, snacks & dairy distributor · Andheri East"},
        {"token": "dev-ops", "role": "ops", "display_name": "Paytm Ops",
         "subtitle": "Mohalla ops console + Demo Director"},
    ]


@router.get("/demo/state")
async def demo_state():
    return {"now": clock.iso(clock.now()), "demo_mode": settings.demo_mode,
            "clock_offset_minutes": clock.clock.offset_minutes() if settings.demo_mode else 0}


@router.get("/meta/attributions")
async def attributions():
    """Open data used by the synthetic world (details: backend/ml/DATA_SOURCES.md)."""
    return [
        {"text": "© OpenStreetMap contributors", "url": "https://www.openstreetmap.org/copyright",
         "licence": "ODbL 1.0", "used_for": "shop locations and types"},
        {"text": "Weather data by Open-Meteo.com", "url": "https://open-meteo.com/", "licence": "CC BY 4.0",
         "used_for": "rain and temperature effects in sales and forecasts"},
        {"text": "Holiday dates: holidays (Python package)", "url": "https://github.com/vacanza/holidays",
         "licence": "MIT", "used_for": "festival calendar"},
    ]
