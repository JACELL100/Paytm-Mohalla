# Mohalla API contract (frontend ⇄ backend)

This file is the single source of truth between `apps/web` (Next.js, port 3000) and `apps/api` (FastAPI, port 8000).
If either side needs a change, update this file first.

## Conventions
- Base URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`). JSON everywhere, snake_case keys.
- **Money is always integer paise** (`*_paise`). The frontend formats ₹ with Indian digit grouping (`₹1,23,456`).
- Timestamps are ISO-8601 strings with offset. IDs are UUID strings.
- Errors: HTTP 4xx/5xx with `{"detail": "human readable message"}`.
- **Time comes from the demo clock**: always use `now` from `GET /demo/state` (not the browser clock) for countdowns.
- Live updates: **polling**. Poll `GET /pools/{id}` every 1.5 s while a pool page is open, `GET /m/home` every 5 s, `GET /ops/kpis` every 3 s, and `GET /txs/{id}` every 1 s while a tx is pending.

## Auth
Every route except `/health`, `/demo/accounts` and `/demo/state` needs `Authorization: Bearer <token>`.

| `auth_mode` (from `/health`) | Token |
|---|---|
| `dev` (default when `SUPABASE_URL` is unset) | One of the dev tokens from `GET /demo/accounts`: `dev-merchant`, `dev-distributor`, `dev-ops` |
| `supabase` | The Supabase access token (`session.access_token`). New users have no role until `POST /onboarding`. |

In `dev` mode the login page shows the 3 demo accounts as one-click sign-in. In `supabase` mode it shows Google sign-in + email/password, plus the same demo-account buttons if `demo_mode` is true.

## Shared types (TypeScript notation)

```ts
type Role = 'merchant' | 'distributor' | 'ops'
type Lang = 'hi' | 'en'

interface Merchant { id: string; name: string; owner_name: string; category: string;
  lat: number; lng: number; h3_r8: string; lang: Lang; wallet_address: string }

interface Distributor { id: string; name: string; wallet_address: string }

interface TxRef { id: string; kind: 'create_pool'|'permit'|'commit'|'mint'|'deliver'|'refund'|'mark_failed'|'attest';
  status: 'pending'|'sent'|'confirmed'|'failed'|'simulated';
  tx_hash: string | null; explorer_url: string | null; created_at: string }

interface Sku { id: string; name: string; category: string; case_size: number; emoji: string;
  base_case_price_paise: number }

interface Slab { min_cases: number; disc_bps: number }

interface Loan { id: string; amount_paise: number; rate_bps: number; tenure_days: number;
  daily_deduct_bps: number; status: 'offered'|'active'|'repaid' }

interface CreditOffer { amount_paise: number; limit_paise: number; rate_bps: number; tenure_days: number;
  daily_deduct_bps: number; reason_en: string; reason_hi: string; eligible: boolean }

interface PoolMine {
  invited: boolean; suggested_cases: number | null;
  reason: { event: string; uplift: number; stock_units: number; need_cases: number } | null;
  committed_cases: number; amount_paise: number; loan: Loan | null;
  delivery_status: 'pending'|'delivered'|'refunded'|null; commit_tx: TxRef | null }

interface Pool {
  id: string; sku: Sku; distributor: { id: string; name: string };
  target_cases: number; committed_cases: number; member_count: number;
  base_case_price_paise: number; case_price_paise: number; disc_bps: number;
  savings_per_case_paise: number; slabs: Slab[];
  deadline: string; delivery_deadline: string;
  status: 'draft'|'open'|'funded'|'failed'|'settled';
  center: { lat: number; lng: number; area_name: string };
  mine: PoolMine | null;            // null for distributor/ops callers
  chain: { pool_id_hex: string; contract_address: string | null; contract_url: string | null;
           create_tx: TxRef | null };
  recent_joins: { at: string; cases: number }[]   // anonymised, newest first, max 10
}

interface Nudge { id: string; kind: 'forecast'|'pool_invite'|'pool_funded'|'delivery'|'credit'|'trust';
  text_hi: string; text_en: string; audio_url: string | null; pool_id: string | null;
  created_at: string; heard: boolean }

interface ForecastSummary { category: string; label_hi: string; label_en: string; emoji: string;
  uplift: number; window_start: string; window_end: string; event: string | null;
  p50_daily_paise: number; need_cases: number | null }

interface PendingAction { id: string; kind: 'commit';
  summary_hi: string; summary_en: string;
  payload: { pool_id: string; cases: number; amount_paise: number; use_credit: boolean;
             credit: CreditOffer | null; savings_paise: number };
  expires_at: string }
```

## Endpoints

### Public
| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{status:'ok', auth_mode:'dev'|'supabase', chain_mode:'off'|'local'|'sepolia', llm:boolean, stt:boolean, demo_mode:boolean}` — `llm`/`stt` false means no Groq key: the frontend uses browser `SpeechRecognition` (`hi-IN`) and sends `text` instead of audio |
| GET | `/demo/accounts` | `[{token, role, display_name, subtitle}]` (empty list when `demo_mode` false) |
| GET | `/demo/state` | `{now, demo_mode, clock_offset_minutes}` |

### Profile
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/me` | | `{profile:{id, role: Role|null, display_name, lang}, merchant: Merchant|null, distributor: Distributor|null}` |
| POST | `/onboarding` | `{role, merchant_id?}` (merchant may claim an unclaimed seeded shop; `GET /onboarding/shops` lists them) | same as `/me` |
| GET | `/onboarding/shops` | | `Merchant[]` (unclaimed, max 20) |
| PATCH | `/me` | `{lang}` | same as `/me` |

### Merchant
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/m/home` | | `{merchant, nudges: Nudge[] (newest first, max 10), forecasts: ForecastSummary[] (top 3 by uplift), invites: Pool[], active_pools: Pool[], savings:{total_paise, pools_joined}, trust:{score, band:'Building'|'Good'|'Excellent'}, wallet:{balance_paise}}` |
| POST | `/m/nudges/{id}/heard` | | `{ok:true}` |
| GET | `/forecasts/{category}` | | `{category, label_en, label_hi, history:[{day, value_paise}] (last 60 days), forecast:[{day,p10_paise,p50_paise,p90_paise}] (next 28), reason:{event, last_year_uplift, explanation_en, explanation_hi}}` |
| GET | `/pools?scope=near|mine|all` | | `Pool[]` |
| GET | `/pools/{id}` | | `Pool` |
| POST | `/pools/{id}/commit` | `{cases, use_credit}` | `PendingAction` |
| GET | `/credit/offer?amount_paise=` | | `CreditOffer` |
| POST | `/actions/{id}/confirm` | | `{pool: Pool, tx: TxRef, loan: Loan|null}` |
| POST | `/actions/{id}/cancel` | | `{ok:true}` |
| POST | `/voice/turn` | multipart: `audio` (webm/opus file) **or** `text`; optional `lang` | `{transcript, reply_text, reply_lang, reply_audio_url: string|null, pending_actions: PendingAction[], suggestions: string[]}` — if `reply_audio_url` is null the frontend speaks `reply_text` with `speechSynthesis` |
| GET | `/m/deliveries` | | `[{pool: Pool, cases, amount_paise, status}]` |
| POST | `/m/deliveries/confirm` | `{qr_payload}` | `{pool: Pool, tx: TxRef, payout_paise, fee_paise, attestation_url: string|null, trust:{score, delta}}` |
| GET | `/trust/me` | | `{score, band, components:{honoured_rate, pools_joined, sales_stability, tenure_months}, history:[{date, score}], attestations:[{kind, pool_id, url, created_at}]}` |
| GET | `/txs/{id}` | | `TxRef` |

### Distributor
| Method | Path | Response |
|---|---|---|
| GET | `/d/orders` | `[{pool: Pool, deliveries:[{merchant:{id,name,lat,lng}, cases, amount_paise, status:'pending'|'delivered'|'refunded'}]}]` |
| GET | `/d/deliveries/{pool_id}/{merchant_id}/qr` | `{qr_payload, expires_at}` — render as a QR code |
| GET | `/d/summary` | `{funded_pools, cases_to_deliver, received_paise, pending_paise, on_time_rate}` |

### Paytm ops
| Method | Path | Response |
|---|---|---|
| GET | `/ops/kpis` | `{pooled_gmv_paise, merchant_savings_paise, loans_paise, fee_revenue_paise, active_pools, funded_pools, merchants, avg_trust, series:[{day, gmv_paise, savings_paise}]}` |
| GET | `/ops/hexes` | `[{h3, center:{lat,lng}, boundary:[[lat,lng],...], demand_index (0..1), merchants, active_pools}]` |
| GET | `/ops/pools` | `Pool[]` |
| GET | `/ops/txs` | `TxRef[]` (latest 20) |

### Demo Director (ops role, only when `demo_mode`)
| Method | Path | Body | Effect |
|---|---|---|---|
| POST | `/demo/clock` | `{offset_minutes}` or `{iso}` | Moves the demo clock |
| POST | `/demo/run-pool-engine` | | Runs pool formation now; returns `{created: Pool[]}` |
| POST | `/demo/pools/{id}/simulate-joins` | `{fill: true}` or `{count}` | Other seeded shops commit until the target is reached |
| POST | `/demo/pools/{id}/simulate-delivery` | `{merchant_id?}` | Confirms delivery for one or all members except the demo merchant |
| POST | `/demo/reset` | | Restores the seeded demo state |

## Seeded demo state (both sides can rely on this)
- Demo merchant: **Ramesh General Store** (owner Ramesh Gupta, kirana, Marol, Andheri East), token `dev-merchant`.
- Demo distributor: **Shree Ganesh Distributors**, token `dev-distributor`. Ops: **Paytm Ops**, token `dev-ops`.
- Demo clock starts at `2026-12-26T09:00:00+05:30` (New Year week).
- One open pool: **Cola 2L** (case of 9, emoji 🥤), target **40 cases**, **27** committed by **11** shops, slabs `[{20,300},{40,600}]`, deadline = now + 3 minutes (demo clock), Ramesh invited with `suggested_cases = 6`.
- 2 more open pools (e.g. Masala Chips 🍟, Sunflower Oil 🛢️) and 3 historic settled pools so Ramesh has savings and a trust score (~712).
