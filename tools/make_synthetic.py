"""Generate SYNTHETIC seed cases for eval_set/ so the loop runs before pilot data exists.

Synthetic cases test the plumbing, not the product. Every case is tagged
"origin": "synthetic" and run_eval.py reports real (pilot) and synthetic
metrics separately. Replace these with real redacted pilot cases ASAP.

Usage: python tools/make_synthetic.py [n] > eval_set/synthetic.jsonl
"""

from __future__ import annotations

import json
import random
import re
import sys

LAYOUTS = [
    "UberX\n£{fare:.2f}\n{rating} ★\n{pm:.0f} mins ({pmi:.1f} mi) away\n{tm:.0f} mins ({tmi:.1f} mi) trip\n{surge_line}Accept",
    "Comfort\n£{fare:.2f}\n{rating}★\n{pm:.0f} min ({pkm:.1f} km) away\n{tm:.0f} min ({tkm:.1f} km) trip\n{surge_line}",
    # Changed layout: no "away"/"trip" labels.
    "UberX · Exclusive\n£{fare:.2f}\n{pm:.0f} min · {pmi:.1f} mi\n{tm:.0f} min · {tmi:.1f} mi\n{surge_line}",
    # Pickup-prefixed layout.
    "£{fare:.2f}\nPickup: {pm:.0f} min · {pmi:.1f} mi\nTrip: {tm:.0f} min · {tmi:.1f} mi\n{rating} ★",
]


def make_case(i: int, rng: random.Random) -> dict:
    kind = rng.choice(["normal"] * 6 + ["short", "long_pickup", "surge", "missing", "garbled"])
    tm = rng.uniform(4, 9) if kind == "short" else rng.uniform(10, 45)
    pm = rng.uniform(12, 20) if kind == "long_pickup" else rng.uniform(2, 9)
    tmi = tm * rng.uniform(0.25, 0.6)
    pmi = pm * rng.uniform(0.25, 0.5)
    surge = round(rng.uniform(1.5, 8), 2) if kind == "surge" else None
    fare = 2.5 + 0.9 * tmi + 0.15 * tm + (surge or 0)
    layout = rng.choice(LAYOUTS)
    text = layout.format(
        fare=fare, rating=round(rng.uniform(4.6, 5.0), 2), pm=pm, pmi=pmi, tm=tm, tmi=tmi,
        pkm=pmi * 1.609344, tkm=tmi * 1.609344,
        surge_line=f"+£{surge:.2f} surge included\n" if surge else "",
    )
    expected = {"fare": round(fare, 2), "pickup_min": round(pm), "pickup_miles": round(pmi, 1),
                "trip_min": round(tm), "trip_miles": round(tmi, 1)}
    if kind == "missing":
        # Drop the trip leg (always the second min/distance line) - e.g. cropped screenshot.
        lines = text.splitlines()
        legs = [i for i, l in enumerate(lines) if re.search(r"\d\s*min", l)]
        del lines[legs[1]]
        text = "\n".join(lines)
        expected["trip_min"] = expected["trip_miles"] = None
    if kind == "garbled":
        text = text.replace("£", "E").replace(" min", " rnin")
        expected = {k: None for k in expected}

    # "Actual" logged outcome: what the trip really paid per hour after costs.
    real_minutes = (pm + tm) * rng.uniform(1.0, 1.45) + rng.uniform(1, 4)
    real_miles = pmi + tmi * (1 + rng.uniform(0, 0.4))
    take_home = fare - real_miles * 0.20
    return {
        "id": f"syn-{i:04d}",
        "origin": "synthetic",
        "kind": kind,
        "ocr_text": text,
        "expected_fields": expected,
        "outcome": {"take_home": round(take_home, 2), "minutes": round(real_minutes, 1),
                    "miles": round(real_miles, 2)},
        "profile": {"cost_per_mile": 0.20},
    }


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    rng = random.Random(42)
    for i in range(n):
        print(json.dumps(make_case(i, rng)))
