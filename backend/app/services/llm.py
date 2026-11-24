"""Groq through its OpenAI-compatible API. Everything here is optional: callers fall back to templates."""

from __future__ import annotations

import json
import logging
import re

from ..core.config import settings

log = logging.getLogger("mohalla.llm")
_client = None


def client():
    global _client
    if not settings.llm_enabled:
        return None
    if _client is None:
        from openai import AsyncOpenAI

        _client = AsyncOpenAI(api_key=settings.groq_api_key, base_url=settings.groq_base_url,
                              timeout=settings.llm_timeout_seconds, max_retries=1)
    return _client


def _extract_json(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except ValueError:
        return None


async def chat_json(system: str, user: str, max_tokens: int = 600) -> dict | None:
    """JSON-only completion. Tries Groq JSON mode, then plain text + extraction."""
    c = client()
    if c is None:
        return None
    msgs = [{"role": "system", "content": system + " Output only the JSON object."}, {"role": "user", "content": user}]
    for kwargs in ({"response_format": {"type": "json_object"}}, {}):
        try:
            r = await c.chat.completions.create(model=settings.groq_model_agent, temperature=0.3,
                                                max_tokens=max_tokens, messages=msgs,
                                                extra_body={"reasoning_effort": "low"}, **kwargs)
            out = _extract_json(r.choices[0].message.content or "")
            if out:
                return out
        except Exception as e:  # noqa: BLE001 - any LLM failure means "use the template"
            log.warning("LLM json call failed: %s", e)
    return None


_SYMBOLS = re.compile("[←-􏿿]")


def clean_speech(text: str) -> str:
    """Drop emojis/symbols that text-to-speech would read out; keep Devanagari, Latin and ₹."""
    return re.sub(r"\s{2,}", " ", _SYMBOLS.sub("", text or "")).strip()


async def transcribe(audio: bytes, filename: str, content_type: str | None, lang: str = "hi") -> str | None:
    c = client()
    if c is None:
        return None
    try:
        r = await c.audio.transcriptions.create(model=settings.groq_model_stt,
                                                file=(filename or "audio.webm", audio, content_type or "audio/webm"),
                                                language=lang if lang in ("hi", "en") else "hi")
        return (r.text or "").strip()
    except Exception as e:  # noqa: BLE001
        log.warning("STT failed: %s", e)
        return None
