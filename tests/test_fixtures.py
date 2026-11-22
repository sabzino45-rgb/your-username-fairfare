"""app/fixtures.json: the hand-checked big-venue fixture list (research agent keeps it)."""
import json
import os
from datetime import date, datetime

PATH = os.path.join(os.path.dirname(__file__), "..", "app", "fixtures.json")
SW_BOX = (49.8, 52.2, -6.5, -1.4)  # lat min/max, lon min/max: the South West


def load():
    with open(PATH, encoding="utf-8") as f:
        return json.load(f)


def test_fixture_list_shape():
    d = load()
    date.fromisoformat(d["checked"])
    assert d["fixtures"], "empty fixture list"
    ids = set()
    for e in d["fixtures"]:
        assert e["id"] not in ids
        ids.add(e["id"])
        for k in ("name", "venue", "start", "date", "end", "category", "size", "source", "url"):
            assert e.get(k), (e["id"], k)
        assert e["url"].startswith("https://"), e["id"]
        assert SW_BOX[0] <= e["lat"] <= SW_BOX[1] and SW_BOX[2] <= e["lon"] <= SW_BOX[3], e["id"]
        start = datetime.fromisoformat(e["start"])
        end = datetime.fromisoformat(f"{e['date']}T{e['end']}")
        assert start < end <= start.replace(hour=23, minute=59) or (end - start).days == 0, e["id"]
        assert e["size"] in ("small", "medium", "big")


def test_fixture_list_sorted():
    starts = [e["start"] for e in load()["fixtures"]]
    assert starts == sorted(starts)
