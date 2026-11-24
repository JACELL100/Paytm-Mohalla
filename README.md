# Paytm Mohalla

> **One kirana is small. Fifty kiranas on one street buy like a supermarket chain.**

Mohalla is an AI buying co-op for Paytm merchants, built for the **Paytm Build for India AI Hackathon (Mumbai), Track 1: Merchant Growth AI**.

It forecasts what each neighbourhood shop will need from its Paytm payment data, groups nearby shops into one bulk order so they unlock distributor discount slabs, holds the money in an all-or-nothing smart-contract escrow on Sepolia (merchants never see crypto or pay gas), offers instant **Pool Credit**, and releases each shop's payment only when it scans the delivery QR. It is voice-first in Hindi and Hinglish, designed as a new skill for Paytm's AI Soundbox.

## Repository layout

```
Paytm-Mohalla/
├── frontend/     Next.js: landing site, merchant app, distributor + Paytm ops consoles
├── backend/      FastAPI: API, pool engine, voice agent, credit, trust, web3.py relayer
│   └── ml/       Open-data pipeline (OpenStreetMap, Open-Meteo, holidays) + forecasting
├── supabase/     Postgres schema and row-level security policies
├── contracts/    Solidity (MockINR, MohallaPools), Foundry tests, web3.py deploy script
└── docs/         Implementation plan, frontend ⇄ backend API contract
```

Each folder has its own README with setup and run commands.

## Run it locally (no accounts needed)

```bash
# backend (SQLite + simulated chain by default)
cd backend
uv venv .venv && uv pip install -p .venv -r requirements.txt
.venv/Scripts/python -m app.scripts.init_db && .venv/Scripts/python -m app.scripts.seed
.venv/Scripts/python -m app --port 8000          # Linux/macOS: .venv/bin/python

# frontend (new terminal)
cd frontend
npm install && cp .env.example .env.local && npm run dev   # http://localhost:3000
```

## Live contracts (Sepolia)

| Contract | Address |
|---|---|
| MohallaPools (escrow) | [`0x2134bDe5cF058f93c5989fBBA02faBF411320EF0`](https://sepolia.etherscan.io/address/0x2134bDe5cF058f93c5989fBBA02faBF411320EF0) |
| MockINR (tINR test rupee) | [`0x07eFeEa7335747e26d93dAfd40D1745B5f624163`](https://sepolia.etherscan.io/address/0x07eFeEa7335747e26d93dAfd40D1745B5f624163) |

EAS schemas (for the on-chain Trade Trust Score) are registered on Sepolia's Ethereum Attestation Service.

## Tech stack

Next.js · FastAPI · Supabase (Postgres + Auth) · Groq (gpt-oss, Whisper) · Amazon Chronos-2 · AI4Bharat Indic Parler-TTS · Uber H3 · Solidity + Foundry · web3.py · Sepolia · Ethereum Attestation Service
