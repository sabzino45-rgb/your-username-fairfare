import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from tools.fetch_events import transform_bank, transform_tm  # noqa: E402


def ev(id_, name, date, time_, venue, lat, lon, segment="Music", status="onsale"):
    return {"id": id_, "name": name, "url": "https://example.test/" + id_,
            "dates": {"start": {"localDate": date, "localTime": time_}, "status": {"code": status}},
            "classifications": [{"segment": {"name": segment}}],
            "_embedded": {"venues": [{"name": venue, "location": {"latitude": str(lat), "longitude": str(lon)}}]}}


def test_transform_keeps_south_west_and_estimates_finish():
    raw = [
        ev("1", "Exeter Chiefs v Bath", "2026-12-05", "15:00:00", "Sandy Park", 50.709, -3.469, "Sports"),
        ev("2", "Gig in London", "2026-12-05", "19:30:00", "O2 Arena", 51.503, 0.003),
        ev("3", "Cancelled show", "2026-12-06", "19:30:00", "Bristol Beacon", 51.455, -2.598, status="cancelled"),
        ev("4", "No time", "2026-12-06", None, "Bristol Beacon", 51.455, -2.598),
        ev("1", "Duplicate", "2026-12-05", "15:00:00", "Sandy Park", 50.709, -3.469, "Sports"),
        ev("5", "Late gig", "2026-12-05", "22:30:00", "O2 Academy Bristol", 51.452, -2.597),
    ]
    out = transform_tm(raw)
    assert [e["id"] for e in out] == ["tm-1", "tm-5"]
    chiefs, late = out
    assert (chiefs["date"], chiefs["end"], chiefs["size"], chiefs["endEstimated"]) == ("2026-12-05", "17:15", "big", True)
    assert (late["date"], late["end"]) == ("2026-12-06", "01:30")  # finish past midnight moves to next day
    assert late["size"] == "medium" and late["source"] == "Ticketmaster"


def test_bank_holidays_future_only():
    data = {"england-and-wales": {"events": [{"title": "Old", "date": "2000-01-01"}, {"title": "Christmas Day", "date": "2099-12-25"}]}}
    assert transform_bank(data) == [{"date": "2099-12-25", "title": "Christmas Day"}]


def test_towns_parsed_from_app():
    from tools.fetch_events import load_towns
    towns = load_towns()
    assert len(towns) >= 100
    ids = [t[0] for t in towns]
    assert "exeter" in ids and "st-marys" in ids and len(set(ids)) == len(ids)
    for _, lat, lon in towns:
        assert 49.8 < lat < 52.2 and -6.5 < lon < -1.5


def test_weather_transform():
    from tools.fetch_events import transform_weather
    resp = [{"hourly": {"time": ["2026-11-22T18:00", "2026-11-22T19:00"],
                        "precipitation_probability": [20, 85], "precipitation": [0.0, 1.26], "temperature_2m": [9.44, 8.6]}},
            {"hourly": {}}]
    out = transform_weather(["exeter", "bude"], resp)
    assert out["start"] == "2026-11-22T18:00"
    assert out["towns"] == {"exeter": {"p": [20, 85], "r": [0.0, 1.3], "t": [9, 9]}}


def test_flood_transform_keeps_south_west_only():
    from tools.fetch_events import transform_floods
    data = {"items": [
        {"floodAreaID": "a1", "description": "River Parrett at Langport", "severityLevel": 2, "timeRaised": "2026-11-23T08:00:00",
         "floodArea": {"county": "Somerset", "riverOrSea": "River Parrett"}},
        {"floodAreaID": "a2", "description": "River Severn at Tewkesbury", "severityLevel": 3,
         "floodArea": {"county": "Gloucestershire, Worcestershire"}},
        {"floodAreaID": "a3", "description": "River Ouse at York", "severityLevel": 1, "floodArea": {"county": "York"}},
    ]}
    out = transform_floods(data)
    assert [f["id"] for f in out] == ["a1", "a2"]
    assert out[0]["severity"] == 2 and out[0]["area"] == "River Parrett at Langport"
