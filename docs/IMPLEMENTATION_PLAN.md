# Mohalla: Implementation Plan

> **One kirana is small. Fifty kiranas on one street buy like a supermarket chain.**
> Mohalla is an AI buying co-op for Paytm merchants. It predicts what each shop will need, groups nearby shops into one bulk order so they unlock distributor discount slabs, holds everyone's money in a smart-contract escrow on Sepolia, and offers a Paytm working-capital loan to shops that are short on cash.

**Event:** Paytm Build for India AI Hackathon, Mumbai, Track 1 (Merchant Growth AI)
**Team:** 3 developers (roles in section 13)
**Stack:** Next.js · FastAPI · Supabase (Postgres + Google login) · Groq (free tier) + open-source models · Solidity on Sepolia

---

## 0. Key dates and what to do tonight

| When | What |
|---|---|
| **24 Nov (tonight)** | Create every account and key in section 17. **Start collecting Sepolia ETH from faucets now**, because faucets give small daily amounts. |
| **25 Nov, 23:59** | **Pitch deck due.** Submit by 22:00 to leave a buffer. Use the outline in section 16. The team lead submits. |
| 26–28 Nov | Build the P0 demo path (sections 2 and 13), then P1 if there's time. |
| **29 Nov** | Offline hackathon at Paytm, Marol, Andheri East. Integrate, polish, rehearse and pitch. |

> **Ask the organisers first:** is code written before 29 Nov allowed? If not, use 26–28 Nov only for accounts, design, learning the tools and data-generator logic, and build the P0 path on the day. The plan is ordered so that P0 alone is a complete demo.

---

## 1. Scope

**P0: the demo can't work without these**
- Google and email login (Supabase), with three roles: merchant, distributor and Paytm ops.
- Synthetic Paytm-style data for about 300 shops around Marol.
- Demand forecast for each shop and category, with a plain-language reason.
- Pool engine: finds shops near each other that need the same item and creates a pool with a target quantity.
- A Soundbox-style voice feed: Hindi nudges with audio.
- Voice agent: the merchant speaks Hindi or Hinglish, the agent proposes "join pool with X cases" and the merchant confirms.
- Pool Credit: a simple rule-based loan offer when a shop is short of cash.
- Smart contracts on Sepolia: a mock rupee token (tINR) and an all-or-nothing pool escrow. Merchants never pay gas.
- Delivery QR scan, which releases that shop's money to the distributor.
- Paytm ops console with a map, KPIs and a **Demo Director** (fast-forward the clock, simulate other shops joining, simulate delivery).

**P1: adds a lot to the demo, build if time allows**
- Trade Trust Score from on-chain attestations (Ethereum Attestation Service, EAS), with "Verify on EASScan" links.
- Bill reader: photo of a distributor bill → stock levels and category mix.
- Distributor console: funded orders, delivery list, QR per shop.

**P2: mention in the pitch as the roadmap, don't build**
- WhatsApp channel, Marathi and Gujarati, an agent that negotiates with several distributors, and win-back offers for lapsed regular customers.

---

## 2. The demo story (build everything around this)

**Persona:** Ramesh, who runs Ramesh General Store in Marol. Time limit: 4 minutes.

1. **Login.** Ramesh signs in with Google and lands on the merchant home page.
2. **Soundbox nudge.** It plays in Hindi: *"Ramesh ji, New Year week mein aapke area mein cold drinks ki demand 2.3x rahegi. Aapke paas 4 case hain, 9 aur chahiye. 11 dukaanein pool bana rahi hain: 40 case pe 6% scheme. Join karein?"*
3. **Pool page.** A live progress bar shows 27 of 40 cases committed by 11 shops. Other shops' names aren't shown. It also shows the price per case, Ramesh's saving in rupees and a 3-minute countdown (the Demo Director shortens it).
4. **Voice.** Ramesh holds the mic and says *"Haan, 6 case daal do, paise baad mein dunga."* The agent replies with a confirmation card: 6 cases, ₹X, Pool Credit at Y% for 30 days, repaid from daily settlements. He taps **Confirm**.
5. **On-chain proof.** The card shows "Recording on Sepolia…" and then "Confirmed: view on Etherscan". Ramesh paid no gas.
6. **Pool fills.** The Demo Director clicks "Simulate joins". The bar reaches 40/40, the status turns to **FUNDED** and the order goes to the distributor, all in real time.
7. **Delivery.** In the distributor view, Ramesh's delivery QR is shown. On the merchant phone he scans it, the escrow releases his share to the distributor (minus a 1% Paytm fee, visible on-chain), an attestation is written and his Trust Score goes up.
8. **Paytm ops console.** Shows the Mumbai map with neighbourhood hexagons, pooled GMV, merchant savings, loans issued and fee revenue. This sets up the business-model slide.

**Optional:** fast-forward the clock to the week before Diwali and show the forecast explanation: *"Last Diwali your oil sales were 3.1x normal."*

> The demo date is 29 Nov, so the live scenario is **New Year week**. Diwali 2026 has already passed; use it only through the Demo Director's time travel.

---

## 3. Architecture

```
                          ┌──────────────────────────────┐
  Merchant phone (PWA) ──►│  Next.js (Vercel)            │◄── Distributor / Paytm Ops (desktop)
  mic, camera, QR scan    │  - Supabase Auth (Google)    │
                          │  - Realtime: pool progress   │
                          └──────────────┬───────────────┘
                                         │ REST (Bearer = Supabase JWT)
                          ┌──────────────▼───────────────┐
                          │  FastAPI (lightweight API)   │
                          │  routers · agent · pool eng. │
                          │  credit · trust · relayer    │
                          └─┬──────────┬──────────┬──────┘
               SQL (asyncpg)│          │ HTTPS    │ JSON-RPC (web3.py)
                ┌───────────▼──┐  ┌────▼──────┐  ┌▼──────────────────────────┐
                │ Supabase     │  │ Groq      │  │ Sepolia                   │
                │ Postgres     │  │ gpt-oss   │  │ MockINR (ERC-20 + permit) │
                │ Storage      │  │ whisper   │  │ MohallaPools (escrow)     │
                │ Realtime     │  │ qwen-vis. │  │ EAS (attestations)        │
                └───────▲──────┘  └───────────┘  └───────────────────────────┘
                        │ writes forecasts, audio
                ┌───────┴───────────────────────────┐
                │ ML jobs (team laptop or Colab)    │
                │ data generator · Chronos-2        │
                │ Indic Parler-TTS (pre-generated)  │
                └───────────────────────────────────┘
```

**Key design decisions**
- **Heavy ML stays out of the API.** Chronos-2 and Indic Parler-TTS need PyTorch, which won't fit free hosting. They run as batch jobs on a laptop or Colab and write results to Postgres and Supabase Storage. The API only reads them, so it stays small and fast.
- **Blockchain writes go through an outbox.** The API writes a row to `chain_txs`, and one relayer worker sends the transactions one at a time, which avoids nonce clashes. The UI never waits on the chain; it shows pending and then confirmed through Realtime.
- **Merchants never see crypto.** Each shop has a wallet derived from a server-side mnemonic. Merchants sign typed messages off-chain (EIP-712), and one operator wallet pays all gas.

---

## 4. Tech stack and free services

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js (latest, App Router), TypeScript, Tailwind, shadcn/ui | Mobile-first PWA for merchants |
| Maps | react-leaflet + OpenStreetMap tiles, `h3-js` | Draw H3 hexagons on the ops map |
| Charts | Recharts | Forecast bands, KPI charts |
| QR | `qrcode.react` (generate), `@yudiel/react-qr-scanner` (scan) | |
| Auth | Supabase Auth: Google OAuth + email/password, `@supabase/ssr` | |
| Database | Supabase Postgres (free: 500 MB), Storage, Realtime | Keep raw data small (section 7) |
| Backend | Python 3.11+, FastAPI, uvicorn, SQLAlchemy 2 (async) + asyncpg, pydantic-settings, APScheduler | |
| LLM (agent) | Groq `openai/gpt-oss-120b` (tool calling) | Lighter fallback: `openai/gpt-oss-20b` |
| Speech-to-text | Groq `whisper-large-v3` (Hindi and Hinglish) | `whisper-large-v3-turbo` is faster |
| Vision (bill reader) | Groq `qwen/qwen3.8-27b` (preview, image input) | Fallback: PaddleOCR or Tesseract, then gpt-oss parses the text |
| Text-to-speech | AI4Bharat **Indic Parler-TTS** (open), pre-generated | Runtime fallback: browser `speechSynthesis` with a `hi-IN` voice. Groq's TTS is English and Arabic only. |
| Forecasting | Amazon **Chronos-2** (`amazon/chronos-2`, Apache-2.0, 120M parameters, supports known-future covariates) | Baseline for comparison: seasonal-naive |
| Geo | Uber **H3** (`h3` Python v4) | Resolution 8 cell ≈ 0.7 km² |
| Fuzzy match | `rapidfuzz` | Bill line → SKU |
| Smart contracts | Solidity 0.8.x, **Foundry**, OpenZeppelin Contracts v5 | |
| Chain access | web3.py v7, eth-account (HD wallets) | |
| Attestations | **EAS on Sepolia**: EAS `0xC2679fBD37d54388Ce493F1DB75320D236e1815e`, SchemaRegistry `0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0` | Explorer: sepolia.easscan.org |
| RPC | Alchemy free tier (Sepolia) | Backup: a public Sepolia RPC |
| Hosting | Vercel (web), Render or Hugging Face Spaces (API) | **Run the API locally on the demo laptop; keep the deployed copy as a backup** |

> **Groq models change often.** As of 24 Nov 2026, the Llama 3.x and Llama 4 models are retired on the free tier. Keep every model ID in env vars (`GROQ_MODEL_AGENT`, `GROQ_MODEL_STT`, `GROQ_MODEL_VISION`) and check console.groq.com/docs/models on the morning of the event.

---

## 5. Repo layout

```
mohalla/
├── apps/
│   ├── web/                    # Next.js
│   │   ├── app/(auth)/login, auth/callback, onboarding
│   │   ├── app/m/              # merchant: home, pools/[id], talk, stock, credit, trust, scan
│   │   ├── app/d/              # distributor: orders, deliveries
│   │   ├── app/ops/            # Paytm ops: map, kpis, demo-director
│   │   ├── components/         # SoundboxCard, PoolProgress, ConfirmCard, HexMap, TxBadge…
│   │   └── lib/                # supabase clients, api client, i18n (hi/en)
│   └── api/                    # FastAPI
│       ├── app/main.py
│       ├── app/core/           # config, auth (Supabase JWT), db, clock (demo time)
│       ├── app/routers/        # me, home, pools, voice, actions, invoices, credit, deliveries, trust, ops, demo
│       ├── app/services/       # pool_engine, agent, nudges, credit, trust, invoice_reader, stt
│       ├── app/chain/          # wallets (HD), signer (EIP-712), relayer (outbox), eas, abi/
│       └── app/jobs/           # scheduler: pool formation, pool closer, relayer loop
├── ml/
│   ├── generate_synthetic.py   # shops, daily sales, SKUs, schemes, distributors, festivals
│   ├── forecast_job.py         # Chronos-2 → forecasts table
│   ├── tts_job.py              # Indic Parler-TTS → Storage
│   ├── backtest.ipynb          # WAPE vs seasonal-naive (number for the deck)
│   └── data/festivals.csv
├── contracts/                  # Foundry
│   ├── src/MockINR.sol, MohallaPools.sol
│   ├── test/MohallaPools.t.sol
│   └── script/Deploy.s.sol, RegisterSchemas.s.sol
├── supabase/migrations/        # SQL schema + RLS
├── docs/                       # demo-script.md, architecture.png, deck assets
└── .env.example
```

---

## 6. Data model (Supabase Postgres)

Money is stored as **integer paise** everywhere: in the DB and on-chain (tINR has 2 decimals).

```sql
-- people
profiles(id uuid pk references auth.users, role text check (role in ('merchant','distributor','ops')),
         merchant_id uuid null, distributor_id uuid null, display_name text, lang text default 'hi')

-- shops
merchants(id uuid pk, name text, owner_name text, category text,          -- kirana|pharmacy|chai|sweets|dairy|bakery
          lat float8, lng float8, h3_r8 text, lang text,
          wallet_index int unique, wallet_address text, created_at timestamptz)

daily_sales(merchant_id uuid, day date, txn_count int, amount_paise bigint, unique_payers int,
            primary key (merchant_id, day))
transactions(id bigserial pk, merchant_id uuid, ts timestamptz, amount_paise int, payer_hash text)  -- demo shop only, last 30 days

-- catalogue and supply
skus(id uuid pk, name text, category text, case_size int, case_price_paise int)   -- generic names, e.g. "Cola 2L"
distributors(id uuid pk, name text, coverage_h3 text[], wallet_address text)
schemes(id uuid pk, distributor_id uuid, sku_id uuid, slabs jsonb,                  -- [{"min_cases":20,"disc_bps":300},{"min_cases":40,"disc_bps":600}]
        valid_from date, valid_to date)
inventory(merchant_id uuid, sku_id uuid, qty_units int, source text, updated_at timestamptz, primary key (merchant_id, sku_id))
category_mix(merchant_id uuid, category text, share numeric, primary key (merchant_id, category))
invoices(id uuid pk, merchant_id uuid, image_path text, parsed jsonb, status text, created_at timestamptz)

-- AI outputs
forecasts(merchant_id uuid, category text, window_start date, window_end date,
          p10 numeric, p50 numeric, p90 numeric, uplift numeric, reason jsonb, model text,
          primary key (merchant_id, category, window_start))
nudges(id uuid pk, merchant_id uuid, kind text, text_hi text, text_en text, audio_path text,
       pool_id uuid null, created_at timestamptz, heard_at timestamptz)

-- pools
pools(id uuid pk, chain_id bytea, sku_id uuid, distributor_id uuid, scheme_id uuid,
      target_cases int, committed_cases int default 0, case_price_paise int, disc_bps int,
      center_h3 text, deadline timestamptz, delivery_deadline timestamptz,
      status text check (status in ('draft','open','funded','failed','settled')), create_tx text)
pool_invites(pool_id uuid, merchant_id uuid, suggested_cases int, reason jsonb, status text, primary key (pool_id, merchant_id))
pool_commitments(pool_id uuid, merchant_id uuid, cases int, amount_paise bigint, loan_id uuid null,
                 status text, tx_hash text, primary key (pool_id, merchant_id))
deliveries(pool_id uuid, merchant_id uuid, qr_nonce text, confirmed_at timestamptz, on_time bool,
           tx_hash text, attestation_uid text, primary key (pool_id, merchant_id))

-- money and trust
loans(id uuid pk, merchant_id uuid, amount_paise bigint, rate_bps int, tenure_days int,
      daily_deduct_bps int, status text, decision jsonb, created_at timestamptz)
trust_scores(subject_address text pk, subject_type text, score int, components jsonb, updated_at timestamptz)

-- blockchain outbox
chain_txs(id bigserial pk, kind text, ref jsonb, status text default 'pending',   -- pending|sent|confirmed|failed
          tx_hash text, error text, created_at timestamptz, updated_at timestamptz)
pending_actions(id uuid pk, merchant_id uuid, kind text, payload jsonb, expires_at timestamptz, status text)
```

**Row-level security (RLS):** the browser reads only `pools`, `pool_commitments` (aggregates only), `nudges` and `chain_txs` through Realtime. Turn on RLS for those tables:
- `pools`: any signed-in user can read.
- `nudges`: a merchant reads only rows where `merchant_id` matches their `profiles` row.
- `chain_txs`: readable by signed-in users (it holds only hashes).

All other reads and writes go through FastAPI using the service-role key.

**Privacy rule (put it in the pitch too):** a pool is only shown when it has **5 or more shops**. Merchants see pool totals, never another shop's sales or name.

---

## 7. Synthetic data (Dev 2, first task: it unblocks everyone)

`ml/generate_synthetic.py` is seeded and repeatable.

- **Shops:** 300 within about 3 km of the venue (Marol, Andheri East, ≈19.11°N 72.88°E; check this on a map). Mix: kirana 55%, chai and snacks 15%, pharmacy 10%, sweets 8%, dairy 7%, bakery 5%. Give them realistic Indian shop names. Shop #1 is **Ramesh General Store**, the demo shop.
- **Daily sales, 1 Nov 2024 to 29 Nov 2026:**
  `sales = base(category, lognormal) × weekday × salary_week(days 1–7: 1.15) × festival(category, day) × rain(monsoon Jun–Sep) × trend × noise`
  - Each category has its own festival multipliers. Diwali: oil, ghee, dry fruits, sweets ×2–3.5. Ganesh Chaturthi (big in Mumbai): sweets and flowers. Christmas and New Year: cold drinks, snacks, bakery ×1.8–2.5. Makar Sankranti: til and jaggery.
  - Hardcode festival dates for 2024–2027 in `ml/data/festivals.csv` and check them against a calendar.
- **Catalogue:** about 40 SKUs with **generic names** ("Cola 2L", "Sunflower Oil 1L", "Masala Chips 50g"), so the demo doesn't imply a real brand partnership.
- **Distributors and schemes:** 4 distributors, each covering a set of H3 cells. About 12 active slab schemes, including the New Year cold-drinks scheme used in the demo.
- **Stock and category mix:** derived from synthetic purchase bills (the reorder history).
- **Size:** store daily aggregates (300 × 760 days ≈ 230k rows). Store raw transactions only for the demo shop's last 30 days, so the free 500 MB DB isn't filled.
- **Wallets:** `wallet_index` = the shop number. Address = derive(`MERCHANT_MNEMONIC`, `m/44'/60'/0'/0/{index}`).

---

## 8. AI components

### 8.1 Demand forecast: "how much" × "what"
Paytm sees **rupee amounts, not items**. The forecast is built in two parts:

```
category_demand(shop, category, window) =
    Chronos-2 forecast of the shop's Paytm daily sales over the window (p10 / p50 / p90)
  × category share (from that shop's purchase-bill history)
  × festival uplift for that category (same window last year ÷ normal weeks)
```

- `ml/forecast_job.py`: Chronos-2 runs on CPU or Colab. Context: 365+ days. Horizon: 28 days. Known-future covariates: festival flags, salary week, weekend. It writes to `forecasts` along with a `reason` JSON, for example `{"last_year_uplift": 2.3, "event": "New Year week", "stock_units": 48}`.
- **Number for the deck:** backtest the last 8 weeks and compare WAPE with seasonal-naive. Report it honestly, and say it's on synthetic data.

### 8.2 Pool engine (`services/pool_engine.py`, runs every N minutes)

```
for scheme in active_schemes:
    shops = merchants in scheme.distributor.coverage_h3 whose category stocks scheme.sku
    for m in shops:
        need_units = demand_p50(m, sku.category, window) * sku_share(m, sku)
                     + safety(p90 - p50) - stock(m, sku)
        need_cases = floor(need_units / sku.case_size)          # keep if >= 1
    clusters = group shops by H3 res-7 parent (≈5 km²)          # or DBSCAN with eps 1.5 km
    for c in clusters:
        expected = sum(need_cases) * JOIN_RATE                   # start at 0.6, learn from history
        slab = highest slab with slab.min_cases <= expected
        if slab and len(c) >= 5:
            create pool(target_cases = slab.min_cases,
                        case_price = sku.case_price * (1 - slab.disc_bps/10000),
                        deadline = now + 48h  (demo: 3 min))
            invite each shop with suggested_cases and a reason payload
```

### 8.3 Nudges and the Soundbox voice
- `services/nudges.py` turns the forecast and pool data into a Hindi script of **30 words or fewer** using gpt-oss, with a JSON-only output format.
- **Fallback:** fixed Hindi templates filled in with numbers. Use these whenever Groq fails or hits a rate limit.
- `ml/tts_job.py` uses Indic Parler-TTS to make the audio and stores it under `audio/{nudge_id}.wav` in Supabase Storage. **Pre-generate audio for every demo nudge.** For anything new during the demo, play it with browser `speechSynthesis` (`hi-IN`).
- The UI component `SoundboxCard` looks like a speaker device. It auto-plays the newest nudge and shows the text with a play button.

### 8.4 Voice agent ("Mohalla Saathi")
- **Endpoint:** `POST /voice/turn` takes multipart audio (webm/opus from `MediaRecorder`) and calls Groq `whisper-large-v3` (language `hi`) to get the transcript.
- **LLM:** `openai/gpt-oss-120b` through Groq's OpenAI-compatible API with tool calling.
  - Reply in the merchant's language and script, in 2 sentences or fewer.
  - **Never move money directly.** Money tools only create a `pending_action`, which the merchant then confirms.
- **Tools:**
  - `get_open_pools()`
  - `get_pool(pool_id)`
  - `get_forecast(category)`
  - `get_stock(item)`
  - `propose_commit(pool_id, cases, use_credit)` returns a pending action
  - `get_credit_offer(amount)`
  - `get_trust_score()`
  - `get_savings_summary()`
- **Guardrails:**
  - Cap cases at 2× the forecast need.
  - Cap credit at the offer limit.
  - Use idempotency keys.
  - A pending action expires after 5 minutes.
- **Confirming:** the merchant taps Confirm, or says "haan" while a pending action is open. Either one calls `POST /actions/{id}/confirm`.
- **Response:** `{transcript, reply_text, reply_audio (browser TTS), pending_actions[]}`.

### 8.5 Bill reader (P1)
- The merchant photographs a distributor bill. Groq `qwen/qwen3.8-27b` (vision) is prompted to return JSON: `[{item, qty, unit, rate, amount}]`.
- `rapidfuzz` matches each item to `skus`. The merchant reviews the result, then it's saved to `inventory` and `category_mix`.
- **Fallback:** PaddleOCR text, then gpt-oss parses it.
- Prepare 3–4 sample bill photos for the demo.

### 8.6 Pool Credit (rule-based, explainable)
```
avg_inflow   = mean of the last 90 days of daily_sales
volatility   = coefficient of variation of daily_sales
limit        = min(0.30 * 30 * avg_inflow, 3 * commitment_amount)
rate_bps     = 1800 + 1200 * clamp(volatility, 0, 1) - 300 * (trust_score > 750)
repayment    = auto-deduct daily_deduct_bps of daily Paytm settlements over 30 days
```
- If accepted, the operator mints tINR to the shop's wallet (standing in for the lender paying out), then the commit goes ahead.
- **Pitch framing:** in production a lending partner (an NBFC) makes the credit decision, and Paytm distributes the loan.

### 8.7 Trade Trust Score (P1)
```
merchant score (300–900) = 300 + 600 * (0.5 * honoured_commit_rate
                                       + 0.2 * min(1, pools_joined / 10)
                                       + 0.2 * sales_stability
                                       + 0.1 * min(1, months_on_paytm / 24))
supplier score           = on-time delivery rate, fill rate, number of pools served
```
It is computed from **EAS attestations** read through the EASScan GraphQL API, so anyone can recompute it.

---

## 9. Blockchain (Sepolia)

### 9.1 Contracts
**`MockINR.sol`**: OpenZeppelin `ERC20` + `ERC20Permit` + `AccessControl`. `decimals() = 2` (1 tINR = ₹1). Only `MINTER_ROLE` (the operator) can mint. It stands in for rupees held in a regulated escrow bank.

**`MohallaPools.sol`**: a single contract that manages every pool (`EIP712`, `AccessControl`, `ReentrancyGuard`, `SafeERC20`).

```solidity
enum Status { None, Open, Funded, Failed }
struct Pool   { address supplier; uint128 unitPrice; uint32 targetQty; uint32 committedQty;
                uint64 deadline; uint64 deliveryDeadline; Status status; }
struct Member { uint32 qty; bool settled; }          // settled = paid to supplier or refunded

IERC20  public immutable token;
address public treasury;      // Paytm fee wallet
uint16  public feeBps;        // e.g. 100 = 1%, shown on-chain
mapping(bytes32 => Pool) public pools;                          // poolId = keccak256(db uuid)
mapping(bytes32 => mapping(address => Member)) public members;
mapping(address => uint256) public nonces;

// EIP-712 types
// Commit(bytes32 poolId,uint32 qty,uint256 nonce)
// Delivery(bytes32 poolId,uint256 nonce)

function createPool(bytes32 id, address supplier, uint128 unitPrice, uint32 targetQty,
                    uint64 deadline, uint64 deliveryDeadline) external onlyRole(OPERATOR_ROLE);

function commitFor(bytes32 id, address merchant, uint32 qty, bytes calldata sig) external;
//  anyone may relay; checks: Open, before deadline, qty <= target - committed,
//  valid merchant signature over Commit(id, qty, nonces[merchant]++);
//  pulls qty * unitPrice with transferFrom; when committedQty == targetQty → Funded

function markFailed(bytes32 id) external;                 // anyone, after deadline, if not Funded
function refund(bytes32 id, address merchant) external;   // anyone: Failed pool, OR Funded and
                                                          // undelivered after deliveryDeadline
function confirmDelivery(bytes32 id, address merchant, bytes calldata sig) external;
//  anyone may relay; requires Funded and a valid merchant Delivery signature;
//  pays supplier (amount - fee) and treasury (fee); marks settled

event PoolCreated(bytes32 indexed id, address supplier, uint128 unitPrice, uint32 targetQty, uint64 deadline);
event Committed(bytes32 indexed id, address indexed merchant, uint32 qty, uint256 amount);
event PoolFunded(bytes32 indexed id);
event PoolFailed(bytes32 indexed id);
event Delivered(bytes32 indexed id, address indexed merchant, uint256 toSupplier, uint256 fee);
event Refunded(bytes32 indexed id, address indexed merchant, uint256 amount);
```

**Pool states:** `Open → Funded` (target reached) or `Open → Failed` (deadline passed). Then each member ends as **delivered** (paid to the supplier) or **refunded**.

**Why this design**
- **All-or-nothing matches how slab schemes work.** If the pool doesn't reach the slab, nobody pays.
- **The escrow is neutral.** Even Paytm can't move a merchant's money without the merchant's signature. Commits and deliveries are permissionless to relay but need the merchant's signature.
- **The fee is visible on-chain,** so the business model can be checked by anyone.

### 9.2 No gas for merchants
- **At onboarding (once per shop):** the backend signs an ERC-2612 `permit(merchant → MohallaPools, max)` with the shop's derived key. The operator submits it, so the merchant spends no ETH.
- **To commit:** the shop key signs `Commit` (EIP-712) and the operator relays `commitFor`.
- **To confirm delivery:** the shop scans the delivery QR, the backend checks the QR's HMAC nonce, the shop key signs `Delivery`, and the operator relays `confirmDelivery`.
- **Gas:** only the operator wallet needs Sepolia ETH. Budget about **0.2 ETH** and collect it daily from the faucets, starting tonight.

### 9.3 EAS attestations (P1)
- **Register two schemas** once, in `script/RegisterSchemas.s.sol` or from Python:
  - `MohallaDelivery`: `bytes32 poolId, address supplier, address merchant, uint32 cases, bool onTime`. Recipient: the supplier.
  - `MohallaCommitment`: `bytes32 poolId, address merchant, uint256 amountPaise, bool honoured`. Recipient: the merchant.
- **When:** the relayer calls `EAS.attest(...)` after each delivery or refund.
- **In the UI:** each attestation gets a link to `https://sepolia.easscan.org/attestation/view/{uid}`.
- **Fallback if time runs short:** compute the trust score from the `Delivered` and `Refunded` events instead.

### 9.4 Relayer (`app/chain/relayer.py`)
- **A single worker loop:**
  1. Take the oldest `pending` row from `chain_txs`.
  2. Build and sign the transaction with the operator key, managing the nonce locally.
  3. Send it and wait for the receipt.
  4. Update `status`, `tx_hash` and the related DB rows (for example `pools.committed_cases`).
- **Updating the UI:** Realtime pushes each change to the browser, where `TxBadge` shows "pending" and then "confirmed" with an Etherscan link.
- **Retries:** up to 3, with a gas bump. A row that still fails is marked `failed` and shown in the ops console.

### 9.5 Contract tests (Foundry: must pass before deploying)
- Happy path: create → commits → funded → deliveries → supplier and treasury balances are correct.
- Deadline passes before the target → `markFailed` → everyone is refunded in full.
- Funded but undelivered after `deliveryDeadline` → refund works only for undelivered members.
- Reject: a bad signature, a reused nonce (replay), a commit beyond the target, a commit after the deadline, a double delivery, a double refund.
- Fee maths with odd amounts (no paise lost to rounding: `fee = amount * feeBps / 10000`, and the supplier gets the remainder).

Deploy with `forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify`. You need an Etherscan API key so the source is verified and judges can read it.

---

## 10. Backend API (FastAPI)

Every route except `/health` needs `Authorization: Bearer <supabase access token>`.

**Checking the token:** in `core/auth.py`, call `GET {SUPABASE_URL}/auth/v1/user` with the token and cache the result for 60 seconds. That's the simplest way. Alternatively, verify the token locally against the project's JWKS with PyJWT.

**Connecting to Postgres:** use Supabase's **pooler** connection string. In transaction mode (port 6543), set `statement_cache_size=0` in asyncpg.

| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | Profile, role, linked shop or distributor |
| POST | `/onboarding` | Choose a role, then claim a demo shop or create one |
| GET | `/m/home` | Nudges, forecast summary, open invites, savings to date |
| GET | `/forecasts?category=` | p10/p50/p90 bands and the reason |
| GET | `/pools?scope=near_me\|all` | Open, funded and recent pools |
| GET | `/pools/{id}` | Detail: progress, price, saving, countdown, chain links |
| POST | `/pools/{id}/commit` | `{cases, use_credit}` → pending action (UI path) |
| POST | `/voice/turn` | Audio → transcript, reply, pending actions |
| POST | `/actions/{id}/confirm` | Runs the action: loan if needed, signs the commit, queues the tx |
| GET | `/credit/offer?amount=` | Pool Credit offer |
| POST | `/invoices` · `/invoices/{id}/apply` | Bill photo → parsed lines → stock (P1) |
| GET | `/d/orders` | Distributor: funded pools and the delivery list |
| POST | `/d/deliveries/{pool_id}/{merchant_id}/qr` | Signed QR payload `{pool, merchant, nonce, exp, hmac}` |
| POST | `/m/deliveries/confirm` | Scanned QR → verify → sign Delivery → queue tx |
| GET | `/trust/{merchant_id}` | Score, parts and attestation links (P1) |
| GET | `/ops/kpis` · `/ops/hexes` | Pooled GMV, savings, loans, fee revenue · H3 heatmap |
| POST | `/demo/clock` · `/demo/pools/{id}/simulate-joins` · `/demo/pools/{id}/simulate-delivery` · `/demo/reset` | Demo Director (ops role only, behind a `DEMO_MODE` flag) |

**Scheduled jobs (APScheduler):**
- Pool formation every 5 minutes (demo: on demand).
- Closer every 30 seconds: `markFailed` for expired pools.
- Relayer loop.

**Demo clock:** `core/clock.py`'s `now()` returns `DEMO_NOW + offset` when `DEMO_MODE` is on. Every service uses it.

---

## 11. Frontend screens

**Merchant (mobile-first, Hindi by default with an English toggle, Noto Sans Devanagari font)**
- `/m` **Home**: `SoundboxCard` (latest nudge, auto-play), a forecast card ("This week: cold drinks ↑2.3x"), invite cards and the savings counter.
- `/m/pools/[id]`: a `PoolProgress` bar that updates live, slab ladder, my cases, saving in ₹, countdown, the Join stepper and a Pool Credit toggle. Shows `TxBadge` links.
- `/m/talk`: a large hold-to-talk mic, chat bubbles, `ConfirmCard` for pending actions, and spoken replies.
- `/m/scan`: delivery QR scanner, with a success animation and the payout and attestation links.
- `/m/stock` (P1): stock list and a "Scan bill" camera upload with a review table.
- `/m/trust` (P1): score gauge, its parts, and a list of attestations with EASScan links.

**Distributor (desktop)**
- `/d`: funded pools to fulfil, the delivery list per shop, a "Show QR" modal, and payouts received.

**Paytm ops (desktop, for the judges)**
- `/ops`: Leaflet map with H3 hexagons coloured by forecast demand, and pool pins coloured by status.
- KPI tiles: pooled GMV, merchant savings, loans issued, fee revenue, average trust score.
- A pool table.
- **Demo Director** panel: clock slider, "Simulate joins", "Simulate delivery", "Reset demo".

**Auth**
- `/login`: Google button plus email/password.
- `/auth/callback`: route handler that calls `exchangeCodeForSession`.
- `/onboarding`: choose a role.
- Middleware refreshes the session and redirects users by role.

---

## 12. Auth setup (Supabase + Google)

1. **Google Cloud Console:**
   - Set up the OAuth consent screen: External, Testing mode. Add all teammates and any demo Google accounts as test users.
   - Create a Web OAuth client with this redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. **Supabase**, under Auth → Providers → Google: paste the client ID and secret, and turn on Email as well.
3. **Supabase**, under Auth → URL configuration: set Site URL to the Vercel URL. Add the redirect URLs `http://localhost:3000/**` and `https://<vercel-app>/**`.
4. **Profiles:** a database trigger on `auth.users` creates a `profiles` row. Onboarding then sets the role.
5. **Demo accounts:** three Google accounts, one per role (Ramesh = merchant, one distributor, one Paytm ops). Keep them all logged in, in separate browser profiles.

---

## 13. Team split and schedule

| | **Dev 1: Frontend** | **Dev 2: AI and data** | **Dev 3: Backend and chain** |
|---|---|---|---|
| Owns | `apps/web`, auth UI, all screens, i18n, map | `ml/`, forecast, pool engine, nudges, agent, TTS, bill reader | `apps/api` core, DB schema, contracts, relayer, EAS, credit, deployment |
| **24 Nov** | Supabase project + Google OAuth. Scaffold Next.js. Deploy to Vercel. | Groq key. Draft the data generator. | Alchemy key, operator wallet, **start the faucets**. Foundry scaffold. FastAPI scaffold. |
| **25 Nov** | **Deck design** (section 16) | **Deck content:** problem, impact numbers | **Deck content:** architecture and business slides · lead submits by 22:00 |
| **26 Nov** | Login, onboarding, merchant home shell, `SoundboxCard` | Generator done and seeded. Forecast job v1. | Migrations and RLS. Contracts + tests. Deploy to Sepolia and verify. |
| **27 Nov** | Pool page with Realtime, `TxBadge`, ops map shell | Pool engine, nudges + templates, TTS pre-generation | Pools/home/forecast APIs, relayer, permit at onboarding, commit flow end-to-end |
| **28 Nov** | `/m/talk` voice UI, QR scan, Demo Director, ops KPIs | Voice agent (tools + guardrails), backtest number. P1: bill reader. | Credit offer, delivery QR + confirm, demo endpoints. P1: EAS + trust score. **First full rehearsal, record a backup video.** |
| **29 Nov** | Polish and fix bugs | Polish prompts, re-seed demo state | Run the API locally, check balances, rehearse 3× |

**Integration contract:** Dev 3 writes the API request and response shapes as Pydantic models on day 1 and shares the auto-generated OpenAPI docs at `/docs`. Dev 1 builds against mock JSON until the real endpoints are ready.

---

## 14. Demo readiness checklist

- [ ] `/demo/reset` restores a known state: the New Year pool at 27/40 with 11 shops, and Ramesh with 4 cases in stock and an invite.
- [ ] The operator wallet has at least 0.1 Sepolia ETH, and the contracts are verified on Etherscan.
- [ ] All demo nudge audio is pre-generated, and the browser TTS fallback has been tested on the demo laptop.
- [ ] The Groq fallback works: unplug Groq (set a bad key) and the demo still runs on templates.
- [ ] Voice works on the demo phone and browser. Microphone permission has been granted over HTTPS.
- [ ] Three browser profiles are logged in: merchant, distributor and ops.
- [ ] A mobile hotspot is ready as backup internet. The API runs locally, with the deployed copy as a backup.
- [ ] A recorded backup video of the whole demo exists (in case Wi-Fi or Sepolia is slow).
- [ ] The backtest WAPE number and on-chain links are ready for questions.

---

## 15. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Groq rate limits or a model gets retired | Model IDs in env vars, cached replies, Hindi templates, `gpt-oss-20b` as a lighter backup |
| Sepolia is slow or the faucets run dry | Outbox, so the UI never blocks. Fund the wallet early. Show the pending state honestly. The backup video. |
| Hindi TTS is slow on CPU | Pre-generated clips, then browser `speechSynthesis` |
| Chronos-2 or PyTorch won't run on free hosting | Forecasts are computed offline and stored in the DB, so the API never imports torch |
| The vision model (preview) changes | PaddleOCR + gpt-oss parsing |
| Venue Wi-Fi | Hotspot, local API, recorded video |
| Judge asks "is crypto legal for payments?" | tINR is a test token. In production, rupees sit in a regulated escrow bank account, and the chain is only the rulebook and audit trail (section 18). |
| Judge asks about privacy | Pools need 5+ shops; only totals are shown, never another shop's data; merchants consent to data use (DPDP Act) |

---

## 16. Deck outline (due 25 Nov, 23:59)

The deck needs these 7 slides:

1. **Title.** "Mohalla: the AI buying co-op for Paytm merchants." Tagline. Team name. Track 1.
2. **Problem.**
   - Kiranas are losing share to quick commerce. One survey says about 46% of quick-commerce buyers now buy less from kiranas; call it a direction, not a precise figure.
   - Shops buy in small amounts and miss distributor discount slabs that big retailers get.
   - Distributors struggle to collect dues from kiranas, so they price in the risk and limit credit.
   - Stock is ordered by gut feel.
   - Persona: Ramesh, a kirana owner in Marol.
3. **Proposed solution.** Show the flow: Forecast → Pool → Commit by voice → Pool Credit → Escrow → Delivery QR → Trust Score. Position it as **a new skill for Paytm's AI Soundbox**: the Soundbox reports what happened, Mohalla acts on what's coming.
4. **Tech stack.** The section 3 diagram, plus logos: Next.js, FastAPI, Supabase, Groq (gpt-oss, Whisper), Chronos-2, Indic Parler-TTS, H3, Solidity/Foundry, Sepolia, EAS.
5. **USP.**
   - Only Paytm has payment data for every shop on a street, plus the Soundbox to reach them and the lending book to fund them.
   - Pooling is all-or-nothing, matched to how discount slabs work, in an escrow nobody controls.
   - Merchants pay no gas and never see crypto.
   - Privacy by design.
   - Comparison table: ApnaKlub, ONDC DigiDukaan, Khatabook/OkCredit, Paytm AI Soundbox.
6. **Impact and benefits.**
   - Merchants: lower stock cost, fewer stock-outs, working capital when they need it, and a credit identity they can take anywhere.
   - Distributors: guaranteed payment and bigger drops per delivery.
   - Paytm: more loans, B2B GMV, engagement with the AI Soundbox, and a network effect.
   - Show an illustrative example **labelled as assumptions**: one pool of 40 cases × ₹1,500 = ₹60k GMV. A 6% slab saves ₹3,600, shared across 12 shops. Paytm earns a 1% fee (₹600) plus a lending-distribution fee on the financed share.
7. **Business model.**
   - Fee of 1–2% on pooled GMV, paid by distributors.
   - Lending-distribution fees on Pool Credit.
   - FMCG brands pay to promote their schemes to pools.
   - AI Soundbox subscription and AI token usage.
   - Roadmap: WhatsApp, more languages, a negotiation agent, win-back offers.

**Optional:** add one slide with 2–3 screenshots or mockups, and an architecture slide.

---

## 17. Accounts and environment variables

**Create tonight:**
- Supabase project
- Google Cloud OAuth client
- Groq API key
- Alchemy (Sepolia) key
- Etherscan API key
- A **fresh** MetaMask wallet used only as the testnet operator
- Sepolia faucet claims (e.g. the Google Cloud Web3 faucet), made daily by all 3 members
- Vercel account
- Render or Hugging Face account
- GitHub repo

```bash
# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=          # "publishable" key
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SEPOLIA_EXPLORER=https://sepolia.etherscan.io

# apps/api/.env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=              # "secret" key, server only
DATABASE_URL=postgresql+asyncpg://...pooler.supabase.com:6543/postgres
GROQ_API_KEY=
GROQ_MODEL_AGENT=openai/gpt-oss-120b
GROQ_MODEL_STT=whisper-large-v3
GROQ_MODEL_VISION=qwen/qwen3.8-27b
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<key>
OPERATOR_PRIVATE_KEY=                   # testnet-only key, never reuse
MERCHANT_MNEMONIC=                      # testnet-only, derives shop wallets
TINR_ADDRESS=
POOLS_ADDRESS=
TREASURY_ADDRESS=
EAS_ADDRESS=0xC2679fBD37d54388Ce493F1DB75320D236e1815e
EAS_SCHEMA_REGISTRY=0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0
EAS_SCHEMA_DELIVERY_UID=
EAS_SCHEMA_COMMITMENT_UID=
QR_HMAC_SECRET=
DEMO_MODE=true
DEMO_NOW=2026-12-26T09:00:00+05:30

# contracts/.env
SEPOLIA_RPC_URL=
PRIVATE_KEY=
ETHERSCAN_API_KEY=
```

Commit only `.env.example`, never `.env`. Add `.env*` to `.gitignore` before the first commit.

---

## 18. How Paytm would run this for real (for judges' questions)

- **Money:** rupees sit in an escrow account at a regulated bank. Paytm acts as the lending service provider with partner NBFCs, following RBI's digital lending rules.
- **Chain:** a permissioned chain, or hash anchoring on a public chain. It holds the pool rules and the delivery and commitment record.
- **Merchant keys:** they move from the server to the merchant's device, using passkeys and smart accounts. Then even Paytm can't sign on a merchant's behalf.
- **Channel:** a skill on the AI Soundbox (voice in and out), the Paytm for Business app, and WhatsApp.
- **Data:** real Paytm transaction aggregates replace the synthetic data. The bill reader and Paytm billing data give the category mix.
- **Rollout:** start with one pincode cluster and one distributor. Measure savings per merchant, the pool fill rate, loan uptake and repayment, and Soundbox retention.
