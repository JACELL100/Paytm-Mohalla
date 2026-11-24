// Types mirror docs/API_CONTRACT.md exactly. Money is always integer paise.

export type Role = "merchant" | "distributor" | "ops";
export type Lang = "hi" | "en";

export interface Health {
  status: "ok";
  auth_mode: "dev" | "supabase";
  chain_mode: "off" | "local" | "sepolia";
  llm: boolean;
  stt: boolean;
  demo_mode: boolean;
}

export interface DemoAccount {
  token: string;
  role: Role;
  display_name: string;
  subtitle: string;
}

export interface DemoState {
  now: string;
  demo_mode: boolean;
  /** Minutes between `now` and the demo start (DEMO_NOW), including real time elapsed. */
  clock_offset_minutes: number;
}

export interface DemoClockResponse extends DemoState {
  closed_pools: number;
}

export interface DemoResetResponse {
  ok: boolean;
  now: string;
  /** [cola_id, chips_id, oil_id] — ids change on every reset */
  pools: string[];
  trust: number;
  seconds: number;
}

export interface Attribution {
  text: string;
  url: string;
  licence: string;
  used_for: string;
}

export interface Merchant {
  id: string;
  name: string;
  owner_name: string;
  category: string;
  lat: number;
  lng: number;
  h3_r8: string;
  lang: Lang;
  wallet_address: string;
}

export interface Distributor {
  id: string;
  name: string;
  wallet_address: string;
}

export type TxKind =
  | "create_pool"
  | "permit"
  | "commit"
  | "mint"
  | "deliver"
  | "refund"
  | "mark_failed"
  | "attest";

export type TxStatus = "pending" | "sent" | "confirmed" | "failed" | "simulated";

export interface TxRef {
  id: string;
  kind: TxKind;
  status: TxStatus;
  tx_hash: string | null;
  explorer_url: string | null;
  created_at: string;
}

export interface Sku {
  id: string;
  name: string;
  category: string;
  case_size: number;
  emoji: string;
  base_case_price_paise: number;
}

export interface Slab {
  min_cases: number;
  disc_bps: number;
}

export interface Loan {
  id: string;
  amount_paise: number;
  rate_bps: number;
  tenure_days: number;
  daily_deduct_bps: number;
  status: "offered" | "active" | "repaid";
}

export interface CreditOffer {
  amount_paise: number;
  limit_paise: number;
  rate_bps: number;
  tenure_days: number;
  daily_deduct_bps: number;
  reason_en: string;
  reason_hi: string;
  eligible: boolean;
}

export type DeliveryStatus = "pending" | "delivered" | "refunded";

export interface PoolMine {
  invited: boolean;
  suggested_cases: number | null;
  reason: { event: string; uplift: number; stock_units: number; need_cases: number } | null;
  committed_cases: number;
  amount_paise: number;
  loan: Loan | null;
  delivery_status: DeliveryStatus | null;
  commit_tx: TxRef | null;
}

export type PoolStatus = "draft" | "open" | "funded" | "failed" | "settled";

export interface Pool {
  id: string;
  sku: Sku;
  distributor: { id: string; name: string };
  target_cases: number;
  committed_cases: number;
  member_count: number;
  base_case_price_paise: number;
  case_price_paise: number;
  disc_bps: number;
  savings_per_case_paise: number;
  slabs: Slab[];
  deadline: string;
  delivery_deadline: string;
  status: PoolStatus;
  center: { lat: number; lng: number; area_name: string };
  mine: PoolMine | null;
  chain: {
    pool_id_hex: string;
    contract_address: string | null;
    contract_url: string | null;
    create_tx: TxRef | null;
  };
  recent_joins: { at: string; cases: number }[];
}

export type NudgeKind = "forecast" | "pool_invite" | "pool_funded" | "delivery" | "credit" | "trust";

export interface Nudge {
  id: string;
  kind: NudgeKind;
  text_hi: string;
  text_en: string;
  audio_url: string | null;
  pool_id: string | null;
  created_at: string;
  heard: boolean;
}

export interface ForecastSummary {
  category: string;
  label_hi: string;
  label_en: string;
  emoji: string;
  uplift: number;
  window_start: string;
  window_end: string;
  event: string | null;
  p50_daily_paise: number;
  need_cases: number | null;
}

export interface PendingAction {
  id: string;
  kind: "commit";
  summary_hi: string;
  summary_en: string;
  payload: {
    pool_id: string;
    cases: number;
    amount_paise: number;
    use_credit: boolean;
    credit: CreditOffer | null;
    savings_paise: number;
  };
  expires_at: string;
}

export interface MeResponse {
  profile: { id: string; role: Role | null; display_name: string; lang: Lang };
  merchant: Merchant | null;
  distributor: Distributor | null;
}

export type TrustBand = "Building" | "Good" | "Excellent";

export interface HomeResponse {
  merchant: Merchant;
  nudges: Nudge[];
  forecasts: ForecastSummary[];
  invites: Pool[];
  active_pools: Pool[];
  savings: { total_paise: number; pools_joined: number };
  trust: { score: number; band: TrustBand };
  wallet: { balance_paise: number };
}

export interface ForecastDetail {
  category: string;
  label_en: string;
  label_hi: string;
  history: { day: string; value_paise: number }[];
  forecast: { day: string; p10_paise: number; p50_paise: number; p90_paise: number }[];
  reason: { event: string; last_year_uplift: number; explanation_en: string; explanation_hi: string };
}

export interface ConfirmResponse {
  pool: Pool;
  tx: TxRef;
  loan: Loan | null;
}

export interface VoiceTurnResponse {
  transcript: string;
  reply_text: string;
  reply_lang: Lang;
  reply_audio_url: string | null;
  pending_actions: PendingAction[];
  suggestions: string[];
  /** Set when the merchant said "haan" to an open card: the app must POST /actions/{id}/confirm itself. */
  confirm_action_id: string | null;
}

export interface MerchantDelivery {
  pool: Pool;
  cases: number;
  amount_paise: number;
  status: DeliveryStatus;
}

export interface DeliveryConfirmResponse {
  pool: Pool;
  tx: TxRef;
  payout_paise: number;
  fee_paise: number;
  attestation_url: string | null;
  trust: { score: number; delta: number };
}

export interface TrustResponse {
  score: number;
  band: TrustBand;
  components: {
    honoured_rate: number;
    pools_joined: number;
    sales_stability: number;
    tenure_months: number;
  };
  history: { date: string; score: number }[];
  /** url is null when chain_mode is off (no on-chain attestation) */
  attestations: { kind: string; pool_id: string; url: string | null; created_at: string }[];
}

export interface DistributorOrder {
  pool: Pool;
  deliveries: {
    merchant: { id: string; name: string; lat: number; lng: number };
    cases: number;
    amount_paise: number;
    status: DeliveryStatus;
  }[];
}

export interface DeliveryQr {
  qr_payload: string;
  expires_at: string;
}

export interface DistributorSummary {
  funded_pools: number;
  cases_to_deliver: number;
  received_paise: number;
  pending_paise: number;
  on_time_rate: number;
}

export interface OpsKpis {
  pooled_gmv_paise: number;
  merchant_savings_paise: number;
  loans_paise: number;
  fee_revenue_paise: number;
  active_pools: number;
  funded_pools: number;
  merchants: number;
  avg_trust: number;
  series: { day: string; gmv_paise: number; savings_paise: number }[];
}

export interface OpsHex {
  h3: string;
  center: { lat: number; lng: number };
  boundary: [number, number][];
  demand_index: number;
  merchants: number;
  active_pools: number;
}
