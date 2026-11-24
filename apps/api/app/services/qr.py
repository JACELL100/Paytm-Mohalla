"""Delivery QR: `MOHALLA1.<base64url(json{p,m,n,e})>.<hmac>` signed with QR_HMAC_SECRET.
The nonce is single-use (rotated when the delivery is confirmed); expiry uses the demo clock."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta

from fastapi import HTTPException

from ..core import clock
from ..core.config import settings

PREFIX = "MOHALLA1"


def _sig(body: str) -> str:
    return hmac.new(settings.qr_hmac_secret.encode(), body.encode(), hashlib.sha256).hexdigest()[:32]


def make(pool_id: str, merchant_id: str, nonce: str) -> tuple[str, datetime]:
    exp = clock.now() + timedelta(minutes=settings.qr_ttl_minutes)
    body = base64.urlsafe_b64encode(json.dumps({"p": pool_id, "m": merchant_id, "n": nonce,
                                                "e": int(exp.timestamp())}, separators=(",", ":")).encode()
                                    ).decode().rstrip("=")
    return f"{PREFIX}.{body}.{_sig(body)}", exp


def verify(payload: str) -> dict:
    try:
        prefix, body, sig = payload.strip().split(".")
    except ValueError as e:
        raise HTTPException(400, "This is not a Mohalla delivery QR") from e
    if prefix != PREFIX or not hmac.compare_digest(sig, _sig(body)):
        raise HTTPException(400, "QR signature is invalid")
    data = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    if clock.now().timestamp() > data["e"]:
        raise HTTPException(410, "QR expired. Ask the distributor to show a fresh one.")
    return data
