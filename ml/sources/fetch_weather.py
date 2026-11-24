"""Daily rain + max temperature for Marol from Open-Meteo (CC BY 4.0, no key).
"Weather data by Open-Meteo.com"

Archive (history up to ~5 days ago) + 16-day forecast are cached together in ml/data/weather_mumbai.json.
Days outside both (e.g. late December when run in November) use climatology: the average for the same
calendar week across the history.

    python -m ml.sources.fetch_weather --refresh
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
CACHE = DATA / "weather_mumbai.json"
LAT, LNG = 19.11, 72.88
START = date(2024, 11, 1)
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
FORECAST = "https://api.open-meteo.com/v1/forecast"
DAILY = "precipitation_sum,temperature_2m_max"


def fetch(refresh: bool = False) -> dict:
    if CACHE.exists() and not refresh:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    try:
        import httpx

        end = date.today() - timedelta(days=5)
        common = {"latitude": LAT, "longitude": LNG, "daily": DAILY, "timezone": "Asia/Kolkata"}
        a = httpx.get(ARCHIVE, params={**common, "start_date": START.isoformat(), "end_date": end.isoformat()},
                      timeout=60).json()
        f = httpx.get(FORECAST, params={**common, "forecast_days": 16}, timeout=60).json()
        days: dict[str, dict] = {}
        for src, blob in (("archive", a), ("forecast", f)):
            d = blob["daily"]
            for t, p, tx in zip(d["time"], d["precipitation_sum"], d["temperature_2m_max"]):
                if p is None or tx is None:
                    continue
                if src == "forecast" and t in days:
                    continue  # archive wins where both exist
                days[t] = {"rain_mm": round(float(p), 1), "tmax_c": round(float(tx), 1), "source": src}
        out = {"latitude": LAT, "longitude": LNG, "fetched_on": date.today().isoformat(),
               "attribution": "Weather data by Open-Meteo.com (CC BY 4.0)", "days": dict(sorted(days.items()))}
        DATA.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(out, indent=0), encoding="utf-8")
        return out
    except Exception as e:  # noqa: BLE001
        if CACHE.exists():
            print(f"Weather fetch failed ({e}); using cache", file=sys.stderr)
            return json.loads(CACHE.read_text(encoding="utf-8"))
        raise


@lru_cache(maxsize=1)
def _table() -> tuple[dict, dict]:
    try:
        days = fetch()["days"]
    except Exception:  # noqa: BLE001 - no cache and no network: neutral weather
        days = {}
    obs = {date.fromisoformat(k): (v["rain_mm"], v["tmax_c"], v.get("source", "archive")) for k, v in days.items()}
    clim: dict[int, list] = {}
    for d, (r, t, _src) in obs.items():
        clim.setdefault(min(d.isocalendar()[1], 52), []).append((r, t))
    climatology = {w: (sum(x[0] for x in v) / len(v), sum(x[1] for x in v) / len(v)) for w, v in clim.items()}
    return obs, climatology


@lru_cache(maxsize=8192)
def weather(d: date) -> tuple[float, float, str]:
    """(rain_mm, tmax_c, source) where source is archive | forecast | climatology | default."""
    obs, clim = _table()
    if d in obs:
        return obs[d]
    w = min(d.isocalendar()[1], 52)
    if w in clim:
        return round(clim[w][0], 1), round(clim[w][1], 1), "climatology"
    return 0.0, 32.0, "default"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    out = fetch(a.refresh)
    ks = list(out["days"])
    print(f"{len(ks)} days {ks[0]}..{ks[-1]} (fetched {out['fetched_on']})")
