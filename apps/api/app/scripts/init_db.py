"""Create all tables.   python -m app.scripts.init_db [--drop]"""

from __future__ import annotations

import argparse
import asyncio

from ..core.db import Base, engine
from .. import models  # noqa: F401  (register tables)


async def init(drop: bool = False) -> None:
    async with engine.begin() as conn:
        if drop:
            await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--drop", action="store_true", help="drop existing tables first")
    a = ap.parse_args()
    asyncio.run(init(a.drop))
    print("tables ready" + (" (dropped first)" if a.drop else ""))


if __name__ == "__main__":
    main()
