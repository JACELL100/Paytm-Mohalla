# Data sources

Mohalla's demo world is **synthetic data grounded in open data**. Everything below is free and key-less.
Raw responses are cached in `ml/data/` so the generator runs offline and deterministically; refresh with
`--refresh` (if a fetch fails, the cache is used).

| What | Source | Licence | How it's used | Code / cache |
|---|---|---|---|---|
| Shop locations and types around Marol (3 km of 19.110 N, 72.880 E) | OpenStreetMap via the Overpass API | ODbL 1.0 | 253 POIs; 133 map to our shop types (convenience/supermarket/grocery -> kirana, chemist/pharmacy -> pharmacy, cafe/fast_food -> chai, bakery, confectionery -> sweets, dairy). Up to the plan's category quota they become **anchor shops at their real coordinates**; the rest of the ~300 shops are placed with small jitter near OSM clusters. The demo shop sits on the real convenience store nearest the centre. | `ml/sources/fetch_osm.py`, `ml/data/osm_marol.json` |
| Daily rain and max temperature (Marol) | Open-Meteo archive + 16-day forecast | CC BY 4.0 | Heavy rain lowers footfall (>30 mm: -20%, >10 mm: -8%) but lifts chai (+25%) and snacks (+15%); heat (>33 C) lifts cold drinks (+7% per degree, max +35%) and dairy (+5%). Days beyond the forecast use climatology (same calendar-week average). Also used as known-future covariates by both forecasters. | `ml/sources/fetch_weather.py`, `ml/data/weather_mumbai.json` |
| Festival dates 2023-2029 | `holidays` Python package (India, public + optional) | MIT | Computed at runtime (no CSV): Diwali (-7..+1 days), Ganesh Chaturthi (-2..+9), Holi, Makar Sankranti, Raksha Bandhan, Dussehra (-3..0), Christmas (-3..0); New Year week (26 Dec - 1 Jan) is added in code. Category multipliers are in `ml/festivals.py`. | `ml/sources/festivals.py`, `ml/festivals.py` |

## What stays synthetic (and why)
- **Sales and transaction amounts, ticket sizes, category mix, stock, wallet balances, pools.** There is no open
  data on Indian merchant payments, so these come from the seeded formula in `ml/generate_synthetic.py`
  (base x weekday x salary week x festival x weather x trend x noise).
- **Shop and owner names.** We never use OSM business names: attaching made-up sales figures to real,
  identifiable businesses would be misleading. Names are generated from generic parts.
- **Product catalogue.** Generic names only ("Cola 2L"), no brands.

## Attribution (show wherever the data is displayed)
- Map data and shop locations: **© OpenStreetMap contributors** (ODbL), https://www.openstreetmap.org/copyright
- **Weather data by Open-Meteo.com** (CC BY 4.0), https://open-meteo.com/
- Holiday dates: `holidays` package (MIT), https://github.com/vacanza/holidays

The API returns the same lines at `GET /meta/attributions`.
