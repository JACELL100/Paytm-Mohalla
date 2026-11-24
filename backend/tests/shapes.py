"""Key sets from docs/API_CONTRACT.md."""

MERCHANT = {"id", "name", "owner_name", "category", "lat", "lng", "h3_r8", "lang", "wallet_address"}
DISTRIBUTOR = {"id", "name", "wallet_address"}
TXREF = {"id", "kind", "status", "tx_hash", "explorer_url", "created_at"}
SKU = {"id", "name", "category", "case_size", "emoji", "base_case_price_paise"}
LOAN = {"id", "amount_paise", "rate_bps", "tenure_days", "daily_deduct_bps", "status"}
CREDIT_OFFER = {"amount_paise", "limit_paise", "rate_bps", "tenure_days", "daily_deduct_bps", "reason_en", "reason_hi",
                "eligible"}
POOL_MINE = {"invited", "suggested_cases", "reason", "committed_cases", "amount_paise", "loan", "delivery_status",
             "commit_tx"}
POOL = {"id", "sku", "distributor", "target_cases", "committed_cases", "member_count", "base_case_price_paise",
        "case_price_paise", "disc_bps", "savings_per_case_paise", "slabs", "deadline", "delivery_deadline", "status",
        "center", "mine", "chain", "recent_joins"}
POOL_CHAIN = {"pool_id_hex", "contract_address", "contract_url", "create_tx"}
NUDGE = {"id", "kind", "text_hi", "text_en", "audio_url", "pool_id", "created_at", "heard"}
FORECAST_SUMMARY = {"category", "label_hi", "label_en", "emoji", "uplift", "window_start", "window_end", "event",
                    "p50_daily_paise", "need_cases"}
PENDING_ACTION = {"id", "kind", "summary_hi", "summary_en", "payload", "expires_at"}
PENDING_PAYLOAD = {"pool_id", "cases", "amount_paise", "use_credit", "credit", "savings_paise"}
HOME = {"merchant", "nudges", "forecasts", "invites", "active_pools", "savings", "trust", "wallet"}
ME = {"profile", "merchant", "distributor"}
VOICE = {"transcript", "reply_text", "reply_lang", "reply_audio_url", "pending_actions", "suggestions"}
KPIS = {"pooled_gmv_paise", "merchant_savings_paise", "loans_paise", "fee_revenue_paise", "active_pools",
        "funded_pools", "merchants", "avg_trust", "series"}
HEX = {"h3", "center", "boundary", "demand_index", "merchants", "active_pools"}
TRUST = {"score", "band", "components", "history", "attestations"}


def has(obj: dict, keys: set, where: str = "") -> None:
    missing = keys - set(obj)
    assert not missing, f"{where} missing keys {missing}"


def check_pool(p: dict, merchant_view: bool) -> None:
    has(p, POOL, "Pool")
    has(p["sku"], SKU, "Pool.sku")
    has(p["chain"], POOL_CHAIN, "Pool.chain")
    has(p["center"], {"lat", "lng", "area_name"}, "Pool.center")
    assert p["chain"]["pool_id_hex"].startswith("0x") and len(p["chain"]["pool_id_hex"]) == 66
    if p["chain"]["create_tx"]:
        has(p["chain"]["create_tx"], TXREF, "create_tx")
    for j in p["recent_joins"]:
        assert set(j) == {"at", "cases"}, "recent_joins must be anonymised"
    if merchant_view:
        assert p["mine"] is not None
        has(p["mine"], POOL_MINE, "Pool.mine")
    else:
        assert p["mine"] is None
