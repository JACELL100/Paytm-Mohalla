/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
// In-browser mock of the Mohalla API (docs/API_CONTRACT.md).
// State persists in localStorage so the merchant, distributor and ops tabs share one demo world.

import type {
  CreditOffer,
  DeliveryStatus,
  Lang,
  Loan,
  Merchant,
  Nudge,
  NudgeKind,
  OpsHex,
  PendingAction,
  Pool,
  PoolStatus,
  Role,
  Slab,
  Sku,
  TxKind,
  TxRef,
  TxStatus,
} from "../types";

export class MockError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

const KEY = "mohalla.mock.v3";
const DEMO_NOW = Date.parse("2026-12-26T09:00:00+05:30");
const MAROL = { lat: 19.1136, lng: 72.8797 };
const RAMESH = "7a1c0000-0000-4000-8000-000000000001";
const SHREE_GANESH = "d15b0000-0000-4000-8000-000000000001";
const FEE_BPS = 100;

/* ------------------------------------------------------------------ utils */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (n: number, len: number) => n.toString(16).padStart(len, "0").slice(-len);
const uuid = (ns: number, n: number) => `${hex(ns, 8)}-0000-4000-8000-${hex(n, 12)}`;
function randHex(bytes: number) {
  let s = "0x";
  for (let i = 0; i < bytes; i++) s += hex(Math.floor(Math.random() * 256), 2);
  return s;
}
let idCounter = 0;
const newId = () => uuid(0xabc00000 + (Date.now() % 0xfffff), ++idCounter + Math.floor(Math.random() * 1e9));
const iso = (ms: number) => new Date(ms).toISOString();
const discFor = (slabs: Slab[], cases: number) =>
  slabs.filter((s) => s.min_cases <= cases).reduce((a, s) => Math.max(a, s.disc_bps), 0);

/* ------------------------------------------------------------------ state */

interface MemberRec {
  merchant_id: string;
  cases: number;
  amount_paise: number;
  loan_id: string | null;
  delivery: DeliveryStatus;
  commit_tx_id: string | null;
  at: number;
}
interface PoolRec {
  id: string;
  sku_id: string;
  distributor_id: string;
  target_cases: number;
  slabs: Slab[];
  base_price: number;
  deadline: number;
  delivery_deadline: number;
  status: PoolStatus;
  center: { lat: number; lng: number; area_name: string };
  pool_id_hex: string;
  create_tx_id: string | null;
  members: MemberRec[];
  invites: { merchant_id: string; suggested_cases: number; reason: PoolRec["reason"] }[];
  reason: { event: string; uplift: number; stock_units: number; need_cases: number } | null;
  funded_nudged?: boolean;
}
interface TxRec {
  id: string;
  kind: TxKind;
  created_real: number;
  created: number;
  hash: string;
  instant?: boolean;
}
interface Profile {
  id: string;
  role: Role | null;
  display_name: string;
  lang: Lang;
  merchant_id: string | null;
  distributor_id: string | null;
}
interface State {
  reset_real: number;
  offset_min: number;
  profiles: Record<string, Profile>;
  merchants: Merchant[];
  distributors: { id: string; name: string; wallet_address: string }[];
  skus: Sku[];
  pools: PoolRec[];
  txs: TxRec[];
  nudges: (Omit<Nudge, "created_at"> & { created: number; merchant_id: string })[];
  loans: (Loan & { merchant_id: string })[];
  actions: (PendingAction & { merchant_id: string; status: "open" | "done" | "cancelled" })[];
  qr: Record<string, { nonce: string; exp: number }>;
  wallet: Record<string, number>;
  trust: { score: number; history: { date: string; score: number }[]; attestations: { kind: string; pool_id: string; url: string; created_at: string }[] };
  engine_ran: boolean;
}

const SHOP_NAMES = [
  "Sai Kirana Stores", "Shree Krishna General", "Balaji Provision", "New Bharat Stores", "Gupta Kirana",
  "Om Sai Supermart", "Patel Provision Store", "Jai Hind General", "Laxmi Kirana", "Annapurna Stores",
  "Marol Daily Needs", "Mahavir Provisions", "Ganesh Kirana Bhandar", "Royal General Store", "Navkar Stores",
  "Shiv Shakti Kirana", "Fresh Mart Marol", "Siddhivinayak Stores", "Durga Provision", "Hanuman General",
  "Vijay Kirana", "Apna Bazaar Marol", "Sagar Provision", "Mumbai Kirana House", "Shanti Stores",
  "Kamla Nagar Kirana", "Tirupati Traders", "Om Shanti General", "Sunrise Provision", "Darshan Kirana",
  "Pooja General Store", "Jai Ambe Stores", "Raj Provision", "Bombay Daily Mart", "Saibaba Kirana",
  "Ekta General Store", "Nirmal Provision", "Chamunda Kirana", "Vaishnavi Stores", "Kohinoor General",
  "Mahalaxmi Kirana", "Sahyadri Stores", "Ashirwad Provision", "Swami Samarth Kirana",
];
const OWNERS = ["Suresh", "Mahesh", "Dinesh", "Anil", "Prakash", "Vikas", "Rajesh", "Sunil", "Nitin", "Ajay", "Kiran", "Manoj"];
const SURNAMES = ["Patil", "Shah", "Yadav", "Jain", "Sawant", "Mehta", "Shetty", "Gupta", "Pawar", "Desai"];

function seed(): State {
  const r = rng(29112026);
  const now = DEMO_NOW;
  const merchants: Merchant[] = [
    {
      id: RAMESH, name: "Ramesh General Store", owner_name: "Ramesh Gupta", category: "kirana",
      lat: 19.1129, lng: 72.8812, h3_r8: "8860a2581bfffff", lang: "hi",
      wallet_address: "0x7A1c3B9e2d4F6a8C0E1b3D5f7A9c2E4b6D8f0123",
    },
  ];
  SHOP_NAMES.forEach((name, i) => {
    const ang = r() * Math.PI * 2;
    const dist = 0.002 + r() * 0.013;
    merchants.push({
      id: uuid(0x7a1c0000, i + 2), name,
      owner_name: `${OWNERS[i % OWNERS.length]} ${SURNAMES[(i * 7) % SURNAMES.length]}`,
      category: i % 9 === 4 ? "pharmacy" : i % 11 === 6 ? "dairy" : "kirana",
      lat: MAROL.lat + Math.sin(ang) * dist, lng: MAROL.lng + Math.cos(ang) * dist * 1.05,
      h3_r8: "8860a25" + hex(0x80000 + i * 37, 5) + "ffff", lang: i % 3 === 0 ? "en" : "hi",
      wallet_address: "0x" + hex(Math.floor(r() * 0xffffffff), 8) + "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6".slice(0, 32),
    });
  });
  const distributors = [
    { id: SHREE_GANESH, name: "Shree Ganesh Distributors", wallet_address: "0x5D1a9C0b3E7f2A4d6B8c1E3a5F7b9D2c4E6a8B01" },
    { id: uuid(0xd15b0000, 2), name: "Mahalaxmi Traders", wallet_address: "0x8E2b4D6f1A3c5E7a9B0d2F4b6D8a1C3e5F7b9A02" },
  ];
  const skus: Sku[] = [
    { id: uuid(0x5c000000, 1), name: "Cola 2L", category: "cold_drinks", case_size: 9, emoji: "🥤", base_case_price_paise: 91800 },
    { id: uuid(0x5c000000, 2), name: "Masala Chips 50g", category: "snacks", case_size: 48, emoji: "🍟", base_case_price_paise: 48000 },
    { id: uuid(0x5c000000, 3), name: "Sunflower Oil 1L", category: "edible_oil", case_size: 12, emoji: "🌻", base_case_price_paise: 186000 },
    { id: uuid(0x5c000000, 4), name: "Basmati Rice 5kg", category: "staples", case_size: 4, emoji: "🍚", base_case_price_paise: 196000 },
    { id: uuid(0x5c000000, 5), name: "Tea Leaves 1kg", category: "beverages", case_size: 12, emoji: "🍵", base_case_price_paise: 420000 },
    { id: uuid(0x5c000000, 6), name: "Detergent 1kg", category: "home_care", case_size: 10, emoji: "🧺", base_case_price_paise: 135000 },
    { id: uuid(0x5c000000, 7), name: "Mineral Water 1L", category: "cold_drinks", case_size: 12, emoji: "💧", base_case_price_paise: 18000 },
  ];
  const txs: TxRec[] = [];
  const mkTx = (kind: TxKind, created: number): string => {
    const t: TxRec = { id: newId(), kind, created_real: Date.now() - 600000, created, hash: randHex(32), instant: true };
    txs.push(t);
    return t.id;
  };

  const others = merchants.slice(1);
  const members = (caseList: number[], startIdx: number, priceAfterDisc: number, baseAt: number, delivered: boolean): MemberRec[] =>
    caseList.map((c, i) => ({
      merchant_id: others[(startIdx + i) % others.length].id, cases: c, amount_paise: c * priceAfterDisc,
      loan_id: null, delivery: delivered ? "delivered" : "pending", commit_tx_id: mkTx("commit", baseAt + i * 97000),
      at: baseAt + i * 97000,
    }));

  const pools: PoolRec[] = [];
  const mkPool = (p: Partial<PoolRec> & { sku: Sku; target: number; slabs: Slab[]; caseList: number[]; start: number; deadline: number; status: PoolStatus; createdAt: number; distributor?: string }) => {
    const disc = discFor(p.slabs, p.target);
    const price = Math.round(p.sku.base_case_price_paise * (1 - disc / 10000));
    const rec: PoolRec = {
      id: uuid(0x9001000, pools.length + 1), sku_id: p.sku.id, distributor_id: p.distributor ?? SHREE_GANESH,
      target_cases: p.target, slabs: p.slabs, base_price: p.sku.base_case_price_paise, deadline: p.deadline,
      delivery_deadline: p.deadline + 2 * 86400000, status: p.status,
      center: { lat: MAROL.lat + (r() - 0.5) * 0.006, lng: MAROL.lng + (r() - 0.5) * 0.006, area_name: "Marol, Andheri East" },
      pool_id_hex: randHex(32), create_tx_id: mkTx("create_pool", p.createdAt),
      members: members(p.caseList, p.start, price, p.createdAt + 60000, p.status === "settled"),
      invites: [], reason: p.reason ?? null,
    };
    pools.push(rec);
    return rec;
  };

  const cola = mkPool({
    sku: skus[0], target: 40, slabs: [{ min_cases: 20, disc_bps: 300 }, { min_cases: 40, disc_bps: 600 }],
    caseList: [3, 2, 4, 2, 3, 2, 2, 3, 2, 2, 2], start: 0, deadline: now + 10 * 60000, status: "open", createdAt: now - 3 * 3600000,
    reason: { event: "New Year week", uplift: 2.3, stock_units: 36, need_cases: 9 },
  });
  cola.invites.push({ merchant_id: RAMESH, suggested_cases: 6, reason: cola.reason });
  // spread the 11 seeded joins over the last 2 hours so the feed looks alive
  cola.members.forEach((m, i) => (m.at = now - (11 - i) * 9 * 60000));
  const chips = mkPool({
    sku: skus[1], target: 30, slabs: [{ min_cases: 15, disc_bps: 250 }, { min_cases: 30, disc_bps: 500 }],
    caseList: [2, 2, 3, 2, 1, 2, 2], start: 11, deadline: now + 2 * 3600000, status: "open", createdAt: now - 5 * 3600000,
    reason: { event: "New Year week", uplift: 1.9, stock_units: 60, need_cases: 3 },
  });
  chips.invites.push({ merchant_id: RAMESH, suggested_cases: 3, reason: chips.reason });
  mkPool({
    sku: skus[2], target: 50, slabs: [{ min_cases: 25, disc_bps: 300 }, { min_cases: 50, disc_bps: 550 }],
    caseList: [3, 2, 3, 2, 2, 3, 2, 3, 2], start: 18, deadline: now + 26 * 3600000, status: "open", createdAt: now - 20 * 3600000,
    distributor: distributors[1].id,
  });
  const hist: [Sku, number, number, number, number][] = [
    [skus[3], 30, 500, 3, 42],
    [skus[4], 24, 400, 2, 27],
    [skus[5], 40, 500, 4, 13],
  ];
  hist.forEach(([sku, target, disc, mine, daysAgo], hi) => {
    const created = now - daysAgo * 86400000;
    const list: number[] = [];
    let left = target - mine;
    while (left > 0) {
      const c = Math.min(left, 2 + ((list.length + hi) % 3));
      list.push(c);
      left -= c;
    }
    const p = mkPool({
      sku, target, slabs: [{ min_cases: Math.round(target / 2), disc_bps: Math.round(disc / 2) }, { min_cases: target, disc_bps: disc }],
      caseList: list, start: 5 + hi * 6, deadline: created + 2 * 86400000, status: "settled", createdAt: created,
    });
    const price = Math.round(sku.base_case_price_paise * (1 - disc / 10000));
    p.members.push({
      merchant_id: RAMESH, cases: mine, amount_paise: mine * price, loan_id: null, delivery: "delivered",
      commit_tx_id: mkTx("commit", created + 3600000), at: created + 3600000,
    });
  });

  const n = (kind: NudgeKind, minsAgo: number, text_hi: string, text_en: string, pool_id: string | null = null, heard = true) => ({
    id: newId(), kind, text_hi, text_en, audio_url: null, pool_id, created: now - minsAgo * 60000, heard, merchant_id: RAMESH,
  });
  const nudges = [
    n("pool_invite", 2,
      "रमेश जी, New Year week में आपके area में cold drinks की demand 2.3 गुना रहेगी। आपके पास 4 case हैं, 9 और चाहिए। 11 दुकानें pool बना रही हैं — 40 case पे 6% scheme। Join करें?",
      "Ramesh ji, cold-drink demand in your area will be 2.3x in New Year week. You have 4 cases and need 9 more. 11 shops are pooling — 6% scheme at 40 cases. Join?",
      cola.id, false),
    n("forecast", 95,
      "इस हफ़्ते snacks की बिक्री 1.9 गुना रहने का अनुमान है। Masala Chips का pool खुला है।",
      "Snack sales are forecast at 1.9x this week. A Masala Chips pool is open.", chips.id),
    n("trust", 60 * 26,
      "बधाई हो! समय पर delivery confirm करने से आपका Trust Score 712 हो गया।",
      "Congrats! Confirming deliveries on time raised your Trust Score to 712."),
  ];

  const history: { date: string; score: number }[] = [];
  const scores = [618, 626, 631, 640, 652, 655, 668, 676, 684, 690, 701, 712];
  scores.forEach((s, i) => history.push({ date: iso(now - (scores.length - 1 - i) * 14 * 86400000), score: s }));
  const attestations = pools
    .filter((p) => p.status === "settled")
    .map((p) => ({ kind: "MohallaDelivery", pool_id: p.id, url: `https://sepolia.easscan.org/attestation/view/${randHex(32)}`, created_at: iso(p.deadline + 86400000) }));

  return {
    reset_real: Date.now(),
    offset_min: 0,
    profiles: {
      "dev-merchant": { id: uuid(0x9f000000, 1), role: "merchant", display_name: "Ramesh Gupta", lang: "hi", merchant_id: RAMESH, distributor_id: null },
      "dev-distributor": { id: uuid(0x9f000000, 2), role: "distributor", display_name: "Shree Ganesh Distributors", lang: "en", merchant_id: null, distributor_id: SHREE_GANESH },
      "dev-ops": { id: uuid(0x9f000000, 3), role: "ops", display_name: "Paytm Ops", lang: "en", merchant_id: null, distributor_id: null },
    },
    merchants, distributors, skus, pools, txs, nudges, loans: [], actions: [], qr: {},
    wallet: { [RAMESH]: 300000 },
    trust: { score: 712, history, attestations },
    engine_ran: false,
  };
}

/* ------------------------------------------------------------------ store */

let mem: State | null = null;
function load(): State {
  if (typeof window === "undefined") return (mem ??= seed());
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* ignore */
  }
  const s = seed();
  save(s);
  return s;
}
function save(s: State) {
  mem = s;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
export const MOCK_STORAGE_KEY = KEY;

const demoNow = (s: State) => DEMO_NOW + (Date.now() - s.reset_real) + s.offset_min * 60000;

/* ------------------------------------------------------------ derivations */

function txStatus(t: TxRec): TxStatus {
  if (t.instant) return "confirmed";
  const age = Date.now() - t.created_real;
  if (age < 1400) return "pending";
  if (age < 3200) return "sent";
  return "confirmed";
}
function txRef(s: State, id: string | null): TxRef | null {
  if (!id) return null;
  const t = s.txs.find((x) => x.id === id);
  if (!t) return null;
  const status = txStatus(t);
  const sent = status !== "pending";
  return {
    id: t.id, kind: t.kind, status, tx_hash: sent ? t.hash : null,
    explorer_url: sent ? (t.kind === "attest" ? `https://sepolia.easscan.org/attestation/view/${t.hash}` : `https://sepolia.etherscan.io/tx/${t.hash}`) : null,
    created_at: iso(t.created),
  };
}
function addTx(s: State, kind: TxKind): TxRec {
  const t: TxRec = { id: newId(), kind, created_real: Date.now(), created: demoNow(s), hash: randHex(32) };
  s.txs.push(t);
  return t;
}
function addNudge(s: State, kind: NudgeKind, hi: string, en: string, pool_id: string | null = null) {
  s.nudges.push({ id: newId(), kind, text_hi: hi, text_en: en, audio_url: null, pool_id, created: demoNow(s), heard: false, merchant_id: RAMESH });
}

const visible = (s: State, p: PoolRec) => p.members.filter((m) => m.at <= demoNow(s));
const poolDisc = (p: PoolRec) => discFor(p.slabs, p.target_cases);
const poolPrice = (p: PoolRec) => Math.round(p.base_price * (1 - poolDisc(p) / 10000));

/** Advance lazily-evaluated state: scheduled joins, funded/failed/settled transitions. */
function tick(s: State): boolean {
  const now = demoNow(s);
  let changed = false;
  for (const p of s.pools) {
    const vis = visible(s, p);
    const committed = vis.reduce((a, m) => a + m.cases, 0);
    if (p.status === "open" && committed >= p.target_cases) {
      p.status = "funded";
      changed = true;
      if (!p.funded_nudged && p.members.some((m) => m.merchant_id === RAMESH)) {
        p.funded_nudged = true;
        const sku = s.skus.find((k) => k.id === p.sku_id)!;
        addNudge(s, "pool_funded",
          `खुशखबरी! ${sku.name} pool पूरा हो गया — ${p.target_cases} case, ${poolDisc(p) / 100}% scheme पक्की। Delivery कल तक आएगी।`,
          `Great news! The ${sku.name} pool is funded — ${p.target_cases} cases, ${poolDisc(p) / 100}% scheme locked. Delivery arrives by tomorrow.`, p.id);
      }
    } else if (p.status === "open" && now > p.deadline) {
      p.status = "failed";
      p.members.forEach((m) => (m.delivery = "refunded"));
      p.members = p.members.filter((m) => m.at <= now);
      addTx(s, "mark_failed");
      changed = true;
    } else if (p.status === "funded" && p.members.length > 0 && p.members.every((m) => m.delivery === "delivered")) {
      p.status = "settled";
      changed = true;
    }
  }
  return changed;
}

function poolView(s: State, p: PoolRec, viewer: Profile | null): Pool {
  const sku = s.skus.find((k) => k.id === p.sku_id)!;
  const dist = s.distributors.find((d) => d.id === p.distributor_id)!;
  const vis = visible(s, p);
  const disc = poolDisc(p);
  const price = poolPrice(p);
  let mine: Pool["mine"] = null;
  if (viewer?.role === "merchant" && viewer.merchant_id) {
    const mem = p.members.find((m) => m.merchant_id === viewer.merchant_id);
    const inv = p.invites.find((i) => i.merchant_id === viewer.merchant_id);
    const loan = mem?.loan_id ? s.loans.find((l) => l.id === mem.loan_id) ?? null : null;
    mine = {
      invited: !!inv, suggested_cases: inv?.suggested_cases ?? null, reason: inv?.reason ?? null,
      committed_cases: mem?.cases ?? 0, amount_paise: mem?.amount_paise ?? 0,
      loan: loan ? (({ merchant_id: _m, ...l }) => l)(loan) : null,
      delivery_status: mem ? mem.delivery : null, commit_tx: txRef(s, mem?.commit_tx_id ?? null),
    };
  }
  return {
    id: p.id, sku, distributor: { id: dist.id, name: dist.name },
    target_cases: p.target_cases, committed_cases: vis.reduce((a, m) => a + m.cases, 0), member_count: vis.length,
    base_case_price_paise: p.base_price, case_price_paise: price, disc_bps: disc, savings_per_case_paise: p.base_price - price,
    slabs: p.slabs, deadline: iso(p.deadline), delivery_deadline: iso(p.delivery_deadline), status: p.status,
    center: p.center, mine,
    chain: {
      pool_id_hex: p.pool_id_hex, contract_address: "0x4d0A11a2A1E8b6E0c3F5b1C9d2E7a3F8b6C1d9E4",
      contract_url: "https://sepolia.etherscan.io/address/0x4d0A11a2A1E8b6E0c3F5b1C9d2E7a3F8b6C1d9E4",
      create_tx: txRef(s, p.create_tx_id),
    },
    recent_joins: [...vis].sort((a, b) => b.at - a.at).slice(0, 10).map((m) => ({ at: iso(m.at), cases: m.cases })),
  };
}

function creditOffer(s: State, amount: number): CreditOffer {
  const limit = 1500000;
  return {
    amount_paise: Math.min(amount, limit), limit_paise: limit, rate_bps: s.trust.score > 750 ? 1650 : 1950, tenure_days: 30,
    daily_deduct_bps: 1000, eligible: amount <= limit,
    reason_en: "Your Paytm collections averaged ₹6,240/day over the last 90 days with steady weekly patterns.",
    reason_hi: "पिछले 90 दिनों में आपकी Paytm कमाई औसतन ₹6,240 रोज़ रही, और हर हफ़्ते स्थिर रही।",
  };
}

function band(score: number) {
  return score >= 750 ? "Excellent" : score >= 650 ? "Good" : "Building";
}

/* ---------------------------------------------------------------- handler */

function profileFor(s: State, token: string | null): Profile {
  if (!token || !s.profiles[token]) throw new MockError(401, "Not signed in");
  return s.profiles[token];
}
function meResp(s: State, p: Profile) {
  return {
    profile: { id: p.id, role: p.role, display_name: p.display_name, lang: p.lang },
    merchant: p.merchant_id ? { ...s.merchants.find((m) => m.id === p.merchant_id)!, lang: p.lang } : null,
    distributor: p.distributor_id ? s.distributors.find((d) => d.id === p.distributor_id) ?? null : null,
  };
}
function requireRole(p: Profile, role: Role) {
  if (p.role !== role) throw new MockError(403, `This needs the ${role} role`);
}
function getPool(s: State, id: string) {
  const p = s.pools.find((x) => x.id === id);
  if (!p) throw new MockError(404, "Pool not found");
  return p;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mockRequest(method: string, rawPath: string, body: any, token: string | null): Promise<any> {
  await sleep(120 + Math.random() * 160);
  const [path, qs] = rawPath.split("?");
  const query = new URLSearchParams(qs ?? "");
  const s = load();
  const changed = tick(s);
  const result = await route(s, method, path, query, body, token);
  if (changed || method !== "GET" || result === SAVE || path.endsWith("/qr")) save(s);
  return result === SAVE ? { ok: true } : result;
}
const SAVE = Symbol("save");

async function route(s: State, method: string, path: string, query: URLSearchParams, body: any, token: string | null): Promise<any> {
  const seg = path.split("/").filter(Boolean);
  const M = (m: string, pattern: string) => {
    if (m !== method) return null;
    const ps = pattern.split("/").filter(Boolean);
    if (ps.length !== seg.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < ps.length; i++) {
      if (ps[i].startsWith(":")) params[ps[i].slice(1)] = decodeURIComponent(seg[i]);
      else if (ps[i] !== seg[i]) return null;
    }
    return params;
  };
  let a: Record<string, string> | null;
  const now = demoNow(s);

  /* public */
  if (M("GET", "/health"))
    return { status: "ok", auth_mode: "dev", chain_mode: "sepolia", llm: false, stt: false, demo_mode: true };
  if (M("GET", "/demo/accounts"))
    return [
      { token: "dev-merchant", role: "merchant", display_name: "Ramesh General Store", subtitle: "Ramesh Gupta · Kirana · Marol" },
      { token: "dev-distributor", role: "distributor", display_name: "Shree Ganesh Distributors", subtitle: "FMCG distributor · Andheri East" },
      { token: "dev-ops", role: "ops", display_name: "Paytm Ops", subtitle: "Command centre · Demo Director" },
    ];
  if (M("GET", "/demo/state")) return { now: iso(now), demo_mode: true, clock_offset_minutes: Math.round((now - DEMO_NOW) / 60000) };
  if (M("GET", "/meta/attributions"))
    return [
      { text: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright", licence: "ODbL 1.0", used_for: "shop locations and types" },
      { text: "Weather data by Open-Meteo.com", url: "https://open-meteo.com/", licence: "CC BY 4.0", used_for: "rain and temperature effects in sales and forecasts" },
      { text: "Holiday dates: holidays (Python package)", url: "https://github.com/vacanza/holidays", licence: "MIT", used_for: "festival calendar" },
    ];

  const me = profileFor(s, token);

  /* profile */
  if (M("GET", "/me")) return meResp(s, me);
  if (M("PATCH", "/me")) {
    if (body?.lang) me.lang = body.lang;
    return meResp(s, me);
  }
  if (M("GET", "/onboarding/shops")) {
    const claimed = new Set(Object.values(s.profiles).map((p) => p.merchant_id));
    return s.merchants.filter((m) => !claimed.has(m.id)).slice(0, 20);
  }
  if (M("POST", "/onboarding")) {
    me.role = body.role;
    if (body.role === "merchant") {
      me.merchant_id = body.merchant_id ?? me.merchant_id ?? s.merchants[1].id;
      me.display_name = s.merchants.find((m) => m.id === me.merchant_id)?.owner_name ?? me.display_name;
    }
    if (body.role === "distributor") me.distributor_id = me.distributor_id ?? SHREE_GANESH;
    return meResp(s, me);
  }

  /* merchant */
  if (M("GET", "/m/home")) {
    requireRole(me, "merchant");
    const mid = me.merchant_id!;
    const merchant = { ...s.merchants.find((m) => m.id === mid)!, lang: me.lang };
    const pools = s.pools.map((p) => poolView(s, p, me));
    const savingsPools = s.pools.filter((p) => p.status !== "failed" && p.members.some((m) => m.merchant_id === mid && m.at <= now));
    const total = savingsPools.reduce((a, p) => a + (p.base_price - poolPrice(p)) * p.members.find((m) => m.merchant_id === mid)!.cases, 0);
    return {
      merchant,
      nudges: s.nudges.filter((x) => x.merchant_id === mid).sort((a, b) => b.created - a.created).slice(0, 10)
        .map(({ created, merchant_id: _m, ...rest }) => ({ ...rest, created_at: iso(created) })),
      forecasts: [
        { category: "cold_drinks", label_hi: "ठंडे पेय", label_en: "Cold drinks", emoji: "🥤", uplift: 2.3, window_start: iso(now), window_end: iso(now + 7 * 86400000), event: "New Year week", p50_daily_paise: 312000, need_cases: 9 },
        { category: "snacks", label_hi: "नमकीन / चिप्स", label_en: "Snacks", emoji: "🍟", uplift: 1.9, window_start: iso(now), window_end: iso(now + 7 * 86400000), event: "New Year week", p50_daily_paise: 184000, need_cases: 3 },
        { category: "bakery", label_hi: "बेकरी", label_en: "Bakery", emoji: "🍞", uplift: 1.6, window_start: iso(now), window_end: iso(now + 7 * 86400000), event: "Christmas–New Year", p50_daily_paise: 96000, need_cases: null },
      ],
      invites: pools.filter((p) => p.status === "open" && p.mine?.invited && p.mine.committed_cases === 0),
      active_pools: pools.filter((p) => (p.status === "open" || p.status === "funded") && (p.mine?.committed_cases ?? 0) > 0),
      savings: { total_paise: total, pools_joined: savingsPools.length },
      trust: { score: s.trust.score, band: band(s.trust.score) },
      wallet: { balance_paise: s.wallet[mid] ?? 0 },
    };
  }
  if ((a = M("POST", "/m/nudges/:id/heard"))) {
    const nd = s.nudges.find((x) => x.id === a!.id);
    if (nd) nd.heard = true;
    return { ok: true };
  }
  if ((a = M("GET", "/forecasts/:category"))) {
    const rr = rng(a.category.length * 7919);
    const base = a.category === "cold_drinks" ? 132000 : 90000;
    const uplift = a.category === "cold_drinks" ? 2.3 : 1.9;
    const history = Array.from({ length: 60 }, (_, i) => {
      const d = now - (60 - i) * 86400000;
      const wk = [1, 0.92, 0.95, 0.97, 1.05, 1.22, 1.3][new Date(d).getDay()];
      const xmas = i > 55 ? 1.5 : 1;
      return { day: iso(d).slice(0, 10), value_paise: Math.round(base * wk * xmas * (0.88 + rr() * 0.24)) };
    });
    const forecast = Array.from({ length: 28 }, (_, i) => {
      const d = now + i * 86400000;
      const wk = [1, 0.92, 0.95, 0.97, 1.05, 1.22, 1.3][new Date(d).getDay()];
      const ev = i <= 7 ? uplift : 1 + (uplift - 1) * Math.exp(-(i - 7) / 3);
      const p50 = base * wk * ev;
      return { day: iso(d).slice(0, 10), p10_paise: Math.round(p50 * 0.78), p50_paise: Math.round(p50), p90_paise: Math.round(p50 * 1.24) };
    });
    return {
      category: a.category, label_en: a.category === "cold_drinks" ? "Cold drinks" : "Snacks", label_hi: a.category === "cold_drinks" ? "ठंडे पेय" : "नमकीन",
      history, forecast,
      reason: {
        event: "New Year week", last_year_uplift: uplift,
        explanation_en: `Last New Year week your ${a.category === "cold_drinks" ? "cold-drink" : "snack"} sales were ${uplift}x a normal week.`,
        explanation_hi: `पिछले साल New Year week में आपकी ${a.category === "cold_drinks" ? "cold drinks" : "snacks"} की बिक्री आम हफ़्ते से ${uplift} गुना थी।`,
      },
    };
  }
  if (M("GET", "/pools")) {
    const scope = query.get("scope") ?? "near";
    let list = s.pools;
    if (scope === "mine" && me.merchant_id) list = list.filter((p) => p.members.some((m) => m.merchant_id === me.merchant_id));
    if (scope === "near") list = list.filter((p) => p.status === "open" || p.status === "funded");
    return list.map((p) => poolView(s, p, me));
  }
  if ((a = M("GET", "/pools/:id"))) return poolView(s, getPool(s, a.id), me);
  if ((a = M("POST", "/pools/:id/commit"))) {
    requireRole(me, "merchant");
    const p = getPool(s, a.id);
    if (p.status !== "open") throw new MockError(409, "This pool is no longer open");
    const cases = Math.floor(Number(body?.cases));
    const committed = visible(s, p).reduce((x, m) => x + m.cases, 0);
    const remaining = p.target_cases - committed;
    if (!(cases >= 1)) throw new MockError(422, "Choose at least 1 case");
    if (cases > remaining) throw new MockError(409, `Only ${remaining} cases left in this pool`);
    const amount = cases * poolPrice(p);
    // Contract: too little balance → credit switches on automatically (shown on the card).
    const useCredit = !!body?.use_credit || (s.wallet[me.merchant_id!] ?? 0) < amount;
    const credit = useCredit ? creditOffer(s, amount) : null;
    const sku = s.skus.find((k) => k.id === p.sku_id)!;
    const savings = cases * (p.base_price - poolPrice(p));
    const fmt = (x: number) => "₹" + Math.round(x / 100).toLocaleString("en-IN");
    const action = {
      id: newId(), kind: "commit" as const, merchant_id: me.merchant_id!, status: "open" as const,
      summary_hi: `${sku.name} के ${cases} case, ${fmt(amount)}${useCredit ? ` — Pool Credit से, ${credit!.tenure_days} दिन में रोज़ की कमाई से कटेगा` : " — Paytm wallet से"}। आपकी बचत ${fmt(savings)}।`,
      summary_en: `${cases} cases of ${sku.name} for ${fmt(amount)}${useCredit ? ` — on Pool Credit, repaid from daily settlements over ${credit!.tenure_days} days` : " — from your Paytm wallet"}. You save ${fmt(savings)}.`,
      payload: { pool_id: p.id, cases, amount_paise: amount, use_credit: useCredit, credit, savings_paise: savings },
      expires_at: iso(now + 5 * 60000),
    };
    s.actions.push(action);
    const { merchant_id: _m, status: _s, ...pub } = action;
    return pub;
  }
  if (M("GET", "/credit/offer")) return creditOffer(s, Number(query.get("amount_paise") ?? 0));
  if ((a = M("POST", "/actions/:id/confirm"))) {
    const act = s.actions.find((x) => x.id === a!.id);
    if (!act || act.status !== "open") throw new MockError(404, "This confirmation has expired");
    if (Date.parse(act.expires_at) < now) throw new MockError(410, "This confirmation expired — please try again");
    const p = getPool(s, act.payload.pool_id);
    if (p.status !== "open") throw new MockError(409, "This pool is no longer open");
    act.status = "done";
    let loan: Loan | null = null;
    if (act.payload.use_credit && act.payload.credit) {
      const l = { id: newId(), amount_paise: act.payload.amount_paise, rate_bps: act.payload.credit.rate_bps, tenure_days: act.payload.credit.tenure_days, daily_deduct_bps: act.payload.credit.daily_deduct_bps, status: "active" as const, merchant_id: act.merchant_id };
      s.loans.push(l);
      addTx(s, "mint");
      const { merchant_id: _m, ...pub } = l;
      loan = pub;
    } else {
      s.wallet[act.merchant_id] = (s.wallet[act.merchant_id] ?? 0) - act.payload.amount_paise;
    }
    const tx = addTx(s, "commit");
    const existing = p.members.find((m) => m.merchant_id === act.merchant_id);
    if (existing) {
      existing.cases += act.payload.cases;
      existing.amount_paise += act.payload.amount_paise;
      existing.commit_tx_id = tx.id;
      if (loan) existing.loan_id = loan.id;
    } else {
      p.members.push({ merchant_id: act.merchant_id, cases: act.payload.cases, amount_paise: act.payload.amount_paise, loan_id: loan?.id ?? null, delivery: "pending", commit_tx_id: tx.id, at: now });
    }
    s.nudges.filter((x) => x.pool_id === p.id).forEach((x) => (x.heard = true));
    tick(s);
    return { pool: poolView(s, p, me), tx: txRef(s, tx.id), loan };
  }
  if ((a = M("POST", "/actions/:id/cancel"))) {
    const act = s.actions.find((x) => x.id === a!.id);
    if (act) act.status = "cancelled";
    return { ok: true };
  }
  if (M("POST", "/voice/turn")) return voice(s, me, body);
  if (M("GET", "/m/deliveries")) {
    requireRole(me, "merchant");
    return s.pools
      .filter((p) => (p.status === "funded" || p.status === "settled") && p.members.some((m) => m.merchant_id === me.merchant_id))
      .map((p) => {
        const m = p.members.find((x) => x.merchant_id === me.merchant_id)!;
        return { pool: poolView(s, p, me), cases: m.cases, amount_paise: m.amount_paise, status: m.delivery };
      });
  }
  if (M("POST", "/m/deliveries/confirm")) {
    requireRole(me, "merchant");
    const parsed = parseQr(String(body?.qr_payload ?? ""));
    if (!parsed) throw new MockError(422, "This QR code isn't a Mohalla delivery code");
    if (parsed.m !== me.merchant_id) throw new MockError(403, "This delivery code belongs to another shop");
    const rec = s.qr[`${parsed.p}:${parsed.m}`];
    if (!rec || rec.nonce !== parsed.n) throw new MockError(409, "This code was already used or replaced");
    if (rec.exp < now) throw new MockError(410, "This code expired — ask the distributor to refresh it");
    const p = getPool(s, parsed.p);
    const m = p.members.find((x) => x.merchant_id === me.merchant_id);
    if (!m) throw new MockError(404, "You are not in this pool");
    if (m.delivery === "delivered") throw new MockError(409, "Delivery already confirmed");
    if (p.status !== "funded") throw new MockError(409, "This pool isn't funded yet");
    m.delivery = "delivered";
    delete s.qr[`${parsed.p}:${parsed.m}`];
    const tx = addTx(s, "deliver");
    const att = addTx(s, "attest");
    const fee = Math.floor((m.amount_paise * FEE_BPS) / 10000);
    const delta = 14;
    s.trust.score = Math.min(900, s.trust.score + delta);
    s.trust.history.push({ date: iso(now), score: s.trust.score });
    const attUrl = `https://sepolia.easscan.org/attestation/view/${att.hash}`;
    s.trust.attestations.unshift({ kind: "MohallaDelivery", pool_id: p.id, url: attUrl, created_at: iso(now) });
    const sku = s.skus.find((k) => k.id === p.sku_id)!;
    addNudge(s, "trust", `Delivery पक्की! ${sku.name} के ${m.cases} case मिल गए। आपका Trust Score ${delta} बढ़कर ${s.trust.score} हो गया।`,
      `Delivery confirmed! ${m.cases} cases of ${sku.name} received. Your Trust Score rose ${delta} points to ${s.trust.score}.`, p.id);
    tick(s);
    return { pool: poolView(s, p, me), tx: txRef(s, tx.id), payout_paise: m.amount_paise - fee, fee_paise: fee, attestation_url: attUrl, trust: { score: s.trust.score, delta } };
  }
  if (M("GET", "/trust/me")) {
    const mid = me.merchant_id;
    const joined = s.pools.filter((p) => p.members.some((m) => m.merchant_id === mid && m.at <= now)).length;
    return {
      score: s.trust.score, band: band(s.trust.score),
      components: { honoured_rate: 1, pools_joined: joined, sales_stability: 0.82, tenure_months: 31 },
      history: s.trust.history, attestations: s.trust.attestations,
    };
  }
  if ((a = M("GET", "/txs/:id"))) {
    const t = txRef(s, a.id);
    if (!t) throw new MockError(404, "Transaction not found");
    return t;
  }

  /* distributor */
  if (M("GET", "/d/orders")) {
    requireRole(me, "distributor");
    return s.pools
      .filter((p) => p.distributor_id === me.distributor_id && (p.status === "funded" || p.status === "settled"))
      .sort((x, y) => (x.status === y.status ? y.deadline - x.deadline : x.status === "funded" ? -1 : 1))
      .map((p) => ({
        pool: poolView(s, p, me),
        deliveries: p.members.map((m) => {
          const mm = s.merchants.find((x) => x.id === m.merchant_id)!;
          return { merchant: { id: mm.id, name: mm.name, lat: mm.lat, lng: mm.lng }, cases: m.cases, amount_paise: m.amount_paise, status: m.delivery };
        }),
      }));
  }
  if ((a = M("GET", "/d/deliveries/:pool/:merchant/qr"))) {
    requireRole(me, "distributor");
    const p = getPool(s, a.pool);
    if (!p.members.some((m) => m.merchant_id === a!.merchant)) throw new MockError(404, "Shop not in this pool");
    const nonce = randHex(8).slice(2);
    const exp = now + 30 * 60000;
    s.qr[`${a.pool}:${a.merchant}`] = { nonce, exp };
    const payload = { v: 1, p: a.pool, m: a.merchant, n: nonce, e: Math.floor(exp / 1000) };
    const hmac = randHex(16).slice(2);
    return { qr_payload: `MOHALLA1.${b64(JSON.stringify(payload))}.${hmac}`, expires_at: iso(exp) };
  }
  if (M("GET", "/d/summary")) {
    requireRole(me, "distributor");
    const mine = s.pools.filter((p) => p.distributor_id === me.distributor_id);
    const funded = mine.filter((p) => p.status === "funded");
    const all = mine.flatMap((p) => (p.status === "funded" || p.status === "settled" ? p.members : []));
    return {
      funded_pools: funded.length,
      cases_to_deliver: funded.flatMap((p) => p.members).filter((m) => m.delivery === "pending").reduce((x, m) => x + m.cases, 0),
      received_paise: all.filter((m) => m.delivery === "delivered").reduce((x, m) => x + m.amount_paise - Math.floor((m.amount_paise * FEE_BPS) / 10000), 0),
      pending_paise: all.filter((m) => m.delivery === "pending").reduce((x, m) => x + m.amount_paise, 0),
      on_time_rate: 0.96,
    };
  }

  /* ops */
  if (M("GET", "/ops/kpis")) {
    requireRole(me, "ops");
    const live = s.pools.filter((p) => p.status !== "failed");
    const members = live.flatMap((p) => visible(s, p).map((m) => ({ m, p })));
    const gmv = members.reduce((x, { m }) => x + m.amount_paise, 0);
    const savings = members.reduce((x, { m, p }) => x + m.cases * (p.base_price - poolPrice(p)), 0);
    const loans = s.loans.reduce((x, l) => x + l.amount_paise, 0);
    const fees = members.filter(({ m }) => m.delivery === "delivered").reduce((x, { m }) => x + Math.floor((m.amount_paise * FEE_BPS) / 10000), 0);
    const BASE = { gmv: 362_400_000, savings: 21_400_000, loans: 68_400_000, fees: 3_624_000 };
    const rr = rng(42);
    const series = Array.from({ length: 30 }, (_, i) => {
      const day = now - (29 - i) * 86400000;
      const growth = 0.55 + (i / 29) * 0.9;
      const g = Math.round((BASE.gmv / 30) * growth * (0.8 + rr() * 0.4));
      return { day: iso(day).slice(0, 10), gmv_paise: g, savings_paise: Math.round(g * (0.052 + rr() * 0.012)) };
    });
    series[29].gmv_paise += gmv;
    series[29].savings_paise += savings;
    return {
      pooled_gmv_paise: Math.round(BASE.gmv + gmv), merchant_savings_paise: Math.round(BASE.savings + savings),
      loans_paise: BASE.loans + loans, fee_revenue_paise: Math.round(BASE.fees + fees),
      active_pools: s.pools.filter((p) => p.status === "open").length,
      funded_pools: s.pools.filter((p) => p.status === "funded" || p.status === "settled").length,
      merchants: 300, avg_trust: Math.round(681 + (s.trust.score - 712) / 10), series,
    };
  }
  if (M("GET", "/ops/hexes")) {
    requireRole(me, "ops");
    return hexes(s);
  }
  if (M("GET", "/ops/pools")) {
    requireRole(me, "ops");
    return [...s.pools].sort((x, y) => statusRank(x.status) - statusRank(y.status) || x.deadline - y.deadline).map((p) => poolView(s, p, me));
  }
  if (M("GET", "/ops/txs")) {
    requireRole(me, "ops");
    return [...s.txs].sort((x, y) => y.created_real - x.created_real || y.created - x.created).slice(0, 20).map((t) => txRef(s, t.id)!);
  }

  /* demo director */
  if (M("POST", "/demo/clock")) {
    requireRole(me, "ops");
    const elapsedMin = (Date.now() - s.reset_real) / 60000;
    if (body?.iso) s.offset_min = Math.round((Date.parse(body.iso) - (DEMO_NOW + (Date.now() - s.reset_real))) / 60000);
    else if (typeof body?.offset_minutes === "number") s.offset_min = Math.round(body.offset_minutes - elapsedMin); // absolute
    else if (typeof body?.advance_minutes === "number") s.offset_min += body.advance_minutes; // relative
    else throw new MockError(400, "Send offset_minutes, iso or advance_minutes");
    const openBefore = s.pools.filter((p) => p.status === "open").length;
    tick(s);
    const closed = Math.max(0, openBefore - s.pools.filter((p) => p.status === "open").length);
    const n = demoNow(s);
    return { now: iso(n), demo_mode: true, clock_offset_minutes: Math.round((n - DEMO_NOW) / 60000), closed_pools: closed };
  }
  if (M("POST", "/demo/run-pool-engine")) {
    requireRole(me, "ops");
    if (s.engine_ran) return { created: [] };
    s.engine_ran = true;
    const sku = s.skus[6];
    const target = 60;
    const slabs = [{ min_cases: 30, disc_bps: 400 }, { min_cases: 60, disc_bps: 800 }];
    const rec: PoolRec = {
      id: newId(), sku_id: sku.id, distributor_id: SHREE_GANESH, target_cases: target, slabs, base_price: sku.base_case_price_paise,
      deadline: now + 6 * 3600000, delivery_deadline: now + 54 * 3600000, status: "open",
      center: { lat: MAROL.lat + 0.002, lng: MAROL.lng - 0.003, area_name: "Marol, Andheri East" }, pool_id_hex: randHex(32),
      create_tx_id: addTx(s, "create_pool").id, members: [], invites: [{ merchant_id: RAMESH, suggested_cases: 5, reason: { event: "New Year week", uplift: 2.1, stock_units: 24, need_cases: 5 } }],
      reason: { event: "New Year week", uplift: 2.1, stock_units: 24, need_cases: 5 },
    };
    const price = Math.round(sku.base_case_price_paise * (1 - 800 / 10000));
    [4, 3, 5, 3, 4, 3].forEach((c, i) => rec.members.push({ merchant_id: s.merchants[20 + i].id, cases: c, amount_paise: c * price, loan_id: null, delivery: "pending", commit_tx_id: addTx(s, "commit").id, at: now }));
    s.pools.push(rec);
    addNudge(s, "pool_invite", "नया pool: Mineral Water 1L — 60 case पे 8% scheme। आपके लिए 5 case सही रहेंगे।", "New pool: Mineral Water 1L — 8% scheme at 60 cases. 5 cases would suit you.", rec.id);
    return { created: [poolView(s, rec, me)] };
  }
  if ((a = M("POST", "/demo/pools/:id/simulate-joins"))) {
    requireRole(me, "ops");
    const p = getPool(s, a.id);
    if (p.status !== "open") throw new MockError(409, p.deadline < now ? "Pool deadline has passed" : `Pool is ${p.status}`);
    const inPool = new Set(p.members.map((m) => m.merchant_id));
    const pool = s.merchants.filter((m) => m.id !== RAMESH && !inPool.has(m.id));
    let scheduled = p.members.reduce((x, m) => x + m.cases, 0);
    const want = body?.fill ? Infinity : Math.max(1, Number(body?.count ?? 1));
    const price = poolPrice(p);
    const pattern = [3, 2, 4, 2, 3, 1, 2];
    let i = 0;
    while (scheduled < p.target_cases && i < want && i < pool.length) {
      const c = Math.min(pattern[i % pattern.length], p.target_cases - scheduled);
      p.members.push({ merchant_id: pool[i].id, cases: c, amount_paise: c * price, loan_id: null, delivery: "pending", commit_tx_id: addTx(s, "commit").id, at: now + 500 + i * 850 });
      scheduled += c;
      i++;
    }
    save(s);
    return { ...poolView(s, p, me), joined: i };
  }
  if ((a = M("POST", "/demo/pools/:id/simulate-delivery"))) {
    requireRole(me, "ops");
    const p = getPool(s, a.id);
    if (p.status !== "funded") throw new MockError(409, `Pool is ${p.status} — it must be funded first`);
    const todo = p.members.filter((m) => m.merchant_id !== RAMESH && m.delivery === "pending" && (!body?.merchant_id || m.merchant_id === body.merchant_id));
    todo.forEach((m) => {
      m.delivery = "delivered";
      addTx(s, "deliver");
    });
    tick(s);
    save(s);
    return { ...poolView(s, p, me), delivered: todo.length };
  }
  if (M("POST", "/demo/reset")) {
    const t0 = Date.now();
    const fresh = seed();
    Object.assign(s, fresh);
    save(s);
    return { ok: true, now: iso(demoNow(s)), pools: s.pools.slice(0, 3).map((p) => p.id), trust: s.trust.score, seconds: (Date.now() - t0) / 1000 };
  }

  throw new MockError(404, `Mock: no route for ${method} ${path}`);
}

const statusRank = (st: PoolStatus) => ({ open: 0, funded: 1, draft: 2, settled: 3, failed: 4 })[st];

function b64(str: string) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function parseQr(payload: string): { p: string; m: string; n: string; e: number } | null {
  try {
    const parts = payload.trim().split(".");
    if (parts[0] !== "MOHALLA1" || parts.length < 2) return null;
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function hexes(s: State): OpsHex[] {
  const out: OpsHex[] = [];
  const R = 0.46; // km, ~H3 res 8 edge
  const kmLat = 110.6;
  const kmLng = 104.9;
  const rr = rng(7);
  const hot = [
    { x: 0, y: 0, w: 1 },
    { x: -2.2, y: 0.9, w: 0.75 },
    { x: 1.6, y: -1.5, w: 0.55 },
  ];
  const N = 4;
  for (let q = -N; q <= N; q++) {
    for (let r = Math.max(-N, -q - N); r <= Math.min(N, -q + N); r++) {
      const x = R * 1.5 * q;
      const y = R * Math.sqrt(3) * (r + q / 2);
      let d = 0;
      hot.forEach((h) => (d += h.w * Math.exp(-((x - h.x) ** 2 + (y - h.y) ** 2) / 2.2)));
      d = Math.min(1, d * 0.85 + rr() * 0.12);
      const lat = MAROL.lat + y / kmLat;
      const lng = MAROL.lng + x / kmLng;
      const boundary: [number, number][] = Array.from({ length: 6 }, (_, k) => {
        const ang = (Math.PI / 3) * k;
        return [lat + (R * Math.sin(ang)) / kmLat, lng + (R * Math.cos(ang)) / kmLng];
      });
      const pools = s.pools.filter((p) => p.status === "open" && Math.abs(p.center.lat - lat) * kmLat < R * 0.9 && Math.abs(p.center.lng - lng) * kmLng < R * 0.9).length;
      out.push({ h3: "8860a2" + hex((q + 8) * 16 + (r + 8), 3) + "bfffff".slice(0, 6), center: { lat, lng }, boundary, demand_index: Math.round(d * 100) / 100, merchants: Math.round(2 + d * 14 + rr() * 3), active_pools: pools });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ voice */

const NUM_WORDS: Record<string, number> = {
  ek: 1, one: 1, "एक": 1, do: 2, two: 2, "दो": 2, teen: 3, three: 3, "तीन": 3, char: 4, chaar: 4, four: 4, "चार": 4,
  paanch: 5, panch: 5, five: 5, "पांच": 5, "पाँच": 5, chhe: 6, che: 6, chhah: 6, six: 6, "छह": 6, "छः": 6, "छे": 6,
  saat: 7, seven: 7, "सात": 7, aath: 8, eight: 8, "आठ": 8, nau: 9, nine: 9, "नौ": 9, das: 10, ten: 10, "दस": 10,
};

function voice(s: State, me: Profile, body: any) {
  requireRole(me, "merchant");
  const lang: Lang = body?.lang === "en" ? "en" : me.lang;
  const text: string = (body?.text ?? "").toString().trim() || "Haan, 6 case daal do, paise baad mein dunga.";
  const lower = text.toLowerCase();
  const open = s.pools.filter((p) => p.status === "open");
  const cola = open.find((p) => s.skus.find((k) => k.id === p.sku_id)?.category === "cold_drinks") ?? open[0];
  let n: number | null = null;
  const digit = lower.match(/(\d+)/);
  if (digit) n = parseInt(digit[1], 10);
  else for (const w of lower.split(/[\s,.।?!]+/)) if (NUM_WORDS[w]) { n = NUM_WORDS[w]; break; }
  const wantsCredit = /(baad|later|udhaar|udhar|credit|बाद|उधार|क्रेडिट)/.test(lower);
  const wantsJoin = /(daal|dal|join|add|book|order|chahiye|डाल|जोड़|चाहिए|ऑर्डर|case|केस)/.test(lower) && n !== null;
  const fmt = (x: number) => "₹" + Math.round(x / 100).toLocaleString("en-IN");
  const base = { reply_audio_url: null, confirm_action_id: null as string | null };
  // "haan" while a confirmation card is open → tell the app which action to confirm (money moves only via /actions/{id}/confirm).
  const openAct = [...s.actions].reverse().find((a) => a.merchant_id === me.merchant_id && a.status === "open" && Date.parse(a.expires_at) > demoNow(s));
  if (openAct && n === null && /^(haan|haa|han|ha|yes|ok|okay|confirm|theek|thik|हाँ|हां|हा|ठीक|पक्का)/i.test(lower)) {
    return {
      ...base, transcript: text, reply_lang: lang, pending_actions: [], confirm_action_id: openAct.id,
      reply_text: lang === "hi" ? "ठीक है, पक्का कर रहा हूँ।" : "Okay, confirming it now.",
      suggestions: lang === "hi" ? ["Kitna bachega?", "Mera trust score kya hai?"] : ["How much will I save?", "What's my trust score?"],
    };
  }
  const sugg = lang === "hi"
    ? ["6 case daal do, paise baad mein", "Kitna bachega?", "Mera trust score kya hai?", "Kaunse pool khule hain?"]
    : ["Add 6 cases, pay later", "How much will I save?", "What's my trust score?", "Which pools are open?"];

  if (wantsJoin && cola) {
    const committed = visible(s, cola).reduce((x, m) => x + m.cases, 0);
    const cases = Math.max(1, Math.min(n!, cola.target_cases - committed, 18));
    const res = routeCommit(s, me, cola, cases, wantsCredit);
    return {
      transcript: text,
      reply_text: lang === "hi"
        ? `ठीक है रमेश जी। ${cases} case, ${fmt(res.payload.amount_paise)}${wantsCredit ? `, Pool Credit से — ${(res.payload.credit!.rate_bps / 100).toFixed(1)}% पर 30 दिन, रोज़ की कमाई से कटेगा` : ""}। आपकी बचत ${fmt(res.payload.savings_paise)}। Confirm करें?`
        : `Sure, Ramesh ji. ${cases} cases for ${fmt(res.payload.amount_paise)}${wantsCredit ? `, on Pool Credit at ${(res.payload.credit!.rate_bps / 100).toFixed(1)}% for 30 days, repaid from daily settlements` : ""}. You save ${fmt(res.payload.savings_paise)}. Shall I confirm?`,
      reply_lang: lang, reply_audio_url: null, confirm_action_id: null, pending_actions: [res], suggestions: lang === "hi" ? ["Haan, confirm karo", "Kitna bachega?"] : ["Yes, confirm", "How much will I save?"],
    };
  }
  if (/(bach|save|saving|बच)/.test(lower)) {
    const p = cola;
    const per = p ? p.base_price - poolPrice(p) : 0;
    return {
      transcript: text,
      reply_text: lang === "hi" ? `6 case पर आप ${fmt(per * 6)} बचाएँगे — हर case पर ${fmt(per)}। अब तक Mohalla से आपने ${fmt(90000)} बचाए हैं।` : `On 6 cases you save ${fmt(per * 6)} — ${fmt(per)} per case. So far Mohalla has saved you ${fmt(90000)}.`,
      reply_lang: lang, reply_audio_url: null, confirm_action_id: null, pending_actions: [], suggestions: sugg,
    };
  }
  if (/(trust|score|भरोसा|स्कोर)/.test(lower)) {
    return {
      transcript: text,
      reply_text: lang === "hi" ? `आपका Trust Score ${s.trust.score} है — "${band(s.trust.score)}"। हर delivery समय पर confirm करने से यह बढ़ता है।` : `Your Trust Score is ${s.trust.score} — "${band(s.trust.score)}". It grows every time you confirm a delivery on time.`,
      reply_lang: lang, reply_audio_url: null, confirm_action_id: null, pending_actions: [], suggestions: sugg,
    };
  }
  const names = open.map((p) => s.skus.find((k) => k.id === p.sku_id)!.name).join(", ");
  return {
    transcript: text,
    reply_text: lang === "hi" ? `अभी ${open.length} pool खुले हैं: ${names}। Cola 2L वाला pool 40 case पे 6% scheme दे रहा है — आपके लिए 6 case सही रहेंगे।` : `${open.length} pools are open: ${names}. The Cola 2L pool unlocks a 6% scheme at 40 cases — 6 cases would suit you.`,
    reply_lang: lang, reply_audio_url: null, confirm_action_id: null, pending_actions: [], suggestions: sugg,
  };
}

function routeCommit(s: State, me: Profile, p: PoolRec, cases: number, useCredit: boolean): PendingAction {
  const amount = cases * poolPrice(p);
  const credit = useCredit ? creditOffer(s, amount) : null;
  const sku = s.skus.find((k) => k.id === p.sku_id)!;
  const savings = cases * (p.base_price - poolPrice(p));
  const fmt = (x: number) => "₹" + Math.round(x / 100).toLocaleString("en-IN");
  const action = {
    id: newId(), kind: "commit" as const, merchant_id: me.merchant_id!, status: "open" as const,
    summary_hi: `${sku.name} के ${cases} case, ${fmt(amount)}${useCredit ? " — Pool Credit से" : ""}। बचत ${fmt(savings)}।`,
    summary_en: `${cases} cases of ${sku.name}, ${fmt(amount)}${useCredit ? " — on Pool Credit" : ""}. You save ${fmt(savings)}.`,
    payload: { pool_id: p.id, cases, amount_paise: amount, use_credit: useCredit, credit, savings_paise: savings },
    expires_at: iso(demoNow(s) + 5 * 60000),
  };
  s.actions.push(action);
  const { merchant_id: _m, status: _s, ...pub } = action;
  return pub;
}
