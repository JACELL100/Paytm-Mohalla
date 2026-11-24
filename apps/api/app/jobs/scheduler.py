"""Background loops (asyncio tasks inside the API process):
- relayer:  every RELAYER_INTERVAL_SECONDS (0.5 s) - sends / simulates queued chain txs
- closer:   every JOB_INTERVAL_SECONDS (10 s)     - fails open pools past their deadline
"""

from __future__ import annotations

import asyncio
import logging

from ..chain import relayer
from ..core.config import settings
from ..core.db import SessionLocal
from ..services import pools

log = logging.getLogger("mohalla.jobs")


async def _loop(name: str, interval: float, fn) -> None:
    while True:
        try:
            async with SessionLocal() as s:
                await fn(s)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001 - keep the loop alive
            log.warning("%s loop error: %s", name, e)
        await asyncio.sleep(interval)


def start() -> list[asyncio.Task]:
    if not settings.background_jobs:
        return []
    return [
        asyncio.create_task(_loop("relayer", settings.relayer_interval_seconds, relayer.tick)),
        asyncio.create_task(_loop("closer", settings.job_interval_seconds, pools.close_expired)),
    ]


async def stop(tasks: list[asyncio.Task]) -> None:
    for t in tasks:
        t.cancel()
    for t in tasks:
        try:
            await t
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
