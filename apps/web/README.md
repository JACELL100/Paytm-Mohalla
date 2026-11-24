# Mohalla — web (Next.js)

The merchant phone app, distributor screen, Paytm Ops console and landing page for Mohalla.
Built against [`docs/API_CONTRACT.md`](../../docs/API_CONTRACT.md).

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS v4 · motion · lenis · react-leaflet (OpenStreetMap tiles) ·
qrcode.react · @yudiel/react-qr-scanner · Supabase (`@supabase/ssr`) · Geist + Noto Sans Devanagari.

## Setup

```bash
cd apps/web
npm install
cp .env.example .env.local     # then edit
npm run dev                    # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build (type-checks) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |

## Environment

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | FastAPI base URL |
| `NEXT_PUBLIC_USE_MOCKS` | `false` | `true` runs everything on the in-browser mock API |
| `NEXT_PUBLIC_SUPABASE_URL` | – | Optional. Without both Supabase vars, only demo accounts are shown |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | – | Supabase publishable key |

## Mock mode (no backend)

`src/lib/mock/server.ts` implements **every endpoint in the contract** with the seeded demo world
(Ramesh, the Cola 2L pool at 27/40 with 11 shops, 2 more open pools, 3 settled pools, trust 712, demo clock
starting 26 Dec 2026 09:00 IST). It simulates joins, funding, Pool Credit, tx `pending → sent → confirmed`,
delivery QR + confirm, trust bump, KPIs and the clock.

- Turn on with `NEXT_PUBLIC_USE_MOCKS=true`, **or at runtime** by opening any page with `?mocks=1`
  (`?mocks=0` turns it off). The login page also offers "Use mock data" if the API is unreachable — a handy
  on-stage fallback.
- State lives in `localStorage`, so the merchant, distributor and ops tabs of one browser share one world and
  update each other instantly. "Reset demo" in the Demo Director restores the seed.
- Mirrors the backend's behaviour: wallet ₹3,000 so Pool Credit auto-applies for 6 cases, `/demo/clock`
  `offset_minutes` (absolute) / `advance_minutes` (relative), `confirm_action_id` on a voice "haan",
  `/meta/attributions`, and the Director response shapes.
- Difference from the contract: the mock gives the Cola pool a **10-minute** deadline (contract: 3 min) so a
  relaxed walkthrough doesn't fail the pool. Use the Director clock to shorten it.

## Auth

- `auth_mode=dev` (from `GET /health`): `/login` shows the demo accounts as one-tap cards.
- `auth_mode=supabase`: Google + email/password (sign in / sign up), plus demo cards when `demo_mode`.
  OAuth returns to `/auth/callback` (route handler → `exchangeCodeForSession`) and then routes by role;
  users without a role go to `/onboarding`.
- **Tokens are stored per role** (`mohalla.token.merchant|distributor|ops` in `localStorage`): one browser can run
  `/m`, `/d` and `/ops` side by side in separate tabs, each signed in as a different demo account. Each area uses
  its own dev token, falling back to the Supabase session.

## Routes

| Route | Screen |
|---|---|
| `/` | Landing page (scroll-driven story, pinned "How it works") |
| `/login`, `/onboarding`, `/auth/callback` | Auth |
| `/m` | Merchant home: Soundbox nudge (karaoke TTS), savings, trust, invites, forecasts |
| `/m/pools/[id]` | Live pool: fill animation, slab ladder, countdown, join + Pool Credit, confirm sheet, on-chain receipt, funded celebration |
| `/m/talk` | Mohalla Saathi voice assistant (hold-to-talk / tap-to-toggle, live waveform, inline confirm cards, "haan" confirms) |
| `/m/scan` | Delivery QR scanner + paste-code fallback, payout / fee / attestation / trust bump |
| `/m/trust` | Trust gauge, components, history, EAS attestations |
| `/d` | Distributor: summary, funded orders, per-shop deliveries, big QR modal with copy |
| `/ops` | Ops command centre: KPIs, H3 hex map, GMV chart, tx feed, pools table, Demo Director |

On desktop the merchant app renders inside a phone frame (for projectors); on phones it is full-screen.

### Demo Director shortcuts (`/ops`)
`J` fill joins · `D` simulate delivery · `E` run pool engine · `1/2/3` clock +15m/+1h/+1d · `R` twice = reset · `G`/`Esc` toggle panel.

## Against the real API
Pool ids change on every `/demo/reset`; the pool page shows a "back to Home" state for stale ids, and the
Demo Director dock shows a pulsing **"Pool expired · Reset"** button when the Cola pool has expired.
On a voice "haan" the API returns `confirm_action_id` and the app calls `POST /actions/{id}/confirm` itself.

## Polling (per contract)
Pool page 1.5 s · merchant home 5 s · ops 3 s · tx 1 s while pending. Countdowns use the server demo clock
(`GET /demo/state`, re-synced every 15 s and ticked locally).

## Notes
- Map tiles: © OpenStreetMap contributors (standard OSM tiles, toned with a CSS filter). Weather data credit:
  Open-Meteo.com (shown on the landing footer and Ops screen).
- Voice: if `/health.stt` is true the app records with `MediaRecorder` and posts `audio`; otherwise it uses the
  browser's `SpeechRecognition` (`hi-IN`) and posts `text`. Replies are spoken with `speechSynthesis` when
  `reply_audio_url` is null. Mic and camera need `localhost` or HTTPS.
