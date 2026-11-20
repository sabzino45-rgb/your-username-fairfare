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
