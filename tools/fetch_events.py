"""Fetch reliable South West events for the app. Runs in GitHub Actions every 6 hours.

Sources (official, no scraping):
  - Ticketmaster Discovery API: concerts, sport, theatre, with venue coordinates.
    Needs a free key in the TICKETMASTER_API_KEY secret. Without it, this source is skipped.
  - GOV.UK bank holidays (England and Wales): public JSON, no key.

Writes app/data/events.json. The app assigns each event to the nearest town and estimates
when the crowd leaves (Ticketmaster gives start times, not finish times), and says so on screen.

  - Open-Meteo weather forecast (rain and temperature, next 36 hours) for every South West town.
    Public, no key. Fetched here, on GitHub's servers, so drivers' phones never contact it.

Usage: python tools/fetch_events.py app/data/events.json
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

TM_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
BANK_URL = "https://www.gov.uk/bank-holidays.json"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
WEATHER_HOURS = 36
FLOOD_URL = "https://environment.data.gov.uk/flood-monitoring/id/floods"  # Environment Agency, Open Government Licence
SW_COUNTIES = ("Cornwall", "Isles of Scilly", "Devon", "Plymouth", "Torbay", "Somerset", "North Somerset",
               "Bath and North East Somerset", "Bristol", "South Gloucestershire", "Gloucestershire",
               "Wiltshire", "Swindon", "Dorset", "Bournemouth", "Christchurch and Poole", "Poole")
TOWNS_JS = os.path.join(os.path.dirname(__file__), "..", "app", "js", "southwest.js")
DAYS_AHEAD = 30
UA = {"User-Agent": "FairFare-events/1.0"}

# Search circles that cover the South West (lat, lon, radius in miles)
CENTRES = [
    (51.45, -2.59, 30),   # Bristol, Bath, Weston
    (51.86, -2.16, 25),   # Gloucester, Cheltenham, Stroud
    (51.40, -1.85, 25),   # Swindon, Chippenham, Devizes
    (51.07, -1.80, 20),   # Salisbury
    (51.10, -2.90, 30),   # Taunton, Bridgwater, Yeovil, Glastonbury
    (50.72, -1.95, 25),   # Bournemouth, Poole, Dorchester, Weymouth
    (50.72, -3.53, 25),   # Exeter, Exmouth, Torbay
    (51.05, -4.10, 25),   # North Devon
    (50.40, -4.10, 25),   # Plymouth, Tavistock, Saltash
    (50.35, -4.90, 25),   # Mid Cornwall
    (50.15, -5.40, 25),   # West Cornwall
]
# Rough South West box: anything outside is dropped (the circles overlap neighbours)
BOX = (49.8, 52.15, -6.5, -1.5)

# Minutes from start until the crowd leaves, by Ticketmaster segment
DURATION = {"Sports": 135, "Music": 180, "Arts & Theatre": 165, "Film": 150}
BIG_VENUE_WORDS = ("stadium", "ashton gate", "home park", "sandy park", "kingsholm", "racecourse", "showground",
                   "worthy farm", "eden project", "county ground", "the rec", "bristol beacon", "international centre",
                   "plainmoor", "huish park", "st james park", "arena")


def get_json(url: str, params: dict | None = None, tries: int = 3) -> dict:
    if params:
        url += "?" + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                time.sleep(2 * (i + 1))
                continue
            raise
        except urllib.error.URLError:
            if i < tries - 1:
                time.sleep(2 * (i + 1))
                continue
            raise
    return {}


def in_box(lat: float, lon: float) -> bool:
    return BOX[0] <= lat <= BOX[1] and BOX[2] <= lon <= BOX[3]


def size_for(venue: str, segment: str) -> str:
    v = venue.lower()
    if any(w in v for w in BIG_VENUE_WORDS):
        return "big"
    return "medium" if segment in ("Sports", "Music") else "small"


def transform_tm(raw_events: list[dict]) -> list[dict]:
    """Turn Ticketmaster events into the app's shape. Pure function, tested without the network."""
    out, seen = [], set()
    for e in raw_events:
        if e.get("id") in seen:
            continue
        status = (((e.get("dates") or {}).get("status") or {}).get("code") or "").lower()
        if status in ("cancelled", "canceled", "postponed"):
            continue
        start = (e.get("dates") or {}).get("start") or {}
        date, tm = start.get("localDate"), start.get("localTime")
        venues = ((e.get("_embedded") or {}).get("venues")) or []
        if not date or not tm or not venues:
            continue  # no time or place, nothing a driver can use
        v = venues[0]
        loc = v.get("location") or {}
        try:
            lat, lon = float(loc["latitude"]), float(loc["longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        if not in_box(lat, lon):
            continue
        cls = (e.get("classifications") or [{}])[0]
        segment = ((cls.get("segment") or {}).get("name")) or "Other"
        begin = datetime.strptime(f"{date} {tm[:5]}", "%Y-%m-%d %H:%M")
        end = begin + timedelta(minutes=DURATION.get(segment, 180))
        venue_name = v.get("name") or ""
        seen.add(e.get("id"))
        out.append({
            "id": "tm-" + str(e.get("id")),
            "name": e.get("name") or "",
            "venue": venue_name,
            "lat": round(lat, 4), "lon": round(lon, 4),
            "start": begin.strftime("%Y-%m-%dT%H:%M"),
            "date": end.strftime("%Y-%m-%d"),
            "end": end.strftime("%H:%M"),
            "endEstimated": True,
            "category": segment,
            "size": size_for(venue_name, segment),
            "source": "Ticketmaster",
            "url": e.get("url") or "",
        })
    out.sort(key=lambda x: x["start"])
    return out


def fetch_ticketmaster(key: str) -> list[dict]:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    params_base = {
        "apikey": key, "countryCode": "GB", "unit": "miles", "size": 200, "sort": "date,asc",
        "startDateTime": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endDateTime": (now + timedelta(days=DAYS_AHEAD)).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    raw = []
    for lat, lon, radius in CENTRES:
        for page in range(3):  # up to 600 events per circle
            data = get_json(TM_URL, {**params_base, "latlong": f"{lat},{lon}", "radius": radius, "page": page})
            raw += ((data.get("_embedded") or {}).get("events")) or []
            pages = ((data.get("page") or {}).get("totalPages")) or 0
            time.sleep(0.25)  # stay well under the 5 requests/second limit
            if page + 1 >= pages:
                break
    return transform_tm(raw)


def transform_bank(data: dict) -> list[dict]:
    today = datetime.now(timezone.utc).date().isoformat()
    events = ((data.get("england-and-wales") or {}).get("events")) or []
    return [{"date": e["date"], "title": e["title"]} for e in events if e.get("date", "") >= today][:8]


def load_towns(path: str = TOWNS_JS) -> list[tuple[str, float, float]]:
    """Town ids and coordinates, read from the app's own town list so there is one source of truth."""
    import re
    src = open(path, encoding="utf-8").read()
    return [(m[0], float(m[1]), float(m[2]))
            for m in re.findall(r'\["([a-z0-9-]+)", "[^"]+", \d, (-?\d+\.\d+), (-?\d+\.\d+),', src)]


def transform_weather(town_ids: list[str], responses: list[dict]) -> dict:
    """Open-Meteo multi-location responses -> compact per-town hourly arrays. Pure, tested offline."""
    out = {"start": None, "towns": {}}
    for tid, r in zip(town_ids, responses):
        h = r.get("hourly") or {}
        times = h.get("time") or []
        if not times:
            continue
        out["start"] = out["start"] or times[0]
        rnd = lambda xs, d=0: [None if x is None else round(x, d) for x in (xs or [])]
        out["towns"][tid] = {
            "p": rnd(h.get("precipitation_probability")),
            "r": rnd(h.get("precipitation"), 1),
            "t": rnd(h.get("temperature_2m")),
        }
    return out


def fetch_weather(towns: list[tuple[str, float, float]], chunk: int = 40) -> dict:
    ids, responses = [], []
    for i in range(0, len(towns), chunk):
        part = towns[i:i + chunk]
        data = get_json(WEATHER_URL, {
            "latitude": ",".join(f"{t[1]:.3f}" for t in part),
            "longitude": ",".join(f"{t[2]:.3f}" for t in part),
            "hourly": "precipitation_probability,precipitation,temperature_2m",
            "forecast_hours": WEATHER_HOURS, "timezone": "Europe/London",
        })
        responses += data if isinstance(data, list) else [data]
        ids += [t[0] for t in part]
        time.sleep(0.3)
    return transform_weather(ids, responses)


def transform_floods(data: dict) -> list[dict]:
    """Environment Agency flood warnings in South West counties. severityLevel: 1 severe, 2 warning,
    3 alert, 4 no longer in force. Pure function, tested without the network."""
    out = []
    for it in data.get("items", []):
        area = it.get("floodArea") or {}
        county = area.get("county") or ""
        if not any(c.strip() in SW_COUNTIES for c in county.split(",")):
            continue
        out.append({
            "id": str(it.get("floodAreaID") or it.get("@id") or ""),
            "area": (it.get("description") or area.get("riverOrSea") or "")[:120],
            "county": county,
            "severity": int(it.get("severityLevel") or 4),
            "raised": it.get("timeRaised") or "",
            "changed": it.get("timeMessageChanged") or it.get("timeRaised") or "",
        })
    out.sort(key=lambda f: (f["severity"], f["area"]))
    return out[:60]


def main(out_path: str) -> int:
    result = {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
              "sources": [], "events": [], "bankHolidays": [], "weather": None, "floods": [], "notes": []}
    key = os.environ.get("TICKETMASTER_API_KEY", "").strip()
    if key:
        try:
            result["events"] = fetch_ticketmaster(key)
            result["sources"].append("Ticketmaster")
        except Exception as e:  # keep the app working with whatever else we got
            result["notes"].append(f"ticketmaster_failed: {type(e).__name__}")
    else:
        result["notes"].append("ticketmaster_no_key")
    try:
        result["bankHolidays"] = transform_bank(get_json(BANK_URL))
        result["sources"].append("GOV.UK")
    except Exception as e:
        result["notes"].append(f"bank_holidays_failed: {type(e).__name__}")

    try:
        result["weather"] = fetch_weather(load_towns())
        result["sources"].append("Open-Meteo")
    except Exception as e:
        result["notes"].append(f"weather_failed: {type(e).__name__}")

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    try:
        result["floods"] = transform_floods(get_json(FLOOD_URL))
        result["sources"].append("Environment Agency")
    except Exception as e:  # noqa: BLE001
        result["notes"].append(f"floods_failed: {type(e).__name__}")
    n_weather = len((result["weather"] or {}).get("towns", {}))
    print(f"events={len(result['events'])} bank_holidays={len(result['bankHolidays'])} weather_towns={n_weather} floods={len(result['floods'])} notes={result['notes']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "app/data/events.json"))
