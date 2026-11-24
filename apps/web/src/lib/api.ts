"use client";

import { API_URL, mocksEnabled } from "./config";
import { getToken } from "./auth";
import type {
  Attribution,
  ConfirmResponse,
  DemoClockResponse,
  DemoResetResponse,
  CreditOffer,
  DeliveryConfirmResponse,
  DeliveryQr,
  DemoAccount,
  DemoState,
  DistributorOrder,
  DistributorSummary,
  ForecastDetail,
  Health,
  HomeResponse,
  Lang,
  MeResponse,
  Merchant,
  MerchantDelivery,
  OpsHex,
  OpsKpis,
  PendingAction,
  Pool,
  Role,
  TrustResponse,
  TxRef,
  VoiceTurnResponse,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

type Body = Record<string, unknown> | FormData | undefined;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const token = await getToken();

  if (mocksEnabled()) {
    const { mockRequest, MockError } = await import("./mock/server");
    let plain: unknown = body;
    if (body instanceof FormData) {
      const o: Record<string, unknown> = {};
      body.forEach((v, k) => (o[k] = typeof v === "string" ? v : "[audio]"));
      plain = o;
    }
    try {
      return (await mockRequest(method, path, plain, token)) as T;
    } catch (e) {
      if (e instanceof MockError) throw new ApiError(e.status, e.detail);
      throw e;
    }
  }

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: payload, cache: "no-store" });
  } catch {
    throw new ApiError(0, "Can't reach the Mohalla server. Check your connection.");
  }
  if (!res.ok) {
    let detail = res.statusText || "Something went wrong";
    try {
      const j = await res.json();
      if (typeof j?.detail === "string") detail = j.detail;
      else if (Array.isArray(j?.detail)) detail = j.detail.map((d: { msg?: string }) => d.msg).join(", ");
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const get = <T>(p: string) => request<T>("GET", p);
const post = <T>(p: string, b?: Body) => request<T>("POST", p, b ?? {});
const patch = <T>(p: string, b?: Body) => request<T>("PATCH", p, b ?? {});
const enc = encodeURIComponent;

export const api = {
  // public
  health: () => get<Health>("/health"),
  demoAccounts: () => get<DemoAccount[]>("/demo/accounts"),
  demoState: () => get<DemoState>("/demo/state"),
  attributions: () => get<Attribution[]>("/meta/attributions"),

  // profile
  me: () => get<MeResponse>("/me"),
  patchMe: (lang: Lang) => patch<MeResponse>("/me", { lang }),
  onboarding: (role: Role, merchant_id?: string) =>
    post<MeResponse>("/onboarding", merchant_id ? { role, merchant_id } : { role }),
  onboardingShops: () => get<Merchant[]>("/onboarding/shops"),

  // merchant
  home: () => get<HomeResponse>("/m/home"),
  nudgeHeard: (id: string) => post<{ ok: true }>(`/m/nudges/${enc(id)}/heard`),
  forecast: (category: string) => get<ForecastDetail>(`/forecasts/${enc(category)}`),
  pools: (scope: "near" | "mine" | "all" = "near") => get<Pool[]>(`/pools?scope=${scope}`),
  pool: (id: string) => get<Pool>(`/pools/${enc(id)}`),
  commit: (id: string, cases: number, use_credit: boolean) =>
    post<PendingAction>(`/pools/${enc(id)}/commit`, { cases, use_credit }),
  creditOffer: (amount_paise: number) => get<CreditOffer>(`/credit/offer?amount_paise=${Math.round(amount_paise)}`),
  confirmAction: (id: string) => post<ConfirmResponse>(`/actions/${enc(id)}/confirm`),
  cancelAction: (id: string) => post<{ ok: true }>(`/actions/${enc(id)}/cancel`),
  voiceTurn: (input: { audio?: Blob; text?: string; lang?: Lang }) => {
    const fd = new FormData();
    if (input.audio) fd.append("audio", input.audio, "turn.webm");
    if (input.text) fd.append("text", input.text);
    if (input.lang) fd.append("lang", input.lang);
    return request<VoiceTurnResponse>("POST", "/voice/turn", fd);
  },
  mDeliveries: () => get<MerchantDelivery[]>("/m/deliveries"),
  confirmDelivery: (qr_payload: string) => post<DeliveryConfirmResponse>("/m/deliveries/confirm", { qr_payload }),
  trustMe: () => get<TrustResponse>("/trust/me"),
  tx: (id: string) => get<TxRef>(`/txs/${enc(id)}`),

  // distributor
  dOrders: () => get<DistributorOrder[]>("/d/orders"),
  dQr: (poolId: string, merchantId: string) => get<DeliveryQr>(`/d/deliveries/${enc(poolId)}/${enc(merchantId)}/qr`),
  dSummary: () => get<DistributorSummary>("/d/summary"),

  // ops
  opsKpis: () => get<OpsKpis>("/ops/kpis"),
  opsHexes: () => get<OpsHex[]>("/ops/hexes"),
  opsPools: () => get<Pool[]>("/ops/pools"),
  opsTxs: () => get<TxRef[]>("/ops/txs"),

  // demo director
  /** offset_minutes is ABSOLUTE (minutes since demo start); advance_minutes is a relative jump. */
  demoClock: (b: { offset_minutes: number } | { iso: string } | { advance_minutes: number }) => post<DemoClockResponse>("/demo/clock", b),
  runPoolEngine: () => post<{ created: Pool[] }>("/demo/run-pool-engine"),
  simulateJoins: (poolId: string, b: { fill: true } | { count: number } = { fill: true }) =>
    post<Pool & { joined: number }>(`/demo/pools/${enc(poolId)}/simulate-joins`, b),
  simulateDelivery: (poolId: string, merchant_id?: string) =>
    post<Pool & { delivered: number }>(`/demo/pools/${enc(poolId)}/simulate-delivery`, merchant_id ? { merchant_id } : {}),
  demoReset: () => post<DemoResetResponse>("/demo/reset"),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.detail;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
