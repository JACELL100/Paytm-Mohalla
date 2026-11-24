"""Test setup: a throwaway SQLite DB seeded once per session; the demo state is reset before each test.
The demo clock is frozen (DEMO_CLOCK_RATE=0) and background loops are off so tests are deterministic."""

from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="mohalla-test-"))
os.environ.update({
    "DATABASE_URL": f"sqlite+aiosqlite:///{(_tmp / 'test.db').as_posix()}",
    "AUTH_MODE": "dev", "SUPABASE_URL": "", "DEMO_MODE": "true", "DEMO_CLOCK_RATE": "0", "CHAIN_MODE": "off",
    "GROQ_API_KEY": "", "BACKGROUND_JOBS": "false", "DEMO_NOW": "2026-12-26T09:00:00+05:30",
    "DEMO_POOL_DEADLINE_MINUTES": "3",
})

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.scripts.init_db import init  # noqa: E402
from app.services import seed  # noqa: E402


def _seed_once() -> None:
    async def go():
        await init(drop=True)
        async with SessionLocal() as s:
            await seed.seed_static(s)
    asyncio.run(go())


@pytest.fixture(scope="session", autouse=True)
def seeded_db():
    _seed_once()
    yield


@pytest_asyncio.fixture
async def client():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/demo/reset", headers=auth("ops"))
        assert r.status_code == 200, r.text
        yield c


def auth(role: str) -> dict:
    return {"Authorization": f"Bearer dev-{role}"}


M, D, O = auth("merchant"), auth("distributor"), auth("ops")
