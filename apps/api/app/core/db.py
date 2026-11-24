from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from sqlalchemy.types import TypeDecorator

from .config import API_DIR, settings


class TZDateTime(TypeDecorator):
    """timestamptz on Postgres; on SQLite stored as naive UTC and returned as aware UTC."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        value = value.astimezone(timezone.utc)
        if dialect.name == "sqlite":
            value = value.replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            value = datetime.fromisoformat(value)
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


class Base(DeclarativeBase):
    pass


def _psycopg_available() -> bool:
    try:
        import psycopg  # noqa: F401

        return True
    except ImportError:
        return False


def pg_driver() -> str:
    """psycopg (v3) sends parse+bind+execute in ONE round trip; asyncpg needs two (prepare, then execute),
    which doubles latency per statement against a remote pooler. auto = psycopg when installed."""
    d = (settings.pg_driver or "auto").lower()
    if d == "auto":
        return "psycopg" if _psycopg_available() else "asyncpg"
    return d


def _make_engine(url: str, driver: str | None = None):
    kwargs: dict = {"echo": settings.db_echo}
    for prefix in ("postgres://", "postgresql://", "postgresql+asyncpg://", "postgresql+psycopg://"):
        if url.startswith(prefix):  # Supabase shows plain URLs; pick the async driver here
            url = f"postgresql+{driver or pg_driver()}://" + url[len(prefix):]
            break
    if url.startswith("sqlite"):
        # relative sqlite paths are relative to apps/api so CLI scripts and uvicorn agree
        prefix = "sqlite+aiosqlite:///"
        path = url[len(prefix):] if url.startswith(prefix) else None
        if path and path.startswith("./"):
            url = prefix + (API_DIR / path[2:]).as_posix()
        kwargs.update(poolclass=NullPool, connect_args={"timeout": 30})
    elif url.startswith("postgresql+asyncpg"):
        # Supabase pooler (transaction mode): no statement caches + unique prepared statement names
        if "prepared_statement_cache_size" not in url:
            url += ("&" if "?" in url else "?") + "prepared_statement_cache_size=0"
        kwargs.update(connect_args={"statement_cache_size": 0,
                                    "prepared_statement_name_func": lambda: f"__mohalla_{uuid.uuid4().hex}__"},
                      # no pre-ping: it would cost one extra network round trip per request
                      pool_size=5, max_overflow=5, pool_recycle=240)
    elif url.startswith("postgresql+psycopg"):
        # no server-side prepared statements (transaction pooler); no pre-ping (extra round trip)
        kwargs.update(connect_args={"prepare_threshold": None}, pool_size=5, max_overflow=5, pool_recycle=240)
    eng = create_async_engine(url, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(eng.sync_engine, "connect")
        def _pragmas(dbapi_conn, _rec):  # noqa: ANN001
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.execute("PRAGMA busy_timeout=30000")
            cur.close()
    return eng


engine = _make_engine(settings.database_url)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def ensure_loop_compatible() -> None:
    """psycopg's async mode can't run on Windows' ProactorEventLoop (plain `uvicorn` on Windows).
    In that case fall back to asyncpg; `python -m app` starts uvicorn on a selector loop instead."""
    global engine
    import asyncio
    import logging
    import sys

    if (sys.platform == "win32" and engine.url.drivername == "postgresql+psycopg"
            and isinstance(asyncio.get_running_loop(), asyncio.ProactorEventLoop)):
        logging.getLogger("mohalla.db").warning(
            "Windows ProactorEventLoop: using asyncpg (2 round trips per statement). "
            "Start with `python -m app --port 8000` to use the faster psycopg driver.")
        old = engine
        engine = _make_engine(settings.database_url, driver="asyncpg")
        SessionLocal.configure(bind=engine)
        await old.dispose()


async def get_session():
    async with SessionLocal() as s:
        yield s
