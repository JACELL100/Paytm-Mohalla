"""SQLAlchemy 2.x models with portable types (work on SQLite and Postgres).

Money is integer paise everywhere. Timestamps are timezone-aware (TZDateTime).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from .core.db import Base, TZDateTime

BigIntPK = BigInteger().with_variant(Integer, "sqlite")


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


# ------------------------------------------------------------------ people
class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)  # = auth.users.id in Supabase
    role: Mapped[str | None] = mapped_column(String(16))  # merchant | distributor | ops
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("merchants.id"))
    distributor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("distributors.id"))
    display_name: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(200))
    lang: Mapped[str] = mapped_column(String(4), default="hi")
    dev_token: Mapped[str | None] = mapped_column(String(40), unique=True)
    created_at: Mapped[datetime | None] = mapped_column(TZDateTime)


# ------------------------------------------------------------------ shops
class Merchant(Base):
    __tablename__ = "merchants"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    shop_no: Mapped[int] = mapped_column(Integer, unique=True)
    name: Mapped[str] = mapped_column(String(160))
    owner_name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(24))  # kirana|pharmacy|chai|sweets|dairy|bakery
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    h3_r8: Mapped[str] = mapped_column(String(20), index=True)
    h3_r7: Mapped[str] = mapped_column(String(20), index=True)
    area_name: Mapped[str] = mapped_column(String(80))
    lang: Mapped[str] = mapped_column(String(4), default="hi")
    wallet_index: Mapped[int] = mapped_column(Integer, unique=True)
    wallet_address: Mapped[str] = mapped_column(String(42))
    wallet_balance_paise: Mapped[int] = mapped_column(BigInteger, default=0)
    seed_balance_paise: Mapped[int] = mapped_column(BigInteger, default=0)
    base_daily_paise: Mapped[int] = mapped_column(BigInteger, default=0)
    sales_stability: Mapped[float] = mapped_column(Float, default=0.5)
    onboarded_on: Mapped[date] = mapped_column(Date)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime | None] = mapped_column(TZDateTime)


class DailySale(Base):
    __tablename__ = "daily_sales"
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("merchants.id"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    txn_count: Mapped[int] = mapped_column(Integer)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    unique_payers: Mapped[int] = mapped_column(Integer)


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("merchants.id"), index=True)
    ts: Mapped[datetime] = mapped_column(TZDateTime)
    amount_paise: Mapped[int] = mapped_column(Integer)
    payer_hash: Mapped[str] = mapped_column(String(32))


# ------------------------------------------------------------------ catalogue and supply
class Sku(Base):
    __tablename__ = "skus"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    name_hi: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(24))
    case_size: Mapped[int] = mapped_column(Integer)
    case_price_paise: Mapped[int] = mapped_column(Integer)
    unit_retail_paise: Mapped[int] = mapped_column(Integer)
    sku_share: Mapped[float] = mapped_column(Float)
    emoji: Mapped[str] = mapped_column(String(16))


class Distributor(Base):
    __tablename__ = "distributors"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    key: Mapped[str] = mapped_column(String(24), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    coverage_h3: Mapped[list] = mapped_column(JSON, default=list)  # H3 res-7 cells
    categories: Mapped[list] = mapped_column(JSON, default=list)
    wallet_index: Mapped[int] = mapped_column(Integer, unique=True)
    wallet_address: Mapped[str] = mapped_column(String(42))


class Scheme(Base):
    __tablename__ = "schemes"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    distributor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("distributors.id"))
    sku_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("skus.id"))
    slabs: Mapped[list] = mapped_column(JSON)  # [{"min_cases":20,"disc_bps":300}, ...]
    valid_from: Mapped[date] = mapped_column(Date)
    valid_to: Mapped[date] = mapped_column(Date)


class Inventory(Base):
    __tablename__ = "inventory"
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("merchants.id"), primary_key=True)
    sku_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("skus.id"), primary_key=True)
    qty_units: Mapped[int] = mapped_column(Integer)
    seed_qty_units: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(16), default="bills")
    updated_at: Mapped[datetime | None] = mapped_column(TZDateTime)


class CategoryMix(Base):
    __tablename__ = "category_mix"
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("merchants.id"), primary_key=True)
    category: Mapped[str] = mapped_column(String(24), primary_key=True)
    share: Mapped[float] = mapped_column(Float)


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("merchants.id"))
    image_path: Mapped[str | None] = mapped_column(String(300))
    parsed: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16), default="uploaded")
    created_at: Mapped[datetime | None] = mapped_column(TZDateTime)


# ------------------------------------------------------------------ AI outputs
class Forecast(Base):
    __tablename__ = "forecasts"
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("merchants.id"), primary_key=True)
    category: Mapped[str] = mapped_column(String(24), primary_key=True)
    window_start: Mapped[date] = mapped_column(Date, primary_key=True)
    window_end: Mapped[date] = mapped_column(Date)
    p10: Mapped[int] = mapped_column(BigInteger)  # paise over the window
    p50: Mapped[int] = mapped_column(BigInteger)
    p90: Mapped[int] = mapped_column(BigInteger)
    uplift: Mapped[float] = mapped_column(Float)
    reason: Mapped[dict] = mapped_column(JSON)
    model: Mapped[str] = mapped_column(String(40))


class Nudge(Base):
    __tablename__ = "nudges"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("merchants.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    text_hi: Mapped[str] = mapped_column(Text)
    text_en: Mapped[str] = mapped_column(Text)
    audio_path: Mapped[str | None] = mapped_column(String(300))
    pool_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(TZDateTime)
    heard_at: Mapped[datetime | None] = mapped_column(TZDateTime)


# ------------------------------------------------------------------ pools
class Pool(Base):
    __tablename__ = "pools"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    chain_id_hex: Mapped[str] = mapped_column(String(66))  # keccak256(utf8(str(id)))
    sku_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("skus.id"))
    distributor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("distributors.id"))
    scheme_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("schemes.id"))
    target_cases: Mapped[int] = mapped_column(Integer)
    committed_cases: Mapped[int] = mapped_column(Integer, default=0)
    base_case_price_paise: Mapped[int] = mapped_column(Integer)
    case_price_paise: Mapped[int] = mapped_column(Integer)
    disc_bps: Mapped[int] = mapped_column(Integer)
    slabs: Mapped[list] = mapped_column(JSON)
    center_h3: Mapped[str] = mapped_column(String(20))
    cluster_h3: Mapped[str | None] = mapped_column(String(20))
    center_lat: Mapped[float] = mapped_column(Float)
    center_lng: Mapped[float] = mapped_column(Float)
    area_name: Mapped[str] = mapped_column(String(80))
    deadline: Mapped[datetime] = mapped_column(TZDateTime, index=True)
    delivery_deadline: Mapped[datetime] = mapped_column(TZDateTime)
    status: Mapped[str] = mapped_column(String(12), index=True)  # draft|open|funded|failed|settled
    create_tx_id: Mapped[int | None] = mapped_column(BigInteger)
    chain_deadline: Mapped[int | None] = mapped_column(BigInteger)  # unix seconds used on-chain
    created_at: Mapped[datetime] = mapped_column(TZDateTime)
    funded_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    settled_at: Mapped[datetime | None] = mapped_column(TZDateTime)


class PoolInvite(Base):
    __tablename__ = "pool_invites"
    pool_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("pools.id"), primary_key=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("merchants.id"), primary_key=True)
    suggested_cases: Mapped[int] = mapped_column(Integer)
    reason: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(12), default="invited")  # invited|joined|declined
    created_at: Mapped[datetime | None] = mapped_column(TZDateTime)


class PoolCommitment(Base):
    __tablename__ = "pool_commitments"
    pool_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("pools.id"), primary_key=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("merchants.id"), primary_key=True)
    cases: Mapped[int] = mapped_column(Integer)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    loan_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    status: Mapped[str] = mapped_column(String(12), default="committed")  # committed|delivered|refunded
    tx_id: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(TZDateTime)


class Delivery(Base):
    __tablename__ = "deliveries"
    pool_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("pools.id"), primary_key=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("merchants.id"), primary_key=True)
    qr_nonce: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending|delivered|refunded
    confirmed_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    on_time: Mapped[bool | None] = mapped_column(Boolean)
    payout_paise: Mapped[int | None] = mapped_column(BigInteger)
    fee_paise: Mapped[int | None] = mapped_column(BigInteger)
    tx_id: Mapped[int | None] = mapped_column(BigInteger)
    attestation_uid: Mapped[str | None] = mapped_column(String(66))


# ------------------------------------------------------------------ money and trust
class Loan(Base):
    __tablename__ = "loans"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("merchants.id"), index=True)
    pool_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    rate_bps: Mapped[int] = mapped_column(Integer)
    tenure_days: Mapped[int] = mapped_column(Integer)
    daily_deduct_bps: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(12))  # offered|active|repaid
    decision: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(TZDateTime)


class TrustScore(Base):
    __tablename__ = "trust_scores"
    subject_address: Mapped[str] = mapped_column(String(42), primary_key=True)
    subject_type: Mapped[str] = mapped_column(String(12))  # merchant | supplier
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    score: Mapped[int] = mapped_column(Integer)
    components: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime | None] = mapped_column(TZDateTime)


# ------------------------------------------------------------------ blockchain outbox
class ChainTx(Base):
    __tablename__ = "chain_txs"
    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(16))  # create_pool|permit|commit|mint|deliver|refund|mark_failed|attest
    ref: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)
    tx_hash: Mapped[str | None] = mapped_column(String(66))
    error: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    depends_on: Mapped[int | None] = mapped_column(BigInteger)
    next_attempt_at: Mapped[datetime | None] = mapped_column(TZDateTime)  # real (wall) time
    created_at: Mapped[datetime] = mapped_column(TZDateTime)
    updated_at: Mapped[datetime | None] = mapped_column(TZDateTime)


class PendingAction(Base):
    __tablename__ = "pending_actions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("merchants.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    payload: Mapped[dict] = mapped_column(JSON)
    summary_hi: Mapped[str] = mapped_column(Text)
    summary_en: Mapped[str] = mapped_column(Text)
    idempotency_key: Mapped[str | None] = mapped_column(String(120))
    expires_at: Mapped[datetime] = mapped_column(TZDateTime)
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending|confirmed|cancelled|expired
    created_at: Mapped[datetime] = mapped_column(TZDateTime)


Index("ix_commitments_merchant", PoolCommitment.merchant_id)
Index("ix_invites_merchant", PoolInvite.merchant_id)


class DemoSnapshot(Base):
    """The seeded demo state (all dynamic tables) captured once after a full seed, so POST /demo/reset can
    restore it with a handful of bulk statements. Stored in the DB so it survives restarts (Render's disk is
    ephemeral)."""

    __tablename__ = "demo_snapshots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)  # always 1
    created_at: Mapped[datetime] = mapped_column(TZDateTime)
    meta: Mapped[dict] = mapped_column(JSON)
    data: Mapped[dict] = mapped_column(JSON)
