"""Festival windows built at runtime from the `holidays` package (MIT): India, public + optional holidays.

No CSV: dates come from `holidays`, windows (days before/after) are defined here, and New Year week
(26 Dec - 1 Jan) is added in code. Per-category multipliers live in ml/festivals.py.

    python -m ml.sources.festivals          # print the windows for review
"""

from __future__ import annotations

from datetime import date, timedelta

YEARS = list(range(2023, 2030))

# key, name in `holidays`, name_en, name_hi, days before, days after
RULES = [
    ("sankranti", "Makar Sankranti", "Makar Sankranti", "मकर संक्रांति", 3, 0),
    ("holi", "Holi", "Holi", "होली", 3, 0),
    ("raksha_bandhan", "Raksha Bandhan", "Raksha Bandhan", "रक्षा बंधन", 3, 0),
    ("ganesh", "Ganesh Chaturthi", "Ganesh Chaturthi", "गणेश चतुर्थी", 2, 9),
    ("dussehra", "Dussehra", "Dussehra", "दशहरा", 3, 0),
    ("diwali", "Diwali", "Diwali", "दिवाली", 7, 1),
    ("christmas", "Christmas", "Christmas", "क्रिसमस", 3, 0),
]


def _matches(holiday_name: str, match: str) -> bool:
    for part in holiday_name.split(";"):
        p = part.strip()
        # "Diwali (Deepavali)", "Ganesh Chaturthi / Vinayak Chaturthi" match; "Christmas Eve" does not
        if p == match or p.startswith(match + " (") or p.startswith(match + " /"):
            return True
    return False


def build(years=YEARS) -> list[dict]:
    import holidays

    h = holidays.India(years=years, categories=("public", "optional"))
    rows = []
    for key, match, name_en, name_hi, before, after in RULES:
        for y in years:
            days = sorted(d for d, n in h.items() if d.year == y and _matches(n, match))
            if not days:
                continue
            exact = [d for d, n in h.items() if d.year == y and any(p.strip() == match for p in n.split(";"))]
            peak = min(exact) if exact else days[0]  # e.g. Dussehra itself, not Saptami
            rows.append({"key": key, "name_en": name_en, "name_hi": name_hi, "year": y, "peak_date": peak,
                         "start_date": peak - timedelta(days=before), "end_date": peak + timedelta(days=after)})
    for y in years:  # New Year week: 26 Dec (after Christmas) .. New Year's Day
        rows.append({"key": "new_year", "name_en": "New Year week", "name_hi": "न्यू ईयर वीक", "year": y,
                     "peak_date": date(y + 1, 1, 1), "start_date": date(y, 12, 26), "end_date": date(y + 1, 1, 1)})
    rows.sort(key=lambda r: r["start_date"])
    return rows


if __name__ == "__main__":
    for r in build():
        print(f"{r['key']:15} {r['year']}  peak {r['peak_date']}  window {r['start_date']} .. {r['end_date']}")
