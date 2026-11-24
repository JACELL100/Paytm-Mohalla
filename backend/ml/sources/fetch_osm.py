"""Real shop locations around Marol from OpenStreetMap (Overpass API).

© OpenStreetMap contributors, ODbL 1.0. We use only coordinates + shop type tags.
Business names are never used: made-up sales figures must not be attached to real, identifiable shops.

    python -m ml.sources.fetch_osm --refresh      # re-fetch into ml/data/osm_marol.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
CACHE = DATA / "osm_marol.json"
URL = "https://overpass-api.de/api/interpreter"
CENTER = (19.110, 72.880)
RADIUS_M = 3000
QUERY = (f'[out:json][timeout:60];('
         f'node["shop"](around:{RADIUS_M},{CENTER[0]},{CENTER[1]});'
         f'way["shop"](around:{RADIUS_M},{CENTER[0]},{CENTER[1]});'
         f'node["amenity"~"pharmacy|cafe|fast_food"](around:{RADIUS_M},{CENTER[0]},{CENTER[1]});'
         f');out center tags;')
USER_AGENT = "mohalla-hackathon/0.1"

SHOP_MAP = {
    "convenience": "kirana", "supermarket": "kirana", "general": "kirana", "grocery": "kirana",
    "greengrocer": "kirana", "variety_store": "kirana", "kiosk": "kirana",
    "chemist": "pharmacy", "pharmacy": "pharmacy", "medical_supply": "pharmacy",
    "bakery": "bakery", "confectionery": "sweets", "sweets": "sweets", "pastry": "bakery",
    "dairy": "dairy", "tea": "chai", "beverages": "chai",
}
AMENITY_MAP = {"pharmacy": "pharmacy", "cafe": "chai", "fast_food": "chai"}


def fetch(refresh: bool = False) -> dict:
    """Raw Overpass response (cached). Falls back to the cache if the network fails."""
    if CACHE.exists() and not refresh:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    try:
        import httpx

        r = httpx.post(URL, data={"data": QUERY}, headers={"User-Agent": USER_AGENT}, timeout=90)
        r.raise_for_status()
        raw = json.loads(r.content.decode("utf-8"))
        DATA.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
        return raw
    except Exception as e:  # noqa: BLE001
        if CACHE.exists():
            print(f"OSM fetch failed ({e}); using cache", file=sys.stderr)
            return json.loads(CACHE.read_text(encoding="utf-8"))
        raise


def anchors(raw: dict | None = None) -> list[dict]:
    """[{osm_id, lat, lng, category, osm_tag}] for POIs that map to our shop categories (no names)."""
    raw = raw or fetch()
    out = []
    for el in raw.get("elements", []):
        tags = el.get("tags") or {}
        cat = SHOP_MAP.get(tags.get("shop", "")) or AMENITY_MAP.get(tags.get("amenity", ""))
        if not cat:
            continue
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lng = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lng is None:
            continue
        out.append({"osm_id": f"{el['type']}/{el['id']}", "lat": round(float(lat), 6), "lng": round(float(lng), 6),
                    "category": cat, "osm_tag": tags.get("shop") or tags.get("amenity")})
    out.sort(key=lambda a: a["osm_id"])
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    raw = fetch(a.refresh)
    an = anchors(raw)
    from collections import Counter

    print(f"{len(raw.get('elements', []))} POIs, {len(an)} usable anchors: {dict(Counter(x['category'] for x in an))}")
