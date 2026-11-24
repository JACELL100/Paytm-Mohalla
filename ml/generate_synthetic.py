"""Deterministic synthetic Paytm-style data for ~300 shops around Marol, Andheri East,
grounded in open data (see ml/DATA_SOURCES.md):

- shop locations + types: real OpenStreetMap POIs (anchors, names never used), topped up to ~300
  with synthetic shops placed near the OSM clusters
- weather: real daily rain / max temperature from Open-Meteo (climatology beyond the forecast)
- festivals: dates from the `holidays` package

    sales = base(category, lognormal) x weekday x salary_week
            x sum_c share_c x festival_c(day) x weather_c(day) x footfall(rain) x trend x noise

Sales amounts stay synthetic: there is no open data on Indian merchant payments.

Usage:
    python ml/generate_synthetic.py --out ml/data/generated     # write CSVs (optional)
The API seed (`python -m app.scripts.seed`) imports `generate()` directly.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import math
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ml import catalog  # noqa: E402
from ml.festivals import CATEGORIES, category_multiplier, footfall, weather_multiplier  # noqa: E402
from ml.sources import fetch_osm  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
HISTORY_START = date(2024, 11, 1)
HISTORY_END = date(2026, 12, 25)  # the day before the demo clock starts (26 Dec 2026)
CAT_KEYS = list(CATEGORIES.keys())


@dataclass
class World:
    shops: list[dict]
    days: list[date]
    sales: np.ndarray  # (n_shops, n_days) paise; 0 before the shop joined Paytm
    txns: np.ndarray  # (n_shops, n_days) counts
    payers: np.ndarray
    transactions: list[dict]  # demo shop, last 30 days
    skus: list[dict]
    distributors: list[dict]
    schemes: list[dict]
    inventory: list[dict]
    category_mix: list[dict] = field(default_factory=list)


def _h3(lat: float, lng: float):
    import h3

    c8 = h3.latlng_to_cell(lat, lng, 8)
    return c8, h3.cell_to_parent(c8, 7)


def haversine_km(a_lat, a_lng, b_lat, b_lng) -> float:
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def nearest_locality(lat: float, lng: float) -> str:
    return min(catalog.LOCALITIES, key=lambda l: haversine_km(lat, lng, l[1], l[2]))[0]


def _place(rng: np.random.Generator) -> tuple[float, float]:
    clat, clng = catalog.CENTER
    km_lat, km_lng = 1 / 110.574, 1 / (111.320 * math.cos(math.radians(clat)))
    while True:
        _, llat, llng = catalog.LOCALITIES[rng.integers(len(catalog.LOCALITIES))]
        lat = llat + rng.normal(0, 0.55) * km_lat
        lng = llng + rng.normal(0, 0.55) * km_lng
        if haversine_km(clat, clng, lat, lng) <= 3.0:
            return round(lat, 6), round(lng, 6)


def _shop_name(rng, cat: str, used: set[str]) -> tuple[str, str]:
    for _ in range(50):
        first = catalog.FIRST_NAMES[rng.integers(len(catalog.FIRST_NAMES))]
        surname = catalog.SURNAMES[rng.integers(len(catalog.SURNAMES))]
        deity = catalog.DEITIES[rng.integers(len(catalog.DEITIES))]
        loc = catalog.LOCALITIES[rng.integers(len(catalog.LOCALITIES))][0].split(",")[0]
        tpl = catalog.NAME_TEMPLATES[cat][rng.integers(len(catalog.NAME_TEMPLATES[cat]))]
        name = tpl.format(first=first, surname=surname, deity=deity, loc=loc)
        if name not in used and name != catalog.DEMO_SHOP["name"]:
            used.add(name)
            return name, f"{first} {surname}"
    raise RuntimeError("could not make a unique shop name")


def _mix(rng, base: dict[str, float]) -> dict[str, float]:
    keys = list(base)
    alpha = np.array([base[k] for k in keys]) * 60
    v = rng.dirichlet(alpha)
    return {k: round(float(x), 4) for k, x in zip(keys, v) if x >= 0.005}


def generate(seed: int = 42, n_shops: int = 300, start: date = HISTORY_START, end: date = HISTORY_END) -> World:
    rng = np.random.default_rng(seed)
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    n_days = len(days)

    # ---------------------------------------------------------------- shops (OSM anchors + top-up)
    types = list(catalog.SHOP_TYPES)
    probs = np.array([catalog.SHOP_TYPES[t]["share"] for t in types])
    counts = np.floor(probs / probs.sum() * (n_shops - 1)).astype(int)
    counts[0] += (n_shops - 1) - counts.sum()  # remainder to kirana
    target = dict(zip(types, counts.tolist()))
    anchors = fetch_osm.anchors()
    clat, clng = catalog.CENTER
    kiranas = [a for a in anchors if a["category"] == "kirana"]
    demo_anchor = min(kiranas, key=lambda a: haversine_km(clat, clng, a["lat"], a["lng"])) if kiranas else None
    placed: list[tuple[str, float, float, str]] = []  # (category, lat, lng, source)
    for cat in types:
        pool = [a for a in anchors if a["category"] == cat and a is not demo_anchor]
        pick = [pool[i] for i in rng.permutation(len(pool))[: target[cat]]]
        placed += [(cat, a["lat"], a["lng"], "osm") for a in pick]
        km_lat, km_lng = 1 / 110.574, 1 / (111.320 * math.cos(math.radians(clat)))
        for _ in range(target[cat] - len(pick)):  # top up near real shop clusters
            while True:
                if anchors:
                    a = anchors[rng.integers(len(anchors))]
                    lat = a["lat"] + rng.normal(0, 0.12) * km_lat
                    lng = a["lng"] + rng.normal(0, 0.12) * km_lng
                else:
                    lat, lng = _place(rng)
                if haversine_km(clat, clng, lat, lng) <= 3.0:
                    break
            placed.append((cat, round(lat, 6), round(lng, 6), "synthetic"))
    order = rng.permutation(len(placed))
    placed = [placed[i] for i in order]
    cats = ["kirana"] + [p[0] for p in placed]

    used: set[str] = set()
    shops: list[dict] = []
    for i, cat in enumerate(cats):
        no = i + 1
        st = catalog.SHOP_TYPES[cat]
        if no == 1:
            d = catalog.DEMO_SHOP
            name, owner = d["name"], d["owner_name"]
            lat, lng = (demo_anchor["lat"], demo_anchor["lng"]) if demo_anchor else (d["lat"], d["lng"])
            loc_source = "osm" if demo_anchor else "synthetic"
            mix = dict(d["mix"])
            base = float(d["median"])
            onboarded = date(2025, 9, 1)
        else:
            name, owner = _shop_name(rng, cat, used)
            _, lat, lng, loc_source = placed[i - 1]
            mix = _mix(rng, st["mix"])
            base = float(st["median"] * rng.lognormal(0, 0.45))
            onboarded = date(2023, 1, 1) + timedelta(days=int(rng.integers(0, 1250)))
        tot = sum(mix.values())
        mix = {k: v / tot for k, v in mix.items()}
        c8, c7 = _h3(lat, lng)
        shops.append({
            "shop_no": no, "name": name, "owner_name": owner, "category": cat, "lat": lat, "lng": lng,
            "h3_r8": c8, "h3_r7": c7, "area_name": nearest_locality(lat, lng),
            "lang": "hi" if (no == 1 or rng.random() < 0.8) else "en",
            "wallet_index": 100 + no, "mix": mix, "base_daily_paise": int(base * 100),
            "onboarded_on": onboarded, "is_demo": no == 1,
            "seed_balance_paise": 300_000 if no == 1 else int(rng.integers(8_000, 60_000)) * 100,
            "ticket": st["ticket"], "location_source": loc_source,
        })

    # ---------------------------------------------------------------- daily sales (vectorised)
    cat_mult = np.array([[category_multiplier(c, d) * weather_multiplier(c, d) for c in CAT_KEYS]
                         for d in days])  # (days, cats): festival x weather per product category
    mix_mat = np.array([[s["mix"].get(c, 0.0) for c in CAT_KEYS] for s in shops])  # (shops, cats)
    foot = np.array([footfall(d) for d in days])
    fest = (mix_mat @ cat_mult.T) * foot[None, :]  # (shops, days)

    wd_idx = np.array([d.weekday() for d in days])
    weekday = np.array([catalog.WEEKDAY.get(s["category"], catalog.WEEKDAY["default"]) for s in shops])[:, wd_idx]
    salary = np.where(np.array([d.day for d in days]) <= 7, 1.15, 1.0)
    years = np.array([(d - start).days / 365.0 for d in days])
    growth = rng.normal(0.10, 0.06, size=len(shops))
    growth[0] = 0.12
    trend = 1 + growth[:, None] * years[None, :]
    noise_sd = rng.uniform(0.08, 0.2, size=len(shops))
    noise_sd[0] = 0.10
    noise = rng.lognormal(0, 1, size=(len(shops), n_days)) ** noise_sd[:, None]
    base = np.array([s["base_daily_paise"] for s in shops], dtype=float)[:, None]
    sales = base * weekday * salary[None, :] * fest * trend * noise
    active = np.array([[d >= s["onboarded_on"] for d in days] for s in shops])
    sales = np.where(active, np.round(sales / 100) * 100, 0).astype(np.int64)  # whole rupees
    tickets = np.array([s["ticket"] * 100 for s in shops], dtype=float)[:, None]
    txns = np.where(active, np.maximum(1, np.round(sales / (tickets * rng.uniform(0.85, 1.15, size=sales.shape)))), 0)
    payers = np.where(active, np.maximum(1, np.round(txns * rng.uniform(0.6, 0.8, size=sales.shape))), 0)

    # ---------------------------------------------------------------- demo shop raw transactions (last 30 days)
    transactions: list[dict] = []
    for di in range(n_days - 30, n_days):
        n, total = int(txns[0, di]), int(sales[0, di])
        amts = rng.lognormal(0, 0.8, size=n)
        amts = np.maximum(100, np.round(amts / amts.sum() * total)).astype(int)
        secs = np.sort(rng.integers(7 * 3600, 23 * 3600, size=n))
        for a, s in zip(amts, secs):
            ts = datetime.combine(days[di], datetime.min.time(), IST) + timedelta(seconds=int(s))
            payer = hashlib.sha256(f"payer-{rng.integers(0, 900)}".encode()).hexdigest()[:16]
            transactions.append({"ts": ts, "amount_paise": int(a), "payer_hash": payer})

    # ---------------------------------------------------------------- catalogue, distributors, schemes
    skus = []
    for code, name, name_hi, cat, size, price, emoji, share in catalog.SKUS:
        skus.append({"code": code, "name": name, "name_hi": name_hi, "category": cat, "case_size": size,
                     "case_price_paise": price * 100, "emoji": emoji, "sku_share": share,
                     "unit_retail_paise": int(round(price * 100 / size * catalog.RETAIL_MARKUP))})

    distributors = []
    clat, clng = catalog.CENTER
    for i, d in enumerate(catalog.DISTRIBUTORS):
        cells = sorted({s["h3_r7"] for s in shops if haversine_km(clat, clng, s["lat"], s["lng"]) <= d["radius_km"]})
        distributors.append({"key": d["key"], "name": d["name"], "coverage_h3": cells, "wallet_index": 10_000 + i,
                             "categories": d["categories"]})

    schemes = [{"distributor_key": dk, "sku_code": sc, "slabs": slabs, "valid_from": date.fromisoformat(vf),
                "valid_to": date.fromisoformat(vt)} for dk, sc, slabs, vf, vt in catalog.SCHEMES]

    # ---------------------------------------------------------------- stock + category mix (from synthetic bills)
    sku_by_cat: dict[str, list[dict]] = {}
    for s in skus:
        sku_by_cat.setdefault(s["category"], []).append(s)
    inventory, category_mix = [], []
    for si, s in enumerate(shops):
        recent = float(sales[si, -28:].mean()) if sales[si, -28:].any() else s["base_daily_paise"]
        for cat, share in s["mix"].items():
            category_mix.append({"shop_no": s["shop_no"], "category": cat, "share": round(share, 4)})
            if share < 0.04:
                continue
            for sku in sku_by_cat.get(cat, []):
                daily_units = recent * share * sku["sku_share"] / sku["unit_retail_paise"]
                cover_days = rng.uniform(2, 9)
                qty = int(round(daily_units * cover_days))
                if s["is_demo"] and sku["code"] == "cola_2l":
                    qty = 36  # 4 cases, the number in the demo nudge
                if qty > 0:
                    inventory.append({"shop_no": s["shop_no"], "sku_code": sku["code"], "qty_units": qty})

    return World(shops=shops, days=days, sales=sales, txns=txns.astype(np.int64), payers=payers.astype(np.int64),
                 transactions=transactions, skus=skus, distributors=distributors, schemes=schemes,
                 inventory=inventory, category_mix=category_mix)


def write_csvs(w: World, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)

    def dump(name, rows, cols):
        with open(out / name, "w", newline="", encoding="utf-8") as f:
            wr = csv.writer(f)
            wr.writerow(cols)
            for r in rows:
                wr.writerow([r[c] for c in cols])

    dump("shops.csv", w.shops, ["shop_no", "name", "owner_name", "category", "lat", "lng", "h3_r8", "area_name",
                                "lang", "wallet_index", "base_daily_paise", "onboarded_on", "location_source"])
    with open(out / "daily_sales.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["shop_no", "day", "txn_count", "amount_paise", "unique_payers"])
        for si, s in enumerate(w.shops):
            for di, d in enumerate(w.days):
                if w.sales[si, di] > 0:
                    wr.writerow([s["shop_no"], d.isoformat(), int(w.txns[si, di]), int(w.sales[si, di]),
                                 int(w.payers[si, di])])
    dump("transactions_demo_shop.csv", w.transactions, ["ts", "amount_paise", "payer_hash"])
    dump("skus.csv", w.skus, ["code", "name", "name_hi", "category", "case_size", "case_price_paise", "emoji"])
    dump("category_mix.csv", w.category_mix, ["shop_no", "category", "share"])
    dump("inventory.csv", w.inventory, ["shop_no", "sku_code", "qty_units"])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--shops", type=int, default=300)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "data" / "generated"))
    a = ap.parse_args()
    world = generate(a.seed, a.shops)
    write_csvs(world, Path(a.out))
    print(f"{len(world.shops)} shops, {int((world.sales > 0).sum())} daily rows, "
          f"{len(world.transactions)} demo-shop txns -> {a.out}")
