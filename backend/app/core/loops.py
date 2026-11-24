"""Event-loop helpers. psycopg's async mode needs a selector loop; Windows defaults to Proactor."""

from __future__ import annotations

import asyncio
import sys


def selector_loop() -> asyncio.AbstractEventLoop:
    """uvicorn loop factory: `uvicorn app.main:app --loop app.core.loops:selector_loop`."""
    return asyncio.SelectorEventLoop()


def use_selector_policy() -> None:
    """For CLI scripts that call asyncio.run() (Python 3.11 has no loop_factory there)."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
