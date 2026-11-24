"""Pool lifecycle. The DB is the source of truth for the UI; every state change also queues a
chain transaction in the outbox (create_pool, commit, mark_failed, refund, deliver, attest).

Performance: on Supabase every statement is a network round trip, so reads go through `load_views`
(one joined query for the pools + the viewer's invite/commitment/delivery/loan/txs, one query for all
members) and writes are batched (one flush for outbox rows, executemany updates, no per-row lookups).
Static data (SKUs, distributors, shop names/locations) comes from `cache.static()`.
"""

from __future__ import annotations

import asyncio
import random
import secrets
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import and_, bindparam, case, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.orm.util import identity_key

from ..chain.config import explorer_address, fee_bps, pool_id_hex, pools_address
from ..chain.outbox import new_tx, tx_ref
from ..core import clock
from ..core.config import settings
from ..models import (
    ChainTx,
    Delivery,
    Distributor,
    Inventory,
    Loan,
    Merchant,
    Pool,
    PoolCommitment,
    PoolInvite,
    Scheme,
    Sku,
)
from . import cache, nudges
from .common import discounted_price, fee_of, haversine_km, sku_dict
from .credit import loan_dict

# Serialises every change to pool counters (single API process). On Postgres we also lock the row.
POOL_LOCK = asyncio.Lock()
PRIVACY_MIN_SHOPS = 5


# ------------------------------------------------------------------ reading
@dataclass
class PoolView:
    pool: Pool
    create_tx: ChainTx | None = None
    members: list[PoolCommitment] = field(default_factory=list)  # newest first
    invite: PoolInvite | None = None  # viewer's
    mine: PoolCommitment | None = None
    delivery: Delivery | None = None
    loan: Loan | None = None
    commit_tx: ChainTx | None = None

    def visible_to_viewer(self) -> bool:
        """Privacy rule: merchants only see pools with 5+ shops, unless they were invited or joined."""
        return self.invite is not None or self.mine is not None or len(self.members) >= PRIVACY_MIN_SHOPS


def _uuid(pool_id) -> uuid.UUID:
    try:
        return uuid.UUID(str(pool_id))
    except ValueError as e:
        raise HTTPException(404, "Pool not found") from e


async def load_views(session: AsyncSession, where=None, viewer_id: uuid.UUID | None = None,
                     members: bool | Callable[[PoolView], bool] = True, for_update: bool = False,
                     refresh: bool = False) -> list[PoolView]:
    """Pools matching `where` with everything serialize() needs, in 2 statements."""
    CreateTx = aliased(ChainTx, name="create_tx")
    q = select(Pool, CreateTx).outerjoin(CreateTx, CreateTx.id == Pool.create_tx_id)
    if viewer_id is not None:
        MyC = aliased(PoolCommitment, name="my_c")
        CommitTx = aliased(ChainTx, name="commit_tx")
        q = (q.add_columns(PoolInvite, MyC, Delivery, Loan, CommitTx)
             .outerjoin(PoolInvite, and_(PoolInvite.pool_id == Pool.id, PoolInvite.merchant_id == viewer_id))
             .outerjoin(MyC, and_(MyC.pool_id == Pool.id, MyC.merchant_id == viewer_id))
             .outerjoin(Delivery, and_(Delivery.pool_id == Pool.id, Delivery.merchant_id == viewer_id))
             .outerjoin(Loan, Loan.id == MyC.loan_id)
             .outerjoin(CommitTx, CommitTx.id == MyC.tx_id))
    if where is not None:
        q = q.where(where)
    if for_update and not settings.is_sqlite:
        q = q.with_for_update(of=Pool)
    if refresh:
        q = q.execution_options(populate_existing=True)
    views = []
    for row in (await session.execute(q)).all():
        v = PoolView(pool=row[0], create_tx=row[1])
        if viewer_id is not None:
            v.invite, v.mine, v.delivery, v.loan, v.commit_tx = row[2], row[3], row[4], row[5], row[6]
        views.append(v)
    want = [v for v in views if (members(v) if callable(members) else members)]
    if want:
        by_pool = {v.pool.id: v for v in want}
        mq = (select(PoolCommitment).where(PoolCommitment.pool_id.in_(list(by_pool)))
              .order_by(PoolCommitment.created_at.desc()))
        if refresh:
            mq = mq.execution_options(populate_existing=True)
        for c in (await session.execute(mq)).scalars():
            by_pool[c.pool_id].members.append(c)
    return views


async def fresh_views(session: AsyncSession, where=None, viewer_id: uuid.UUID | None = None,
                      members: bool | Callable[[PoolView], bool] = True) -> list[PoolView]:
    """load_views, but if a loaded pool is open past its deadline, fail it first (all-or-nothing)."""
    views = await load_views(session, where, viewer_id, members)
    now = clock.now()
    if any(v.pool.status == "open" and v.pool.deadline < now for v in views):
        await close_expired(session)
        views = await load_views(session, where, viewer_id, members, refresh=True)
    return views


async def get_view(session: AsyncSession, pool_id, viewer_id: uuid.UUID | None = None) -> PoolView:
    views = await fresh_views(session, Pool.id == _uuid(pool_id), viewer_id)
    if not views:
        raise HTTPException(404, "Pool not found")
    return views[0]


async def get_pool(session: AsyncSession, pool_id: str | uuid.UUID, for_update: bool = False) -> Pool:
    q = select(Pool).where(Pool.id == _uuid(pool_id))
    if for_update and not settings.is_sqlite:
        q = q.with_for_update()
    p = (await session.execute(q)).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Pool not found")
    return p


async def commitments(session: AsyncSession, pool_id: uuid.UUID) -> list[PoolCommitment]:
    return list((await session.execute(select(PoolCommitment).where(PoolCommitment.pool_id == pool_id)
                                       .order_by(PoolCommitment.created_at.desc()))).scalars())


def serialize_view(v: PoolView, st: cache.Static, viewer: bool) -> dict:
    """Pure function: no database access."""
    pool = v.pool
    sku = st.skus[pool.sku_id]
    dist = st.distributors[pool.distributor_id]
    mine = None
    if viewer:
        c, inv, d = v.mine, v.invite, v.delivery
        status = None
        if c:
            if c.status == "refunded":
                status = "refunded"
            elif d:
                status = d.status
            elif pool.status in ("funded", "settled"):
                status = "pending"
        r = inv.reason if inv else None
        mine = {
            "invited": inv is not None, "suggested_cases": inv.suggested_cases if inv else None,
            "reason": {"event": r.get("event") or "", "uplift": r.get("uplift", 1.0),
                       "stock_units": r.get("stock_units", 0), "need_cases": r.get("need_cases", 0)} if r else None,
            "committed_cases": c.cases if c else 0, "amount_paise": c.amount_paise if c else 0,
            "loan": loan_dict(v.loan), "delivery_status": status, "commit_tx": tx_ref(v.commit_tx),
        }
    addr = pools_address()
    return {
        "id": str(pool.id), "sku": sku_dict(sku), "distributor": {"id": str(dist.id), "name": dist.name},
        "target_cases": pool.target_cases, "committed_cases": pool.committed_cases, "member_count": len(v.members),
        "base_case_price_paise": pool.base_case_price_paise, "case_price_paise": pool.case_price_paise,
        "disc_bps": pool.disc_bps, "savings_per_case_paise": pool.base_case_price_paise - pool.case_price_paise,
        "slabs": [{"min_cases": int(s["min_cases"]), "disc_bps": int(s["disc_bps"])} for s in pool.slabs],
        "deadline": clock.iso(pool.deadline), "delivery_deadline": clock.iso(pool.delivery_deadline),
        "status": pool.status,
        "center": {"lat": pool.center_lat, "lng": pool.center_lng, "area_name": pool.area_name},
        "mine": mine,
        "chain": {"pool_id_hex": pool.chain_id_hex, "contract_address": addr, "contract_url": explorer_address(addr),
                  "create_tx": tx_ref(v.create_tx)},
        "recent_joins": [{"at": clock.iso(c.created_at), "cases": c.cases} for c in v.members[:10]],
    }


async def serialize_many(session: AsyncSession, views: list[PoolView], viewer: bool) -> list[dict]:
    st = await cache.static(session)
    return [serialize_view(v, st, viewer) for v in views]


async def serialize(session: AsyncSession, pool: Pool, viewer: Merchant | None) -> dict:
    """One pool (2 statements). Prefer load_views + serialize_many for lists."""
    v = (await load_views(session, Pool.id == pool.id, viewer.id if viewer else None))[0]
    return (await serialize_many(session, [v], viewer is not None))[0]


async def merchant_views(session: AsyncSession, m: Merchant) -> list[PoolView]:
    """Every pool this shop was invited to or joined (any status), members only for live ones."""
    where = or_(Pool.id.in_(select(PoolInvite.pool_id).where(PoolInvite.merchant_id == m.id)),
                Pool.id.in_(select(PoolCommitment.pool_id).where(PoolCommitment.merchant_id == m.id)))
    return await fresh_views(session, where, m.id, members=lambda v: v.pool.status in ("open", "funded"))


def split_merchant_views(views: list[PoolView]) -> tuple[list[PoolView], list[PoolView], dict]:
    """(open invites not yet joined, active pools joined & not delivered, savings summary)."""
    invites = sorted([v for v in views if v.invite and not v.mine and v.pool.status == "open"],
                     key=lambda v: v.pool.deadline)
    active = sorted([v for v in views if v.mine and v.mine.status == "committed"
                     and v.pool.status in ("open", "funded")], key=lambda v: v.pool.deadline)
    joined = [v for v in views if v.mine and v.mine.status != "refunded"]
    total = sum(v.mine.cases * (v.pool.base_case_price_paise - v.pool.case_price_paise) for v in joined)
    return invites, active, {"total_paise": int(total), "pools_joined": len(joined)}


async def savings_summary(session: AsyncSession, m: Merchant) -> dict:
    return split_merchant_views(await merchant_views(session, m))[2]


async def merchant_pools(session: AsyncSession, m: Merchant) -> tuple[list[Pool], list[Pool]]:
    invites, active, _ = split_merchant_views(await merchant_views(session, m))
    return [v.pool for v in invites], [v.pool for v in active]


async def visible_to_merchant(session: AsyncSession, pool: Pool, m: Merchant) -> bool:
    v = (await load_views(session, Pool.id == pool.id, m.id))[0]
    return v.visible_to_viewer()


# ------------------------------------------------------------------ helpers for batched writes
def _orm_merchant(session: AsyncSession, mid: uuid.UUID) -> Merchant | None:
    """The Merchant ORM object if this session already holds it (so we update it, not behind its back)."""
    return session.sync_session.identity_map.get(identity_key(Merchant, mid))


async def _adjust_balances(session: AsyncSession, deltas: dict[uuid.UUID, int], floor_zero: bool = False) -> None:
    """Add `delta` paise to each shop's wallet in ONE executemany statement (ORM objects in the session are
    updated in memory instead)."""
    rows = []
    for mid, delta in deltas.items():
        m = _orm_merchant(session, mid)
        if m is not None:
            m.wallet_balance_paise = max(0, m.wallet_balance_paise + delta) if floor_zero else m.wallet_balance_paise + delta
        else:
            rows.append({"b_id": mid, "b_delta": delta})
    if rows:
        t = Merchant.__table__
        new = t.c.wallet_balance_paise + bindparam("b_delta")
        if floor_zero:
            new = case((new < 0, 0), else_=new)
        await session.execute(update(t).where(t.c.id == bindparam("b_id")).values(wallet_balance_paise=new), rows)


async def _set_invite_status(session: AsyncSession, pool_id: uuid.UUID, merchant_ids, status: str) -> None:
    ids = list(merchant_ids)
    if ids:
        await session.execute(update(PoolInvite.__table__)
                              .where(PoolInvite.pool_id == pool_id, PoolInvite.merchant_id.in_(ids))
                              .values(status=status))


# ------------------------------------------------------------------ creating
async def create_pool(session: AsyncSession, *, sku: Sku, distributor: Distributor, scheme: Scheme | None,
                      target: int, disc_bps: int, slabs: list, center_lat: float, center_lng: float,
                      area_name: str, cluster_h3: str | None, deadline: datetime, delivery_deadline: datetime,
                      status: str = "open", created_at: datetime | None = None, chain: bool = True,
                      tx_simulated: bool = False) -> Pool:
    import h3

    pid = uuid.uuid4()
    p = Pool(id=pid, chain_id_hex=pool_id_hex(pid), sku_id=sku.id, distributor_id=distributor.id,
             scheme_id=scheme.id if scheme else None, target_cases=target, committed_cases=0,
             base_case_price_paise=sku.case_price_paise, case_price_paise=discounted_price(sku.case_price_paise, disc_bps),
             disc_bps=disc_bps, slabs=slabs, center_h3=h3.latlng_to_cell(center_lat, center_lng, 8),
             cluster_h3=cluster_h3, center_lat=center_lat, center_lng=center_lng, area_name=area_name,
             deadline=deadline, delivery_deadline=delivery_deadline, status=status,
             created_at=created_at or clock.now())
    if chain:
        tx = new_tx("create_pool", {"pool_id": str(pid), "pool_id_hex": p.chain_id_hex,
                                    "supplier": distributor.wallet_address, "unit_price": p.case_price_paise,
                                    "target": target}, simulated=tx_simulated)
        session.add(tx)
        await session.flush()  # the tx id goes into the pool row (no later UPDATE)
        p.create_tx_id = tx.id
    session.add(p)
    await session.flush()
    cache.bump()
    return p


# ------------------------------------------------------------------ committing
@dataclass
class Join:
    merchant: object  # ORM Merchant or cache.MerchantInfo (needs id, wallet_index)
    cases: int
    loan: Loan | None = None
    at: datetime | None = None


async def commit_many(session: AsyncSession, pool: Pool, joins: list[Join], members: list[PoolCommitment],
                      simulated_tx: bool = False, notify: bool = True) -> list[tuple[PoolCommitment, ChainTx]]:
    """Caller holds POOL_LOCK and validated the requests. `members` = the pool's current commitments
    (newest first); new commitments are prepended. Statements: outbox insert, commitments insert,
    invites update, balances update (+ pool/merchant updates at the caller's commit)."""
    if not joins:
        return []
    txs = []
    for j in joins:
        amount = j.cases * pool.case_price_paise
        txs.append(new_tx("commit", {"pool_id": str(pool.id), "pool_id_hex": pool.chain_id_hex,
                                     "merchant_id": str(j.merchant.id), "wallet_index": j.merchant.wallet_index,
                                     "cases": j.cases, "amount_paise": amount},
                          depends_on=pool.create_tx_id, simulated=simulated_tx, at=j.at))
    session.add_all(txs)
    await session.flush()  # one batched INSERT ... RETURNING id
    out, deltas = [], {}
    for j, tx in zip(joins, txs):
        amount = j.cases * pool.case_price_paise
        c = PoolCommitment(pool_id=pool.id, merchant_id=j.merchant.id, cases=j.cases, amount_paise=amount,
                           loan_id=j.loan.id if j.loan else None, status="committed", tx_id=tx.id,
                           created_at=j.at or clock.now())
        session.add(c)
        out.append((c, tx))
        deltas[j.merchant.id] = deltas.get(j.merchant.id, 0) - amount + (j.loan.amount_paise if j.loan else 0)
        pool.committed_cases += j.cases
    await _adjust_balances(session, deltas, floor_zero=True)
    await _set_invite_status(session, pool.id, deltas.keys(), "joined")
    members[:0] = sorted([c for c, _ in out], key=lambda c: c.created_at, reverse=True)
    if pool.committed_cases >= pool.target_cases:
        await mark_funded(session, pool, members, notify=notify)
    cache.bump()
    return out


async def apply_commit(session: AsyncSession, pool: Pool, m: Merchant, cases: int, loan: Loan | None = None,
                       at: datetime | None = None, simulated_tx: bool = False,
                       members: list[PoolCommitment] | None = None) -> tuple[PoolCommitment, ChainTx]:
    if members is None:
        members = await commitments(session, pool.id)
    return (await commit_many(session, pool, [Join(m, cases, loan, at)], members, simulated_tx))[0]


async def mark_funded(session: AsyncSession, pool: Pool, members: list[PoolCommitment] | None = None,
                      at: datetime | None = None, notify: bool = True) -> None:
    """Funded: one delivery row + one nudge per member (no reads beyond the static cache)."""
    pool.status = "funded"
    pool.funded_at = at or clock.now()
    if members is None:
        members = await commitments(session, pool.id)
    st = await cache.static(session)
    sku, dist = st.skus[pool.sku_id], st.distributors[pool.distributor_id]
    session.add_all([Delivery(pool_id=pool.id, merchant_id=c.merchant_id, qr_nonce=secrets.token_hex(8),
                              status="pending") for c in members])
    if notify:
        for c in members:
            m = st.merchants[c.merchant_id]
            hi, en = nudges.funded_text(m, sku.name, sku.name_hi, pool.target_cases, c.cases, dist.name)
            await nudges.create(session, m, "pool_funded", hi, en, pool.id, llm_ok=False)


async def fail_pool(session: AsyncSession, pool: Pool, members: list[PoolCommitment] | None = None) -> None:
    """All-or-nothing: refund every member (and cancel their Pool Credit)."""
    pool.status = "failed"
    if members is None:
        members = await commitments(session, pool.id)
    mf = new_tx("mark_failed", {"pool_id": str(pool.id), "pool_id_hex": pool.chain_id_hex},
                depends_on=pool.create_tx_id)
    session.add(mf)
    await session.flush()  # refunds depend on its id
    live = [c for c in members if c.status == "committed"]
    loan_ids = [c.loan_id for c in live if c.loan_id]
    loans = {}
    if loan_ids:
        loans = {lo.id: lo for lo in (await session.execute(select(Loan).where(Loan.id.in_(loan_ids)))).scalars()}
    st = await cache.static(session)
    deltas = {}
    for c in live:
        c.status = "refunded"
        delta = c.amount_paise
        lo = loans.get(c.loan_id)
        if lo is not None and lo.status == "active":
            lo.status = "repaid"  # loan cancelled: the refund goes straight back to the lender
            delta -= lo.amount_paise
        deltas[c.merchant_id] = deltas.get(c.merchant_id, 0) + delta
        session.add(new_tx("refund", {"pool_id": str(pool.id), "pool_id_hex": pool.chain_id_hex,
                                      "merchant_id": str(c.merchant_id),
                                      "wallet_index": st.merchants[c.merchant_id].wallet_index,
                                      "amount_paise": c.amount_paise}, depends_on=mf.id))
    await _adjust_balances(session, deltas)
    await _set_invite_status(session, pool.id, deltas.keys(), "invited")
    cache.bump()


async def close_expired(session: AsyncSession) -> int:
    """Open pools past their deadline fail (all-or-nothing). Returns how many were closed."""
    now = clock.now()
    async with POOL_LOCK:
        expired = (await session.execute(select(Pool).where(Pool.status == "open", Pool.deadline < now)
                                         .execution_options(populate_existing=True))).scalars().all()
        if expired:
            by_pool: dict = {p.id: [] for p in expired}
            for c in (await session.execute(select(PoolCommitment)
                                            .where(PoolCommitment.pool_id.in_(list(by_pool))))).scalars():
                by_pool[c.pool_id].append(c)
            for p in expired:
                await fail_pool(session, p, by_pool[p.id])
            await session.commit()
    return len(expired)


async def ensure_fresh(session: AsyncSession, pool: Pool) -> None:
    if pool.status == "open" and pool.deadline < clock.now():
        await close_expired(session)
        await session.refresh(pool)


# ------------------------------------------------------------------ delivery
async def confirm_deliveries(session: AsyncSession, pool: Pool, merchant_ids: list[uuid.UUID],
                             members: list[PoolCommitment] | None = None, at: datetime | None = None,
                             strict: bool = True) -> dict:
    """Caller holds POOL_LOCK. Releases each shop's share to the distributor (minus the Paytm fee).
    Batched: deliveries read 1, outbox insert 1, deliveries/commitments updates, inventory 2-3.
    Returns {merchant_id: {delivery, tx, payout_paise, fee_paise, commitment}}."""
    if pool.status not in ("funded", "settled"):
        raise HTTPException(409, "Pool is not funded yet")
    if members is None:
        members = await commitments(session, pool.id)
    by_m = {c.merchant_id: c for c in members}
    dels = {d.merchant_id: d for d in (await session.execute(select(Delivery)
                                                             .where(Delivery.pool_id == pool.id))).scalars()}
    todo = []
    for mid in merchant_ids:
        d, c = dels.get(mid), by_m.get(mid)
        if not d or not c:
            if strict:
                raise HTTPException(404, "This shop has no delivery in this pool")
            continue
        if d.status != "pending":
            if strict:
                raise HTTPException(409, f"Delivery already {d.status}")
            continue
        todo.append((mid, d, c))
    if not todo:
        return {}
    st = await cache.static(session)
    now = at or clock.now()
    fbps = fee_bps()
    txs = []
    for mid, d, c in todo:
        fee = fee_of(c.amount_paise, fbps)
        txs.append(new_tx("deliver", {"pool_id": str(pool.id), "pool_id_hex": pool.chain_id_hex,
                                      "merchant_id": str(mid), "wallet_index": st.merchants[mid].wallet_index,
                                      "amount_paise": c.amount_paise, "fee_paise": fee}, depends_on=c.tx_id))
    session.add_all(txs)
    await session.flush()
    dist = st.distributors[pool.distributor_id]
    sku = st.skus[pool.sku_id]
    out = {}
    for (mid, d, c), tx in zip(todo, txs):
        fee = fee_of(c.amount_paise, fbps)
        d.status, d.confirmed_at, d.on_time = "delivered", now, now <= pool.delivery_deadline
        d.fee_paise, d.payout_paise, d.tx_id = fee, c.amount_paise - fee, tx.id
        c.status = "delivered"
        if settings.chain_mode == "sepolia":
            m = st.merchants[mid]
            session.add(new_tx("attest", {"pool_id": str(pool.id), "pool_id_hex": pool.chain_id_hex,
                                          "merchant_id": str(mid), "merchant": m.wallet_address,
                                          "supplier": dist.wallet_address, "cases": c.cases,
                                          "on_time": bool(d.on_time), "amount_paise": c.amount_paise},
                               depends_on=tx.id))
        out[mid] = {"delivery": d, "tx": tx, "payout_paise": d.payout_paise, "fee_paise": fee, "commitment": c}
    # stock arrives
    have = {r[0] for r in (await session.execute(select(Inventory.merchant_id).where(
        Inventory.sku_id == sku.id, Inventory.merchant_id.in_([t[0] for t in todo])))).all()}
    ups = [{"b_m": mid, "b_add": c.cases * sku.case_size, "b_at": now} for mid, _d, c in todo if mid in have]
    if ups:
        t = Inventory.__table__
        await session.execute(update(t).where(t.c.merchant_id == bindparam("b_m"), t.c.sku_id == sku.id)
                              .values(qty_units=t.c.qty_units + bindparam("b_add"), updated_at=bindparam("b_at")), ups)
    session.add_all([Inventory(merchant_id=mid, sku_id=sku.id, qty_units=c.cases * sku.case_size, seed_qty_units=0,
                               source="pool", updated_at=now) for mid, _d, c in todo if mid not in have])
    if all(d.status != "pending" for d in dels.values()):
        pool.status, pool.settled_at = "settled", now
    cache.bump()
    return out


async def confirm_delivery(session: AsyncSession, pool: Pool, m: Merchant, at: datetime | None = None,
                           members: list[PoolCommitment] | None = None) -> dict:
    return (await confirm_deliveries(session, pool, [m.id], members, at))[m.id]


# ------------------------------------------------------------------ demo: other shops join
async def simulate_joins(session: AsyncSession, pool: Pool, fill: bool = True, count: int | None = None,
                         members: list[PoolCommitment] | None = None) -> int:
    """Caller holds POOL_LOCK. Seeded shops commit until the target is reached (or `count` shops joined)."""
    if pool.status != "open":
        raise HTTPException(409, f"Pool is {pool.status}")
    if members is None:
        members = await commitments(session, pool.id)
    st = await cache.static(session)
    sku = st.skus[pool.sku_id]
    committed = {c.merchant_id for c in members}
    claimed = await cache.claimed(session)
    invites = (await session.execute(select(PoolInvite.merchant_id, PoolInvite.suggested_cases)
                                     .where(PoolInvite.pool_id == pool.id))).all()
    cands: list[tuple] = []
    seen = set()
    for mid, suggested in sorted(invites, key=lambda t: st.merchants[t[0]].shop_no):
        mi = st.merchants[mid]
        if mid in committed or mi.is_demo or mid in claimed:
            continue
        cands.append((mi, suggested))
        seen.add(mid)
    others = [st.merchants[mid] for mid in st.stockists.get(sku.category, set())
              if mid not in committed and mid not in seen and mid not in claimed and not st.merchants[mid].is_demo]
    others.sort(key=lambda m: haversine_km(pool.center_lat, pool.center_lng, m.lat, m.lng))
    cands += [(m, None) for m in others]

    rng = random.Random(str(pool.id) + str(pool.committed_cases))
    remaining = pool.target_cases - pool.committed_cases
    joins: list[Join] = []
    for mi, suggested in cands:
        if remaining <= 0 or (count is not None and len(joins) >= count) or (count is None and not fill):
            break
        cases = min(remaining, suggested or rng.randint(1, 4))
        joins.append(Join(mi, cases))
        remaining -= cases
    if joins:
        await commit_many(session, pool, joins, members)
    return len(joins)
