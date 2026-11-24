"""Deployment info (addresses, ABIs, explorer links) for CHAIN_MODE=local|sepolia."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from eth_utils import keccak

from ..core.config import settings

ABI_DIR = Path(__file__).resolve().parent / "abi"
EXPLORER = {"sepolia": "https://sepolia.etherscan.io"}


def pool_id_hex(pool_uuid) -> str:
    return "0x" + keccak(text=str(pool_uuid)).hex()


@lru_cache
def deployment() -> dict:
    mode = settings.chain_mode
    if mode == "off":
        return {}
    p = ABI_DIR / f"deployment.{mode}.json"
    dep = json.loads(p.read_text()) if p.exists() else {}
    if settings.tinr_address:
        dep["tinr"] = settings.tinr_address
    if settings.pools_address:
        dep["pools"] = settings.pools_address
    if settings.treasury_address:
        dep["treasury"] = settings.treasury_address
    dep.setdefault("feeBps", settings.fee_bps)
    if mode == "sepolia":
        dep["eas"] = dep.get("eas") or settings.eas_address
        schemas = dict(dep.get("easSchemas") or {})
        if settings.eas_schema_delivery_uid:
            schemas["delivery"] = settings.eas_schema_delivery_uid
        if settings.eas_schema_commitment_uid:
            schemas["commitment"] = settings.eas_schema_commitment_uid
        dep["easSchemas"] = schemas
    return dep


@lru_cache
def abi(name: str) -> list:
    return json.loads((ABI_DIR / f"{name}.json").read_text())


def fee_bps() -> int:
    return int(deployment().get("feeBps", settings.fee_bps)) if settings.chain_mode != "off" else settings.fee_bps


def pools_address() -> str | None:
    return deployment().get("pools") if settings.chain_mode != "off" else None


def explorer_tx(tx_hash: str | None) -> str | None:
    base = EXPLORER.get(settings.chain_mode)
    return f"{base}/tx/{tx_hash}" if base and tx_hash else None


def explorer_address(addr: str | None) -> str | None:
    base = EXPLORER.get(settings.chain_mode)
    return f"{base}/address/{addr}" if base and addr else None


def easscan_url(uid: str | None) -> str | None:
    if settings.chain_mode == "sepolia" and uid:
        return f"https://sepolia.easscan.org/attestation/view/{uid}"
    return None
