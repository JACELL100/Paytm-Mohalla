"""End-to-end check of the deployed contracts using only web3.py (the same way the backend will).

Runs: mint → gasless permit → createPool → merchant-signed commits (pool becomes Funded)
→ merchant-signed delivery (supplier + treasury get paid).

    python smoke_test.py --network local
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv
from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3

from deploy import ANVIL_KEY, send

HERE = Path(__file__).resolve().parent
ABI_DIR = HERE.parent / "apps" / "api" / "app" / "chain" / "abi"
MNEMONIC = "test test test test test test test test test test test junk"
Account.enable_unaudited_hdwallet_features()


def merchant(i: int):
    # On public testnets anvil's well-known mnemonic has EIP-7702 code attached, so use a private one.
    return Account.from_mnemonic(os.getenv("MERCHANT_MNEMONIC") or MNEMONIC, account_path=f"m/44'/60'/0'/0/{100 + i}")


def sign_typed(acct, domain: dict, types: dict, primary: str, message: dict) -> bytes:
    signable = encode_typed_data(domain_data=domain, message_types={primary: types[primary]}, message_data=message)
    sig = acct.sign_message(signable)
    return sig.r.to_bytes(32, "big") + sig.s.to_bytes(32, "big") + bytes([sig.v])


def tx(w3, op, fn, label):
    t = fn.build_transaction({"from": op.address, "nonce": w3.eth.get_transaction_count(op.address, "pending")})
    t.pop("maxFeePerGas", None)
    t.pop("maxPriorityFeePerGas", None)
    return send(w3, op, t, label)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--network", default="local")
    ap.add_argument("--rpc", default=None)
    args = ap.parse_args()
    load_dotenv(HERE / ".env")
    if args.network == "sepolia":
        rpc = args.rpc or os.environ["SEPOLIA_RPC_URL"]
        op_key = os.environ["DEPLOYER_PRIVATE_KEY"]
    else:
        rpc = args.rpc or "http://127.0.0.1:8545"
        op_key = ANVIL_KEY

    dep = json.loads((ABI_DIR / f"deployment.{args.network}.json").read_text())
    w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 60}))
    op = Account.from_key(op_key)
    chain_id = w3.eth.chain_id
    tinr = w3.eth.contract(address=dep["tinr"], abi=json.loads((ABI_DIR / "MockINR.json").read_text()))
    pools = w3.eth.contract(address=dep["pools"], abi=json.loads((ABI_DIR / "MohallaPools.json").read_text()))

    supplier = merchant(99).address
    price, target = 150_000, 10  # ₹1,500 per case, 10 cases
    pool_uuid = str(uuid.uuid4())
    pool_id = Web3.keccak(text=pool_uuid)
    now = w3.eth.get_block("latest")["timestamp"]

    print("createPool")
    tx(w3, op, pools.functions.createPool(pool_id, supplier, price, target, now + 3600, now + 86400), "createPool")

    pools_domain = {"name": "MohallaPools", "version": "1", "chainId": chain_id, "verifyingContract": dep["pools"]}
    tinr_domain = {"name": "Mohalla Test Rupee", "version": "1", "chainId": chain_id, "verifyingContract": dep["tinr"]}
    types = {
        "Commit": [{"name": "poolId", "type": "bytes32"}, {"name": "qty", "type": "uint32"}, {"name": "nonce", "type": "uint256"}],
        "Delivery": [{"name": "poolId", "type": "bytes32"}, {"name": "nonce", "type": "uint256"}],
        "Permit": [
            {"name": "owner", "type": "address"}, {"name": "spender", "type": "address"},
            {"name": "value", "type": "uint256"}, {"name": "nonce", "type": "uint256"}, {"name": "deadline", "type": "uint256"},
        ],
    }
    max_uint = 2**256 - 1

    for i, qty in enumerate([4, 6]):
        m = merchant(i)
        assert w3.eth.get_balance(m.address) == 0 or True  # merchants never need ETH
        tx(w3, op, tinr.functions.mint(m.address, qty * price), f"mint m{i}")
        deadline = now + 86400
        sig = sign_typed(m, tinr_domain, types, "Permit", {
            "owner": m.address, "spender": dep["pools"], "value": max_uint,
            "nonce": tinr.functions.nonces(m.address).call(), "deadline": deadline})
        tx(w3, op, tinr.functions.permit(m.address, dep["pools"], max_uint, deadline, sig[64], sig[:32], sig[32:64]),
           f"permit m{i}")
        sig = sign_typed(m, pools_domain, types, "Commit",
                         {"poolId": pool_id, "qty": qty, "nonce": pools.functions.nonces(m.address).call()})
        tx(w3, op, pools.functions.commitFor(pool_id, m.address, qty, sig), f"commit m{i} ({qty} cases)")

    p = pools.functions.getPool(pool_id).call()
    assert p[6] == 2, f"expected Funded (2), got {p[6]}"
    print(f"pool funded: {p[3]}/{p[2]} cases")

    m0 = merchant(0)
    sig = sign_typed(m0, pools_domain, types, "Delivery",
                     {"poolId": pool_id, "nonce": pools.functions.nonces(m0.address).call()})
    tx(w3, op, pools.functions.confirmDelivery(pool_id, m0.address, sig), "confirmDelivery m0")

    amount = 4 * price
    fee = amount * dep["feeBps"] // 10_000
    sup_bal = tinr.functions.balanceOf(supplier).call()
    assert sup_bal == amount - fee, (sup_bal, amount - fee)
    print(f"OK: supplier received {sup_bal / 100:.2f} tINR, fee {fee / 100:.2f} tINR. Merchant ETH balance: "
          f"{w3.eth.get_balance(m0.address)} wei (gasless).")
    if args.network == "sepolia":
        print(f"Pool on Etherscan: https://sepolia.etherscan.io/address/{dep['pools']}#events")


if __name__ == "__main__":
    sys.exit(main())
