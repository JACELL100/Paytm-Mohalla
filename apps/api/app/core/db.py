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


def _make_engine(url: str):
    kwargs: dict = {"echo": settings.db_echo}
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):  # Supabase shows plain URLs; we need the async driver
            url = "postgresql+asyncpg://" + url[len(prefix):]
    if url.startswith("sqlite"):
        # relative sqlite paths are relative to apps/api so CLI scripts and uvicorn agree
        prefix = "sqlite+aiosqlite:///"
        path = url[len(prefix):] if url.startswith(prefix) else None
        if path and path.startswith("./"):
            url = prefix + (API_DIR / path[2:]).as_posix()
        kwargs.update(poolclass=NullPool, connect_args={"timeout": 30})
    elif url.startswith("postgresql+asyncpg"):
        # Supabase pooler (PgBouncer transaction mode): no statement caches + unique prepared statement names
        if "prepared_statement_cache_size" not in url:
            url += ("&" if "?" in url else "?") + "prepared_statement_cache_size=0"
        kwargs.update(connect_args={"statement_cache_size": 0,
                                    "prepared_statement_name_func": lambda: f"__mohalla_{uuid.uuid4().hex}__"},
                      pool_size=5, max_overflow=5, pool_pre_ping=True)
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


async def get_session():
    async with SessionLocal() as s:
        yield s
