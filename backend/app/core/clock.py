"""Demo clock: every service asks `clock.now()` instead of datetime.now().

now() = DEMO_NOW + (real seconds since start/reset) x DEMO_CLOCK_RATE + manual offset.
The Demo Director moves it with POST /demo/clock; POST /demo/reset restarts it.
With DEMO_MODE=false it is simply the real time.
"""

from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone

from .config import settings

IST = timezone(timedelta(hours=5, minutes=30))


class DemoClock:
    def __init__(self) -> None:
        self.base = datetime.fromisoformat(settings.demo_now)
        if self.base.tzinfo is None:
            self.base = self.base.replace(tzinfo=IST)
        self.rate = settings.demo_clock_rate
        self.reset()

    def reset(self) -> None:
        self._anchor = time.monotonic()
        self._manual = timedelta(0)

    def now(self) -> datetime:
        if not settings.demo_mode:
            return datetime.now(IST)
        elapsed = (time.monotonic() - self._anchor) * self.rate
        return self.base + timedelta(seconds=elapsed) + self._manual

    def set_offset_minutes(self, minutes: float) -> None:
        """Make now() = DEMO_NOW + minutes (keeps ticking from there)."""
        target = self.base + timedelta(minutes=minutes)
        self._manual += target - self.now()

    def set_iso(self, iso: str) -> None:
        target = datetime.fromisoformat(iso)
        if target.tzinfo is None:
            target = target.replace(tzinfo=IST)
        self._manual += target - self.now()

    def advance(self, minutes: float) -> None:
        self._manual += timedelta(minutes=minutes)

    def offset_minutes(self) -> float:
        return round((self.now() - self.base).total_seconds() / 60, 2)


clock = DemoClock()


def now() -> datetime:
    return clock.now()


def today() -> date:
    return clock.now().astimezone(IST).date()


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST).isoformat()
