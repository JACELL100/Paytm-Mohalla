"""Seed the database.

    python -m app.scripts.seed            # drop + create tables, load synthetic data, build the demo state
    python -m app.scripts.seed --reset    # only rebuild the demo state (same as POST /demo/reset)
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import time

from ..core.loops import use_selector_policy
from ..core.db import SessionLocal, engine
from ..services import seed
from .init_db import init


async def run(reset_only: bool, seed_value: int) -> None:
    t0 = time.time()
    if not reset_only:
        await init(drop=True)
    async with SessionLocal() as s:
        if not reset_only:
            await seed.seed_static(s, seed_value)
        info = await seed.reset(s)
    await engine.dispose()
    print(f"seeded in {time.time() - t0:.1f}s: {info}")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="only rebuild the dynamic demo state")
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    use_selector_policy()
    asyncio.run(run(a.reset, a.seed))


if __name__ == "__main__":
    main()
