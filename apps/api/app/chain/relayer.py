"""Single relayer worker for the chain_txs outbox.

CHAIN_MODE=off:      pending rows become `simulated` after SIM_TX_DELAY_SECONDS with a fake 0x hash.
CHAIN_MODE=local|sepolia:
  - one operator wallet pays all gas; its nonce is tracked locally so queued txs go out back-to-back
    (no waiting for receipts - Sepolia blocks are ~12 s); receipts are checked on later ticks
  - merchant EIP-712 signatures are made at send time with the merchant's current nonce
    (max of on-chain `nonces(merchant)` and a local counter for in-flight txs)
  - before a commit: one-time ERC-2612 permit (merchant -> pools, max) + operator mints the commit amount
    (stands in for the escrow-bank top-up / Pool Credit payout). Merchants never need ETH.
  - rows can depend on earlier rows (e.g. refunds wait for mark_failed; mark_failed waits for the real
    on-chain deadline even if the demo clock was fast-forwarded)
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import clock
from ..core.config import settings
from ..models import ChainTx, Delivery, Pool
from .outbox import fake_hash

log = logging.getLogger("mohalla.relayer")

GAS = {"create_pool": 250_000, "mint": 120_000, "permit": 150_000, "commit": 260_000, "deliver": 220_000,
       "mark_failed": 100_000, "refund": 150_000, "attest": 450_000}
MAX_IN_FLIGHT = 30
MAX_UINT = 2**256 - 1
ZERO32 = b"\x00" * 32
EAS_ABI = [
    {"type": "function", "name": "attest", "stateMutability": "payable",
     "inputs": [{"name": "request", "type": "tuple", "components": [
         {"name": "schema", "type": "bytes32"},
         {"name": "data", "type": "tuple", "components": [
             {"name": "recipient", "type": "address"}, {"name": "expirationTime", "type": "uint64"},
             {"name": "revocable", "type": "bool"}, {"name": "refUID", "type": "bytes32"},
             {"name": "data", "type": "bytes"}, {"name": "value", "type": "uint256"}]}]}],
     "outputs": [{"name": "", "type": "bytes32"}]},
]


def _wall() -> datetime:
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------ off mode
_first_seen: dict[int, float] = {}  # tx id -> monotonic time the relayer first saw it


async def simulate_due(session: AsyncSession, only_id: int | None = None) -> int:
    """Mark pending txs `simulated` once they are SIM_TX_DELAY_SECONDS old (real time, so it also
    works with a frozen or fast-forwarded demo clock)."""
    now = clock.now()
    mono = time.monotonic()
    delay = settings.sim_tx_delay_seconds
    q = select(ChainTx).where(ChainTx.status == "pending")
    if only_id is not None:
        q = q.where(ChainTx.id == only_id)
    rows = (await session.execute(q.order_by(ChainTx.id).limit(500))).scalars().all()
    n = 0
    for tx in rows:
        seen = _first_seen.setdefault(tx.id, mono)
        if delay <= 0 or mono - seen >= delay or tx.created_at <= now - timedelta(seconds=delay + 1):
            tx.status = "simulated"
            tx.tx_hash = fake_hash(f"{tx.id}:{tx.kind}:{tx.ref}")
            tx.updated_at = now
            _first_seen.pop(tx.id, None)
            n += 1
    if len(_first_seen) > 5000:
        _first_seen.clear()
    if n:
        await session.commit()
    return n


# ------------------------------------------------------------------ chain mode
class ChainClient:
    """Synchronous web3 client; every method is called through asyncio.to_thread."""

    def __init__(self) -> None:
        from eth_account import Account
        from web3 import Web3

        from .config import abi, deployment

        dep = deployment()
        if not dep.get("pools") or not dep.get("tinr"):
            raise RuntimeError(f"CHAIN_MODE={settings.chain_mode} but no contract addresses (deployment json or "
                               f"TINR_ADDRESS/POOLS_ADDRESS)")
        self.Web3 = Web3
        self.w3 = Web3(Web3.HTTPProvider(settings.effective_rpc_url, request_kwargs={"timeout": 30}))
        key = settings.effective_operator_key
        if not key:
            raise RuntimeError("OPERATOR_PRIVATE_KEY is required for CHAIN_MODE=sepolia")
        self.op = Account.from_key(key)
        self.chain_id = self.w3.eth.chain_id
        self.tinr = self.w3.eth.contract(address=Web3.to_checksum_address(dep["tinr"]), abi=abi("MockINR"))
        self.pools = self.w3.eth.contract(address=Web3.to_checksum_address(dep["pools"]), abi=abi("MohallaPools"))
        self.eas = (self.w3.eth.contract(address=Web3.to_checksum_address(dep["eas"]), abi=EAS_ABI)
                    if dep.get("eas") else None)
        self.schemas = dep.get("easSchemas") or {}
        self.pools_domain = {"name": "MohallaPools", "version": "1", "chainId": self.chain_id,
                             "verifyingContract": self.pools.address}
        self.tinr_domain = {"name": "Mohalla Test Rupee", "version": "1", "chainId": self.chain_id,
                            "verifyingContract": self.tinr.address}
        self.reset()

    def reset(self) -> None:
        self.op_nonce: int | None = None
        self.sig_nonce: dict[str, int] = {}
        self.permitted: set[str] = set()
        self._fees: tuple[float, dict] | None = None

    # -- helpers
    def fees(self) -> dict:
        if self._fees and time.monotonic() - self._fees[0] < 10:
            return self._fees[1]
        base = self.w3.eth.get_block("latest").get("baseFeePerGas", 1_000_000_000)
        tip = self.w3.to_wei(1.5 if settings.chain_mode == "sepolia" else 1, "gwei")
        f = {"maxPriorityFeePerGas": tip, "maxFeePerGas": int(base * 2 + tip)}
        self._fees = (time.monotonic(), f)
        return f

    def send(self, fn, kind: str) -> str:
        if self.op_nonce is None:
            self.op_nonce = self.w3.eth.get_transaction_count(self.op.address, "pending")
        tx = fn.build_transaction({"from": self.op.address, "nonce": self.op_nonce, "gas": GAS[kind],
                                   "chainId": self.chain_id, **self.fees()})
        signed = self.op.sign_transaction(tx)
        try:
            h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        except Exception:
            self.op_nonce = None  # re-sync from the node next time
            raise
        self.op_nonce += 1
        return "0x" + h.hex().removeprefix("0x")

    def sign_typed(self, acct, domain: dict, primary: str, types: list, message: dict) -> bytes:
        from eth_account.messages import encode_typed_data

        signable = encode_typed_data(domain_data=domain, message_types={primary: types}, message_data=message)
        sig = acct.sign_message(signable)
        return sig.r.to_bytes(32, "big") + sig.s.to_bytes(32, "big") + bytes([sig.v])

    def merchant_nonce(self, addr: str) -> int:
        onchain = self.pools.functions.nonces(addr).call()
        n = max(onchain, self.sig_nonce.get(addr, 0))
        self.sig_nonce[addr] = n + 1
        return n

    # -- handlers: return (main_hash, [(kind, hash), ...extra]) or ("postpone", seconds)
    def create_pool(self, ref: dict, pool: dict):
        latest = self.w3.eth.get_block("latest")["timestamp"]
        now_real = max(int(time.time()), latest)
        secs_left = max(120, int(pool["secs_left"]) + 30)
        deadline = now_real + secs_left
        delivery = deadline + max(7 * 86400, int(pool["delivery_secs"]))
        fn = self.pools.functions.createPool(bytes.fromhex(ref["pool_id_hex"][2:]),
                                             self.Web3.to_checksum_address(ref["supplier"]), int(ref["unit_price"]),
                                             int(ref["target"]), deadline, delivery)
        return self.send(fn, "create_pool"), [], {"chain_deadline": deadline}

    def commit(self, ref: dict):
        from . import wallets

        acct = wallets.account(int(ref["wallet_index"]))
        extra = []
        pid = bytes.fromhex(ref["pool_id_hex"][2:])
        if acct.address not in self.permitted:
            if self.tinr.functions.allowance(acct.address, self.pools.address).call() < 2**255:
                deadline = int(time.time()) + 365 * 86400
                sig = self.sign_typed(acct, self.tinr_domain, "Permit", [
                    {"name": "owner", "type": "address"}, {"name": "spender", "type": "address"},
                    {"name": "value", "type": "uint256"}, {"name": "nonce", "type": "uint256"},
                    {"name": "deadline", "type": "uint256"}],
                    {"owner": acct.address, "spender": self.pools.address, "value": MAX_UINT,
                     "nonce": self.tinr.functions.nonces(acct.address).call(), "deadline": deadline})
                extra.append(("permit", self.send(self.tinr.functions.permit(
                    acct.address, self.pools.address, MAX_UINT, deadline, sig[64], sig[:32], sig[32:64]), "permit")))
            self.permitted.add(acct.address)
        extra.append(("mint", self.send(self.tinr.functions.mint(acct.address, int(ref["amount_paise"])), "mint")))
        nonce = self.merchant_nonce(acct.address)
        sig = self.sign_typed(acct, self.pools_domain, "Commit", [
            {"name": "poolId", "type": "bytes32"}, {"name": "qty", "type": "uint32"}, {"name": "nonce", "type": "uint256"}],
            {"poolId": pid, "qty": int(ref["cases"]), "nonce": nonce})
        try:
            h = self.send(self.pools.functions.commitFor(pid, acct.address, int(ref["cases"]), sig), "commit")
        except Exception:
            self.sig_nonce.pop(acct.address, None)
            raise
        return h, extra, {"merchant": acct.address}

    def deliver(self, ref: dict):
        from . import wallets

        acct = wallets.account(int(ref["wallet_index"]))
        pid = bytes.fromhex(ref["pool_id_hex"][2:])
        nonce = self.merchant_nonce(acct.address)
        sig = self.sign_typed(acct, self.pools_domain, "Delivery", [
            {"name": "poolId", "type": "bytes32"}, {"name": "nonce", "type": "uint256"}], {"poolId": pid, "nonce": nonce})
        try:
            h = self.send(self.pools.functions.confirmDelivery(pid, acct.address, sig), "deliver")
        except Exception:
            self.sig_nonce.pop(acct.address, None)
            raise
        return h, [], {"merchant": acct.address}

    def mark_failed(self, ref: dict, pool: dict):
        latest = self.w3.eth.get_block("latest")["timestamp"]
        cd = pool.get("chain_deadline") or 0
        if max(latest, int(time.time())) <= cd + 2:
            return "postpone", cd + 3 - max(latest, int(time.time())), {}
        return self.send(self.pools.functions.markFailed(bytes.fromhex(ref["pool_id_hex"][2:])), "mark_failed"), [], {}

    def refund(self, ref: dict):
        from . import wallets

        addr = wallets.address(int(ref["wallet_index"]))
        return self.send(self.pools.functions.refund(bytes.fromhex(ref["pool_id_hex"][2:]), addr), "refund"), [], {}

    def attest(self, ref: dict):
        from eth_abi import encode

        if not self.eas or not self.schemas.get("delivery"):
            raise RuntimeError("EAS not configured")
        pid = bytes.fromhex(ref["pool_id_hex"][2:])
        cs = self.Web3.to_checksum_address
        data = encode(["bytes32", "address", "address", "uint32", "bool"],
                      [pid, cs(ref["supplier"]), cs(ref["merchant"]), int(ref["cases"]), bool(ref["on_time"])])
        h = self.send(self.eas.functions.attest((bytes.fromhex(self.schemas["delivery"][2:]),
                                                 (cs(ref["supplier"]), 0, True, ZERO32, data, 0))), "attest")
        extra = []
        if self.schemas.get("commitment"):
            data2 = encode(["bytes32", "address", "uint256", "bool"],
                           [pid, cs(ref["merchant"]), int(ref["amount_paise"]), True])
            extra.append(("attest", self.send(self.eas.functions.attest((
                bytes.fromhex(self.schemas["commitment"][2:]), (cs(ref["merchant"]), 0, True, ZERO32, data2, 0))),
                "attest")))
        return h, extra, {}

    def receipt(self, h: str):
        from web3.exceptions import TransactionNotFound

        try:
            return self.w3.eth.get_transaction_receipt(h)
        except TransactionNotFound:
            return None


_client: ChainClient | None = None


def client() -> ChainClient:
    global _client
    if _client is None:
        _client = ChainClient()
    return _client


def reset_local_state() -> None:
    _first_seen.clear()
    if _client is not None:
        _client.reset()


def _attested_uid(rcpt) -> str | None:
    from web3 import Web3

    topic = Web3.keccak(text="Attested(address,address,bytes32,bytes32)")
    for lg in rcpt["logs"]:
        if lg["topics"] and bytes(lg["topics"][0]) == bytes(topic):
            return "0x" + bytes(lg["data"])[:32].hex()
    return None


async def _pool_info(session: AsyncSession, pool_id: str) -> tuple[Pool | None, dict]:
    import uuid

    p = await session.get(Pool, uuid.UUID(pool_id))
    if not p:
        return None, {}
    now = clock.now()
    return p, {"secs_left": (p.deadline - now).total_seconds(),
               "delivery_secs": (p.delivery_deadline - p.deadline).total_seconds(),
               "chain_deadline": p.chain_deadline}


async def process_chain(session: AsyncSession) -> int:
    c = client()
    now_wall = _wall()
    # 1) receipts for sent txs
    sent = (await session.execute(select(ChainTx).where(ChainTx.status == "sent").order_by(ChainTx.id).limit(100))).scalars().all()
    for tx in sent:
        rcpt = await asyncio.to_thread(c.receipt, tx.tx_hash)
        if rcpt is None:
            continue
        tx.status = "confirmed" if rcpt["status"] == 1 else "failed"
        tx.updated_at = clock.now()
        if tx.status == "failed":
            tx.error = "reverted on-chain"
            m = (tx.ref or {}).get("_merchant")
            if m:
                c.sig_nonce.pop(m, None)
        elif tx.kind == "attest" and tx.ref.get("merchant_id") and not tx.ref.get("_extra"):
            uid = _attested_uid(rcpt)
            if uid:
                import uuid

                d = await session.get(Delivery, (uuid.UUID(tx.ref["pool_id"]), uuid.UUID(tx.ref["merchant_id"])))
                if d:
                    d.attestation_uid = uid
    await session.commit()

    # 2) send pending txs in order
    in_flight = len(sent)
    pending = (await session.execute(select(ChainTx).where(ChainTx.status == "pending").order_by(ChainTx.id).limit(50))).scalars().all()
    n = 0
    for tx in pending:
        if in_flight >= MAX_IN_FLIGHT:
            break
        if tx.next_attempt_at and tx.next_attempt_at > now_wall:
            continue
        if tx.depends_on:
            dep = await session.get(ChainTx, tx.depends_on)
            if dep and dep.status == "failed":
                tx.status, tx.error = "failed", f"depends on tx {dep.id} which failed"
                continue
            if dep and dep.status == "pending":
                continue
        try:
            pool, info = await _pool_info(session, tx.ref["pool_id"]) if tx.ref.get("pool_id") else (None, {})
            if tx.kind == "create_pool":
                res = await asyncio.to_thread(c.create_pool, tx.ref, info)
            elif tx.kind == "commit":
                res = await asyncio.to_thread(c.commit, tx.ref)
            elif tx.kind == "deliver":
                res = await asyncio.to_thread(c.deliver, tx.ref)
            elif tx.kind == "mark_failed":
                res = await asyncio.to_thread(c.mark_failed, tx.ref, info)
            elif tx.kind == "refund":
                res = await asyncio.to_thread(c.refund, tx.ref)
            elif tx.kind == "attest":
                res = await asyncio.to_thread(c.attest, tx.ref)
            else:
                raise RuntimeError(f"unknown kind {tx.kind}")
        except Exception as e:  # noqa: BLE001
            tx.attempts += 1
            tx.error = str(e)[:500]
            if tx.attempts >= 3:
                tx.status = "failed"
            else:
                tx.next_attempt_at = now_wall + timedelta(seconds=3 * tx.attempts)
            tx.updated_at = clock.now()
            log.warning("relayer %s #%s failed: %s", tx.kind, tx.id, e)
            continue
        main, extra, meta = res
        if main == "postpone":
            tx.next_attempt_at = now_wall + timedelta(seconds=max(1, int(extra)))
            continue
        for kind, h in extra:
            session.add(ChainTx(kind=kind, ref={**tx.ref, "_extra": True, "_for": tx.id}, status="sent", tx_hash=h,
                                attempts=1, created_at=clock.now(), updated_at=clock.now()))
            in_flight += 1
        tx.status, tx.tx_hash, tx.updated_at = "sent", main, clock.now()
        tx.attempts += 1
        if meta.get("merchant"):
            tx.ref = {**tx.ref, "_merchant": meta["merchant"]}
        if meta.get("chain_deadline") and pool is not None:
            pool.chain_deadline = meta["chain_deadline"]
        in_flight += 1
        n += 1
        await session.commit()
    await session.commit()
    return n


async def tick(session: AsyncSession) -> None:
    if settings.chain_mode == "off":
        await simulate_due(session)
    else:
        await process_chain(session)
