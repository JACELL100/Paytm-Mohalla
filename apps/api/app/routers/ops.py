from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..chain.outbox import tx_ref
from ..core.auth import CurrentUser, ops_user
from ..core.db import get_session
from ..models import ChainTx, Pool
from ..services import ops, pools

router = APIRouter(prefix="/ops", tags=["ops"])


@router.get("/kpis")
async def kpis(user: CurrentUser = Depends(ops_user), session: AsyncSession = Depends(get_session)):
    return await ops.kpis(session)  # expired pools are closed by the background closer within 10 s


@router.get("/hexes")
async def hexes(user: CurrentUser = Depends(ops_user), session: AsyncSession = Depends(get_session)):
    return await ops.hexes(session)


@router.get("/pools")
async def ops_pools(user: CurrentUser = Depends(ops_user), session: AsyncSession = Depends(get_session)):
    """3 statements: auth, pools, members."""
    views = await pools.fresh_views(session, Pool.status != "draft")
    order = {"open": 0, "funded": 1, "settled": 2, "failed": 3}
    views = sorted(views, key=lambda v: (order.get(v.pool.status, 9), -v.pool.created_at.timestamp()))[:100]
    return await pools.serialize_many(session, views, viewer=False)


@router.get("/txs")
async def ops_txs(user: CurrentUser = Depends(ops_user), session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(ChainTx).order_by(ChainTx.id.desc()).limit(20))).scalars().all()
    return [tx_ref(t) for t in rows]
