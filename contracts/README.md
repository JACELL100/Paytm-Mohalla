# Mohalla contracts

| Contract | What it does |
|---|---|
| `src/MockINR.sol` | tINR, a test rupee token (2 decimals, amounts in paise) with ERC-2612 `permit`, so merchants never need ETH. |
| `src/MohallaPools.sol` | All-or-nothing group-buy escrow. Merchants commit with an EIP-712 signature, the pool turns **Funded** at its target or **Failed** after its deadline (full refund), and each merchant's money goes to the supplier (minus the Paytm fee) only when that merchant signs delivery. |

## Setup
```bash
# Python (deploy + smoke test, uses web3.py)
uv venv .venv && uv pip install -p .venv -r requirements.txt
# Foundry (tests only)
forge install OpenZeppelin/openzeppelin-contracts --no-git   # if lib/ is missing
```

## Test
```bash
forge test        # 15 tests incl. a fuzz test of the fee maths
```

## Deploy with web3.py
```bash
# Local: start a chain first
anvil
.venv/Scripts/python deploy.py --network local
.venv/Scripts/python smoke_test.py --network local   # mint → permit → commit → funded → delivery

# Sepolia: copy .env.example to .env and fill SEPOLIA_RPC_URL + DEPLOYER_PRIVATE_KEY
.venv/Scripts/python deploy.py --network sepolia
```
`deploy.py` compiles with solc 0.8.31 (EVM `osaka`) through `py-solc-x`, deploys both contracts, registers the two EAS schemas on Sepolia, writes `deployments/<network>.json`, and copies the ABIs and addresses into `backend/app/chain/abi/` for the backend.

On Linux/macOS use `.venv/bin/python` instead of `.venv/Scripts/python`.
