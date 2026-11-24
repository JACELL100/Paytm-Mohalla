"""HD wallets for shops and distributors (testnet only; in production keys live on the device).

Merchants:     m/44'/60'/0'/0/{wallet_index}   (wallet_index = 100 + shop number, so anvil's
               pre-funded accounts 0-9 are never used and merchants really hold 0 ETH)
Distributors:  m/44'/60'/0'/0/{10000 + n}
"""

from __future__ import annotations

from functools import lru_cache

from eth_account import Account
from eth_account.hdaccount import seed_from_mnemonic
from eth_account.hdaccount.deterministic import HDPath, SoftNode, derive_child_key, hmac_sha512

from ..core.config import settings

Account.enable_unaudited_hdwallet_features()


@lru_cache(maxsize=4)
def _seed(mnemonic: str) -> bytes:
    return seed_from_mnemonic(mnemonic, "")


@lru_cache(maxsize=4)
def _parent(mnemonic: str) -> tuple[bytes, bytes]:
    """(key, chain_code) of m/44'/60'/0'/0, derived once; children only need one more step."""
    node = hmac_sha512(b"Bitcoin seed", _seed(mnemonic))
    key, chain = node[:32], node[32:]
    for n in HDPath("m/44'/60'/0'/0")._path:
        key, chain = derive_child_key(key, chain, n)
    return key, chain


@lru_cache(maxsize=4096)
def private_key(index: int, mnemonic: str | None = None) -> bytes:
    """Key at m/44'/60'/0'/0/{index} (same result as eth_account's key_from_seed, much faster)."""
    key, chain = _parent(mnemonic or settings.effective_mnemonic)
    return derive_child_key(key, chain, SoftNode(index))[0]


def account(index: int, mnemonic: str | None = None):
    return Account.from_key(private_key(index, mnemonic))


def address(index: int, mnemonic: str | None = None) -> str:
    return account(index, mnemonic).address
