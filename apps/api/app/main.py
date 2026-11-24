from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .core.config import ANVIL_MNEMONIC, API_DIR, settings
from .jobs import scheduler
from .routers import demo, distributor, me, merchant, ops, public

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def check_config() -> None:
    if settings.chain_mode not in ("off", "local", "sepolia"):
        raise RuntimeError("CHAIN_MODE must be off, local or sepolia")
    if settings.chain_mode == "sepolia":
        if not settings.merchant_mnemonic or settings.merchant_mnemonic.strip() == ANVIL_MNEMONIC:
            raise RuntimeError("CHAIN_MODE=sepolia needs MERCHANT_MNEMONIC: anvil's public test mnemonic has "
                               "EIP-7702 delegation code on Sepolia, so merchant signatures would be rejected")
        if not settings.operator_private_key:
            raise RuntimeError("CHAIN_MODE=sepolia needs OPERATOR_PRIVATE_KEY")
        if not (settings.rpc_url or settings.sepolia_rpc_url):
            raise RuntimeError("CHAIN_MODE=sepolia needs RPC_URL (or SEPOLIA_RPC_URL)")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    check_config()
    tasks = scheduler.start()
    yield
    await scheduler.stop(tasks)


app = FastAPI(title="Mohalla API", version="1.0.0",
              description="AI buying co-op for Paytm merchants. Contract: docs/API_CONTRACT.md",
              lifespan=lifespan)

origins = {"http://localhost:3000", "http://127.0.0.1:3000"}
if settings.frontend_origin:
    origins |= {o.strip() for o in settings.frontend_origin.split(",") if o.strip()}
app.add_middleware(CORSMiddleware, allow_origins=sorted(origins), allow_credentials=True, allow_methods=["*"],
                   allow_headers=["*"])

static_dir = API_DIR / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

for r in (public.router, me.router, merchant.router, distributor.router, ops.router, demo.router):
    app.include_router(r)
