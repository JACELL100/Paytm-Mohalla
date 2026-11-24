"""Bearer-token auth.

dev mode:       tokens `dev-merchant`, `dev-distributor`, `dev-ops` map to seeded profiles.
supabase mode:  GET {SUPABASE_URL}/auth/v1/user with the access token (cached 60 s); auth user id = profiles.id.
                Dev tokens still work while DEMO_MODE is on (one-click demo accounts).
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass

import httpx
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Distributor, Merchant, Profile
from . import clock
from .config import settings
from .db import get_session

_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 60.0


@dataclass
class CurrentUser:
    profile: Profile
    merchant: Merchant | None
    distributor: Distributor | None

    @property
    def role(self) -> str | None:
        return self.profile.role


async def _supabase_user(token: str) -> dict:
    hit = _cache.get(token)
    if hit and time.monotonic() - hit[0] < CACHE_TTL:
        return hit[1]
    apikey = settings.supabase_anon_key or settings.supabase_service_role_key or ""
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                            headers={"Authorization": f"Bearer {token}", "apikey": apikey})
    except httpx.HTTPError as e:
        raise HTTPException(503, f"Auth provider unreachable: {e}") from e
    if r.status_code != 200:
        raise HTTPException(401, "Invalid or expired token")
    user = r.json()
    _cache[token] = (time.monotonic(), user)
    if len(_cache) > 2000:
        _cache.clear()
    return user


async def load_user(session: AsyncSession, profile: Profile) -> CurrentUser:
    m = await session.get(Merchant, profile.merchant_id) if profile.merchant_id else None
    d = await session.get(Distributor, profile.distributor_id) if profile.distributor_id else None
    return CurrentUser(profile, m, d)


async def current_user(authorization: str | None = Header(default=None),
                       session: AsyncSession = Depends(get_session)) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    mode = settings.effective_auth_mode
    if token.startswith("dev-") and (mode == "dev" or settings.demo_mode):
        p = (await session.execute(select(Profile).where(Profile.dev_token == token))).scalar_one_or_none()
        if not p:
            raise HTTPException(401, "Unknown dev token. Use one from GET /demo/accounts")
        return await load_user(session, p)
    if mode != "supabase":
        raise HTTPException(401, "Invalid token (auth_mode=dev: use a token from GET /demo/accounts)")
    user = await _supabase_user(token)
    uid = uuid.UUID(user["id"])
    p = await session.get(Profile, uid)
    if not p:
        meta = user.get("user_metadata") or {}
        p = Profile(id=uid, role=None, email=user.get("email"),
                    display_name=meta.get("full_name") or meta.get("name") or (user.get("email") or "").split("@")[0],
                    lang="hi", created_at=clock.now())
        session.add(p)
        await session.commit()
    return await load_user(session, p)


def require_role(*roles: str):
    async def dep(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(403, f"This needs role {' or '.join(roles)} (you are {user.role or 'not onboarded'})")
        if user.role == "merchant" and not user.merchant:
            raise HTTPException(403, "No shop linked to this account yet. POST /onboarding first")
        return user

    return dep


merchant_user = require_role("merchant")
ops_user = require_role("ops")
distributor_or_ops = require_role("distributor", "ops")
