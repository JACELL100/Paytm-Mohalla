# Mohalla API (FastAPI)

Backend for Mohalla, the AI buying co-op for Paytm merchants. The contract with the frontend is
[`docs/API_CONTRACT.md`](../../docs/API_CONTRACT.md); interactive docs at `http://localhost:8000/docs`.

It runs **with zero accounts or keys**: SQLite, dev auth (`dev-merchant` / `dev-distributor` / `dev-ops`),
simulated chain, rule-based Hindi voice agent. Supabase, Sepolia/anvil and Groq are switched on by env only.

## Setup (Windows / macOS / Linux, Python 3.11)

```bash
cd apps/api
uv venv .venv --python 3.11                       # or: python -m venv .venv
uv pip install --python .venv/Scripts/python.exe -r requirements.txt   # macOS/Linux: .venv/bin/python
# (slow network? export UV_HTTP_TIMEOUT=300)
# activate: .venv\Scripts\activate  (PowerShell)  |  source .venv/Scripts/activate (Git Bash)  |  source .venv/bin/activate
cp .env.example .env                              # optional; every value has a default
```

## Database

```bash
python -m app.scripts.init_db            # create tables (add --drop to start clean)
python -m app.scripts.seed               # drop + create + load synthetic data + demo state (~30-60 s on SQLite)
python -m app.scripts.seed --reset       # only rebuild the demo state (same as POST /demo/reset)
```

`POST /demo/reset` restores a **snapshot** of the seeded demo state (table `demo_snapshots`, captured by the
seed): one TRUNCATE + one bulk insert per table, with timestamps shifted to the demo clock and fresh pool ids
(on-chain ids must be unique). ~15 statements / ~2 s on Supabase. If the snapshot is missing or stale (wallet
mnemonic or demo settings changed), it rebuilds the state the slow way and re-captures.

The seed imports `ml/` (repo root): 300 shops around Marol grounded in OpenStreetMap locations, Open-Meteo
weather and `holidays` festival dates (cached in `ml/data/`, works offline; see `ml/DATA_SOURCES.md`),
26 months of daily Paytm-style sales, 45 generic SKUs, 4 distributors with H3 coverage, slab schemes,
stock, category mix, forecasts (`ml/forecast_simple.py`), and the seeded demo state from the contract.

## Run

```bash
python -m app --port 8000            # recommended (add --reload while developing)
# or: uvicorn app.main:app --reload --port 8000
```

`python -m app` is uvicorn on a selector event loop, so on Windows the fast psycopg Postgres driver works too
(plain `uvicorn` on Windows uses a Proactor loop; the API then logs a warning and falls back to asyncpg,
about 2x slower per statement against Supabase). With SQLite both behave the same.
Background loops run inside the process: the relayer (every 0.5 s) and the pool closer (every 10 s).

## Test

```bash
python -m pytest -q          # uses a throwaway SQLite DB, frozen demo clock, no keys needed
```

## Demo story over HTTP (dev tokens)

```bash
H="Authorization: Bearer dev-merchant"
curl -X POST localhost:8000/demo/reset -H "Authorization: Bearer dev-ops"
curl localhost:8000/m/home -H "$H"                                  # nudge + Cola 2L invite (27/40, 11 shops)
curl -X POST localhost:8000/voice/turn -H "$H" -F "text=haan 6 case daal do, paise baad mein dunga"
curl -X POST localhost:8000/actions/<action_id>/confirm -H "$H"     # loan + commit tx (pending -> simulated)
curl -X POST localhost:8000/demo/pools/<pool_id>/simulate-joins -H "Authorization: Bearer dev-ops" -H "content-type: application/json" -d '{"fill":true}'
curl localhost:8000/d/deliveries/<pool_id>/<merchant_id>/qr -H "Authorization: Bearer dev-distributor"
curl -X POST localhost:8000/m/deliveries/confirm -H "$H" -H "content-type: application/json" -d '{"qr_payload":"MOHALLA1...."}'
curl localhost:8000/ops/kpis -H "Authorization: Bearer dev-ops"
```

## Switching on the real services (env only, see `.env.example`)

| Want | Set |
|---|---|
| **Supabase Postgres** | `DATABASE_URL=postgresql+asyncpg://...pooler.supabase.com:6543/postgres` (transaction pooler; statement caches are disabled automatically). Create tables with `python -m app.scripts.init_db` (or run `supabase/schema.sql`), then `supabase/rls.sql`, then `python -m app.scripts.seed`. Regenerate `schema.sql` after model changes: `python -m app.scripts.dump_schema`. |
| **Supabase auth** | `SUPABASE_URL` + `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`). Tokens are checked with `GET {SUPABASE_URL}/auth/v1/user` (cached 60 s); the auth user id is the `profiles.id`. Dev tokens keep working while `DEMO_MODE=true`. |
| **Groq** (voice agent, Whisper STT, LLM nudges) | `GROQ_API_KEY` (+ optional `GROQ_MODEL_AGENT/STT/VISION`). Any Groq error falls back to the rule-based parser and templates. |
| **Local chain (anvil)** | start anvil, `cd contracts && python deploy.py --network local` (writes `app/chain/abi/deployment.local.json`), then `CHAIN_MODE=local`. Defaults: RPC `http://127.0.0.1:8545`, anvil key #0 as operator, anvil mnemonic for shop wallets (index `100 + shop_no`, so merchants hold 0 ETH). |
| **Sepolia** | `CHAIN_MODE=sepolia`, `RPC_URL`, `OPERATOR_PRIVATE_KEY`, and a **fresh** `MERCHANT_MNEMONIC` (the API refuses the anvil one: its addresses have EIP-7702 code on Sepolia). Addresses/EAS schema UIDs come from `deployment.sepolia.json`. After changing the mnemonic run `POST /demo/reset` (wallet addresses are re-derived). Each delivery is also attested on EAS; `/trust/me` then links to sepolia.easscan.org. |

## Performance (remote Postgres)

On Supabase every SQL statement is a network round trip, so requests are written to a statement budget,
enforced by `tests/test_perf.py` (counts are DB-independent, asserted on SQLite):

| Request | Statements | Supabase, from a laptop in Mumbai (psycopg) |
|---|---|---|
| GET /m/home | 6 | ~0.4 s |
| GET /pools/{id} | 3 | ~0.25 s |
| GET /ops/pools, /d/orders | 3-4 | ~0.25 s |
| GET /ops/kpis, /ops/hexes | 3 (then cached until the next write) | ~0.1 s |
| POST /actions/{id}/confirm | 11 | ~0.65 s |
| POST /demo/reset | 15 (SQLite: 23) | ~2 s |

How: pool lists load in 2 statements (`pools.load_views`: one joined query for pools + the viewer's
invite/commitment/delivery/loan/txs, one for all members); static data (SKUs, distributors, schemes, shop
names/locations, category mixes) is cached in-process (`services/cache.py`); writes are batched (one flush for
outbox rows, executemany updates); trust scores are mirrored in memory; KPI/hex aggregates are cached until the
next write; psycopg 3 sends each statement in one round trip.

## How the chain integration works

- The DB is the source of truth for the UI; every state change also writes a row to `chain_txs` (outbox).
  The API never waits on the chain.
- One relayer loop (`app/chain/relayer.py`) sends rows in order with a **locally tracked operator nonce**
  (back-to-back, no waiting for receipts; receipts are checked on later ticks).
- Before a commit it submits the shop's one-time ERC-2612 `permit` and mints the commit amount
  (stands in for the escrow-bank top-up / Pool Credit payout), then relays `commitFor` with the shop's
  EIP-712 `Commit` signature made **at send time** with the current `nonces(merchant)`.
  Deliveries relay `confirmDelivery` with an EIP-712 `Delivery` signature. Merchants never hold ETH.
- `pool_id_hex = keccak256(utf8(pool uuid))`. On-chain deadlines use real time
  (`real now + (pool.deadline - demo now)`, at least 2 minutes); `markFailed` waits for the real
  deadline even if the Demo Director fast-forwarded the demo clock; refunds wait for `markFailed`.
- `CHAIN_MODE=off`: rows become `simulated` with a fake 0x hash after ~1.5 s, `explorer_url=null`.

## Layout

```
app/main.py            FastAPI app, CORS, /static, background loops
app/core/              config (env), db (async SQLAlchemy, portable types), clock (demo time), auth
app/models.py          tables (same models on SQLite and Postgres)
app/routers/           public, me, merchant, distributor, ops, demo
app/services/          pools, pool_engine, actions (pending actions + guardrails), credit, trust, forecasts,
                       nudges, voice (Groq agent) + intent (rule-based Hindi/Hinglish parser), qr, ops, seed, llm
app/chain/             wallets (HD), config (deployment/ABIs), outbox, relayer (web3.py v7)
app/scripts/           init_db, seed, dump_schema
tests/                 pytest + httpx AsyncClient
```
