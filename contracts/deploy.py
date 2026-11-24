"""Compile and deploy Mohalla's contracts with web3.py.

Usage (from the contracts/ folder):
    python deploy.py --network local      # anvil on http://127.0.0.1:8545 (uses anvil's first key)
    python deploy.py --network sepolia    # needs SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY in .env

What it does:
    1. Compiles src/*.sol with solc 0.8.31 (EVM: osaka) through py-solc-x.
    2. Deploys MockINR (tINR) and MohallaPools.
    3. On Sepolia, registers the two EAS schemas (skipped if they already exist).
    4. Writes deployments/<network>.json and copies the ABIs to apps/api/app/chain/abi/.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

import solcx
from dotenv import load_dotenv
from eth_account import Account
from web3 import Web3

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
API_ABI_DIR = ROOT / "apps" / "api" / "app" / "chain" / "abi"
SOLC_VERSION = "0.8.31"
EVM_VERSION = "osaka"

# anvil's well-known first dev account (public, test-only)
ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

EAS_SEPOLIA = "0xC2679fBD37d54388Ce493F1DB75320D236e1815e"
SCHEMA_REGISTRY_SEPOLIA = "0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0"
EAS_SCHEMAS = {
    "delivery": "bytes32 poolId,address supplier,address merchant,uint32 cases,bool onTime",
    "commitment": "bytes32 poolId,address merchant,uint256 amountPaise,bool honoured",
}
SCHEMA_REGISTRY_ABI = [
    {
        "inputs": [
            {"name": "schema", "type": "string"},
            {"name": "resolver", "type": "address"},
            {"name": "revocable", "type": "bool"},
        ],
        "name": "register",
        "outputs": [{"name": "", "type": "bytes32"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "uid", "type": "bytes32"}],
        "name": "getSchema",
        "outputs": [
            {
                "components": [
                    {"name": "uid", "type": "bytes32"},
                    {"name": "resolver", "type": "address"},
                    {"name": "revocable", "type": "bool"},
                    {"name": "schema", "type": "string"},
                ],
                "name": "",
                "type": "tuple",
            }
        ],
        "stateMutability": "view",
        "type": "function",
    },
]
ZERO = "0x0000000000000000000000000000000000000000"


def compile_contracts() -> dict[str, dict]:
    """Return {contract_name: {abi, bytecode}} for MockINR and MohallaPools."""
    if SOLC_VERSION not in [str(v) for v in solcx.get_installed_solc_versions()]:
        print(f"Installing solc {SOLC_VERSION} ...")
        solcx.install_solc(SOLC_VERSION)

    sources = {f"src/{p.name}": {"content": p.read_text(encoding="utf-8")} for p in (HERE / "src").glob("*.sol")}
    oz = HERE / "lib" / "openzeppelin-contracts" / "contracts"
    if not oz.exists():
        sys.exit("OpenZeppelin not found. Run: forge install OpenZeppelin/openzeppelin-contracts --no-git")

    out = solcx.compile_standard(
        {
            "language": "Solidity",
            "sources": sources,
            "settings": {
                # relative to base_path: solc mangles Windows absolute paths in remappings
                "remappings": ["@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/"],
                "optimizer": {"enabled": True, "runs": 200},
                "evmVersion": EVM_VERSION,
                "outputSelection": {"*": {"*": ["abi", "evm.bytecode.object"]}},
            },
        },
        solc_version=SOLC_VERSION,
        allow_paths=[str(HERE), str(oz)],
        base_path=str(HERE),
    )
    result = {}
    for name in ("MockINR", "MohallaPools"):
        c = out["contracts"][f"src/{name}.sol"][name]
        result[name] = {"abi": c["abi"], "bytecode": "0x" + c["evm"]["bytecode"]["object"]}
    return result


def send(w3: Web3, acct, tx: dict, label: str):
    tx.setdefault("from", acct.address)
    tx.setdefault("nonce", w3.eth.get_transaction_count(acct.address, "pending"))
    tx.setdefault("chainId", w3.eth.chain_id)
    if "gas" not in tx:
        tx["gas"] = int(w3.eth.estimate_gas(tx) * 1.2)
    if "maxFeePerGas" not in tx and "gasPrice" not in tx:
        base = w3.eth.get_block("latest")["baseFeePerGas"]
        tip = w3.to_wei(1.5, "gwei")
        tx["maxPriorityFeePerGas"] = tip
        tx["maxFeePerGas"] = base * 2 + tip
    signed = acct.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"  {label}: sent {h.hex()} ... ", end="", flush=True)
    rcpt = w3.eth.wait_for_transaction_receipt(h, timeout=300)
    if rcpt.status != 1:
        sys.exit(f"FAILED ({label})")
    print(f"ok (block {rcpt.blockNumber}, gas {rcpt.gasUsed})")
    return rcpt


def deploy(w3: Web3, acct, artifact: dict, args: list, label: str) -> str:
    c = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
    tx = c.constructor(*args).build_transaction(
        {"from": acct.address, "nonce": w3.eth.get_transaction_count(acct.address, "pending")}
    )
    tx.pop("maxFeePerGas", None)
    tx.pop("maxPriorityFeePerGas", None)
    rcpt = send(w3, acct, tx, f"deploy {label}")
    return rcpt.contractAddress


def register_eas_schemas(w3: Web3, acct) -> dict[str, str]:
    reg = w3.eth.contract(address=SCHEMA_REGISTRY_SEPOLIA, abi=SCHEMA_REGISTRY_ABI)
    uids = {}
    for key, schema in EAS_SCHEMAS.items():
        uid = Web3.solidity_keccak(["string", "address", "bool"], [schema, ZERO, True])
        existing = reg.functions.getSchema(uid).call()
        if existing[0] == uid:
            print(f"  EAS schema '{key}' already registered")
        else:
            tx = reg.functions.register(schema, ZERO, True).build_transaction(
                {"from": acct.address, "nonce": w3.eth.get_transaction_count(acct.address, "pending")}
            )
            tx.pop("maxFeePerGas", None)
            tx.pop("maxPriorityFeePerGas", None)
            send(w3, acct, tx, f"register EAS schema '{key}'")
        uids[key] = "0x" + uid.hex().removeprefix("0x")
    return uids


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--network", choices=["local", "sepolia"], default="local")
    ap.add_argument("--fee-bps", type=int, default=int(os.getenv("FEE_BPS", "100")))
    args = ap.parse_args()

    load_dotenv(HERE / ".env")
    load_dotenv(ROOT / ".env")

    if args.network == "local":
        rpc = os.getenv("LOCAL_RPC_URL", "http://127.0.0.1:8545")
        key = os.getenv("LOCAL_DEPLOYER_PRIVATE_KEY", ANVIL_KEY)
    else:
        rpc = os.getenv("SEPOLIA_RPC_URL")
        key = os.getenv("DEPLOYER_PRIVATE_KEY") or os.getenv("OPERATOR_PRIVATE_KEY")
        if not rpc or not key:
            sys.exit("Set SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY (or OPERATOR_PRIVATE_KEY) in .env")

    w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 60}))
    if not w3.is_connected():
        sys.exit(f"Can't reach RPC at {rpc}" + ("  (is anvil running?)" if args.network == "local" else ""))
    acct = Account.from_key(key)
    treasury = Web3.to_checksum_address(os.getenv("TREASURY_ADDRESS") or acct.address)
    bal = w3.eth.get_balance(acct.address)
    print(f"Network {args.network} (chainId {w3.eth.chain_id}), deployer {acct.address}, "
          f"balance {w3.from_wei(bal, 'ether'):.4f} ETH")
    if bal == 0:
        sys.exit("Deployer has no ETH. Use a Sepolia faucet first.")

    print(f"Compiling with solc {SOLC_VERSION} ...")
    arts = compile_contracts()

    print("Deploying ...")
    tinr = deploy(w3, acct, arts["MockINR"], [acct.address], "MockINR")
    pools = deploy(w3, acct, arts["MohallaPools"], [tinr, acct.address, acct.address, treasury, args.fee_bps],
                   "MohallaPools")

    schema_uids = {}
    if args.network == "sepolia":
        print("Registering EAS schemas ...")
        schema_uids = register_eas_schemas(w3, acct)

    out = {
        "network": args.network,
        "chainId": w3.eth.chain_id,
        "deployer": acct.address,
        "operator": acct.address,
        "treasury": treasury,
        "feeBps": args.fee_bps,
        "tinr": tinr,
        "pools": pools,
        "eas": EAS_SEPOLIA if args.network == "sepolia" else None,
        "easSchemaRegistry": SCHEMA_REGISTRY_SEPOLIA if args.network == "sepolia" else None,
        "easSchemas": schema_uids,
    }
    dep_dir = HERE / "deployments"
    dep_dir.mkdir(exist_ok=True)
    (dep_dir / f"{args.network}.json").write_text(json.dumps(out, indent=2))

    API_ABI_DIR.mkdir(parents=True, exist_ok=True)
    for name, art in arts.items():
        (API_ABI_DIR / f"{name}.json").write_text(json.dumps(art["abi"], indent=2))
    shutil.copy(dep_dir / f"{args.network}.json", API_ABI_DIR / f"deployment.{args.network}.json")

    print("\nDone.")
    print(f"  TINR_ADDRESS={tinr}")
    print(f"  POOLS_ADDRESS={pools}")
    for k, v in schema_uids.items():
        print(f"  EAS_SCHEMA_{k.upper()}_UID={v}")
    if args.network == "sepolia":
        print(f"  https://sepolia.etherscan.io/address/{pools}")
    print(f"Saved deployments/{args.network}.json and ABIs to apps/api/app/chain/abi/")


if __name__ == "__main__":
    main()
