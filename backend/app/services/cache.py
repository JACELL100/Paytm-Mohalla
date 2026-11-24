"""In-process caches, so hot requests don't pay a database round trip for data that never changes
during a demo (every statement is a network round trip on Supabase).

- static():   skus, distributors, schemes, merchant static fields (NOT wallet balances), category mixes,
              stockists per category. Loaded once (5 statements); invalidated by seed / wallet re-derivation.
- version():  a counter bumped by every write that changes pools, commitments, deliveries, loans or trust,
              used as the key of short-lived aggregate caches (ops KPIs, hexes).
- claimed merchant ids (profiles linked to shops) - invalidated on onboarding.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CategoryMix, Distributor, Merchant, Profile, Scheme, Sku

STOCKIST_MIN_SHARE = 0.03


@dataclass(frozen=True)
class MerchantInfo:
    id: uuid.UUID
    shop_no: int
    name: str
    owner_name: str
    category: str
    lat: float
    lng: float
    h3_r8: str
    h3_r7: str
    area_name: str
    lang: str
    wallet_index: int
    wallet_address: str
    is_demo: bool
    onboarded_on: date
    sales_stability: float


@dataclass
class Static:
    skus: dict[uuid.UUID, Sku] = field(default_factory=dict)
    skus_by_code: dict[str, Sku] = field(default_factory=dict)
    distributors: dict[uuid.UUID, Distributor] = field(default_factory=dict)
    schemes: dict[uuid.UUID, Scheme] = field(default_factory=dict)
    merchants: dict[uuid.UUID, MerchantInfo] = field(default_factory=dict)
    mixes: dict[uuid.UUID, dict[str, float]] = field(default_factory=dict)
    stockists: dict[str, set[uuid.UUID]] = field(default_factory=dict)

    def merchant(self, mid: uuid.UUID) -> MerchantInfo:
        return self.merchants[mid]


_static: Static | None = None
_claimed: set[uuid.UUID] | None = None
_version = 0
_memo: dict[str, tuple[tuple, object]] = {}


def _detach(session: AsyncSession, objs) -> None:
    for o in objs:
        session.expunge(o)


async def static(session: AsyncSession) -> Static:
    global _static
    if _static is not None:
        return _static
    st = Static()
    skus = (await session.execute(select(Sku))).scalars().all()
    dists = (await session.execute(select(Distributor))).scalars().all()
    schemes = (await session.execute(select(Scheme))).scalars().all()
    _detach(session, [*skus, *dists, *schemes])
    st.skus = {s.id: s for s in skus}
    st.skus_by_code = {s.code: s for s in skus}
    st.distributors = {d.id: d for d in dists}
    st.schemes = {s.id: s for s in schemes}
    cols = [getattr(Merchant, f) for f in MerchantInfo.__dataclass_fields__]
    for row in (await session.execute(select(*cols))).all():
        mi = MerchantInfo(*row)
        st.merchants[mi.id] = mi
    for mid, cat, share in (await session.execute(select(CategoryMix.merchant_id, CategoryMix.category,
                                                         CategoryMix.share))).all():
        st.mixes.setdefault(mid, {})[cat] = share
        if share >= STOCKIST_MIN_SHARE:
            st.stockists.setdefault(cat, set()).add(mid)
    _static = st
    return st


def invalidate_static() -> None:
    global _static
    _static = None


async def claimed(session: AsyncSession) -> set[uuid.UUID]:
    global _claimed
    if _claimed is None:
        _claimed = {r[0] for r in (await session.execute(select(Profile.merchant_id)
                                                         .where(Profile.merchant_id.is_not(None)))).all()}
    return _claimed


def invalidate_claimed() -> None:
    global _claimed
    _claimed = None


def bump() -> None:
    """Call after any write that changes pools / commitments / deliveries / loans / trust."""
    global _version
    _version += 1
    _memo.clear()


def version() -> int:
    return _version


def memo_get(name: str, key: tuple):
    hit = _memo.get(name)
    if hit and hit[0] == key:
        return hit[1]
    return None


def memo_set(name: str, key: tuple, value) -> None:
    _memo[name] = (key, value)


def invalidate_all() -> None:
    invalidate_static()
    invalidate_claimed()
    bump()
