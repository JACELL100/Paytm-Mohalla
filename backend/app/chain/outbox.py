"""Outbox: the API writes rows to chain_txs; the relayer sends them. The API never waits on the chain."""

from __future__ import annotations

import hashlib
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..models import ChainTx
from .config import explorer_tx


def fake_hash(seed: str) -> str:
    return "0x" + hashlib.sha256(f"mohalla-sim:{seed}".encode()).hexdigest()


def new_tx(kind: str, ref: dict, depends_on: int | None = None, simulated: bool = False, at=None) -> ChainTx:
    """Build an outbox row (not yet added). `simulated=True` records it as already done (seed/history)."""
    now = at or clock.now()
    tx = ChainTx(kind=kind, ref=ref, status="pending", depends_on=depends_on, created_at=now, updated_at=now,
                 attempts=0)
    if simulated:
        tx.status = "simulated"
        tx.tx_hash = fake_hash(f"{kind}:{sorted(ref.items())}:{uuid.uuid4()}")
    return tx


async def enqueue(session: AsyncSession, kind: str, ref: dict, depends_on: int | None = None,
                  simulated: bool = False, flush: bool = False) -> ChainTx:
    """Queue a chain transaction. Rows are inserted with the caller's next flush/commit;
    pass flush=True only when the new row's id is needed right away (e.g. for depends_on)."""
    tx = new_tx(kind, ref, depends_on, simulated)
    session.add(tx)
    if flush:
        await session.flush()
    return tx


def tx_ref(tx: ChainTx | None) -> dict | None:
    if tx is None:
        return None
    return {
        "id": str(tx.id),
        "kind": tx.kind,
        "status": tx.status,
        "tx_hash": tx.tx_hash,
        "explorer_url": explorer_tx(tx.tx_hash) if tx.status in ("sent", "confirmed", "failed") else None,
        "created_at": clock.iso(tx.created_at),
    }
