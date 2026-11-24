from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]  # backend/
REPO_ROOT = API_DIR.parent

ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ANVIL_MNEMONIC = "test test test test test test test test test test test junk"


class Settings(BaseSettings):
    # only backend/.env is read (real environment variables win). The repo-root .env is deliberately NOT
    # loaded: it holds Supabase settings that would silently switch the zero-config dev mode to Postgres.
    model_config = SettingsConfigDict(env_file=str(API_DIR / ".env"), env_file_encoding="utf-8", extra="ignore",
                                      populate_by_name=True)

    # database
    database_url: str = "sqlite+aiosqlite:///./mohalla.db"
    db_echo: bool = False
    pg_driver: str = "auto"  # auto | psycopg | asyncpg (auto = psycopg when installed: 1 round trip/statement)

    # auth
    supabase_url: str | None = None
    supabase_anon_key: str | None = Field(default=None, validation_alias=AliasChoices(
        "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "supabase_anon_key"))
    supabase_service_role_key: str | None = Field(default=None, validation_alias=AliasChoices(
        "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "supabase_service_role_key"))
    auth_mode: str | None = None  # dev | supabase (default: supabase if SUPABASE_URL is set)

    # demo
    demo_mode: bool = True
    demo_now: str = "2026-12-26T09:00:00+05:30"
    demo_clock_rate: float = 1.0  # demo seconds per real second (0 freezes the clock)
    demo_pool_deadline_minutes: float = 3.0
    engine_pool_deadline_minutes: float = 120.0
    background_jobs: bool = True
    job_interval_seconds: float = 10.0
    relayer_interval_seconds: float = 0.5

    # ai
    groq_api_key: str | None = None
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model_agent: str = "openai/gpt-oss-120b"
    groq_model_stt: str = "whisper-large-v3"
    groq_model_vision: str = "qwen/qwen3.8-27b"
    llm_timeout_seconds: float = 8.0  # per Groq call (one retry)
    voice_llm_budget_seconds: float = 12.0  # whole voice turn; past this the rule-based parser answers

    # chain
    chain_mode: str = "off"  # off | local | sepolia
    rpc_url: str | None = None
    sepolia_rpc_url: str | None = None
    operator_private_key: str | None = None
    merchant_mnemonic: str | None = None
    tinr_address: str | None = None
    pools_address: str | None = None
    treasury_address: str | None = None
    eas_address: str = "0xC2679fBD37d54388Ce493F1DB75320D236e1815e"
    eas_schema_delivery_uid: str | None = None
    eas_schema_commitment_uid: str | None = None
    fee_bps: int = 100
    sim_tx_delay_seconds: float = 1.5
    gas_limit_multiplier: float = 1.0  # scale every relayer gas limit if a network reprices gas again

    # misc
    qr_hmac_secret: str = "mohalla-dev-qr-secret"
    qr_ttl_minutes: int = 10
    frontend_origin: str | None = None
    frontend_origin_regex: str | None = None  # e.g. https://paytm-mohalla.*\.vercel\.app
    public_api_url: str = "http://localhost:8000"

    @property
    def effective_auth_mode(self) -> str:
        if self.auth_mode in ("dev", "supabase"):
            return self.auth_mode
        return "supabase" if self.supabase_url else "dev"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def llm_enabled(self) -> bool:
        return bool(self.groq_api_key)

    @property
    def effective_rpc_url(self) -> str:
        if self.chain_mode == "sepolia":
            return self.rpc_url or self.sepolia_rpc_url or ""
        return self.rpc_url or "http://127.0.0.1:8545"

    @property
    def effective_operator_key(self) -> str:
        return self.operator_private_key or (ANVIL_KEY if self.chain_mode == "local" else "")

    @property
    def effective_mnemonic(self) -> str:
        return self.merchant_mnemonic or ANVIL_MNEMONIC


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
