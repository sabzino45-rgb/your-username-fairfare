"""Cycle 2, R2: wrong_number_count, false_accept_count and readable_manual_rate in tools/run_eval.py."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from tools.run_eval import evaluate  # noqa: E402

LEGS = {"pickup_min": 4, "pickup_miles": 1.0, "trip_min": 10, "trip_miles": 4.0}


def case(cid, text, fare):
    return {"id": cid, "origin": "synthetic", "ocr_text": text,
            "expected_fields": {"fare": fare, **LEGS}, "profile": {"cost_per_mile": 0.2}}


CASES = [
    # 1. Wrong fare that is not a false ACCEPT: reads £5.00, card says £8.00 (both DECLINE).
    case("wrong", "UberX\n£5.00\n4 mins (1.0 mi) away\n10 mins (4.0 mi) trip", 4.00),
    # 2. Refusal: the fare line is missing. Readable card sent to manual entry, not a wrong number.
    case("refusal", "UberX\n4 mins (1.0 mi) away\n10 mins (4.0 mi) trip", 4.00),
    # 3. False ACCEPT: reads £40.00, card's true fare £4.00 gives DECLINE.
    case("false_accept", "UberX\n£40.00\n4 mins (1.0 mi) away\n10 mins (4.0 mi) trip", 4.00),
    # 4. Correct, and the fare really is not on the card (expected null): not readable, not wrong.
    case("correct_null", "UberX\n4 mins (1.0 mi) away\n10 mins (4.0 mi) trip", None),
]


def test_new_metrics_on_hand_made_cases():
    r = evaluate(CASES)
    rows = {row["id"]: row for row in r["cases"]}
    assert rows["wrong"]["wrong_fields"] == ["fare"]
    assert rows["refusal"]["wrong_fields"] == [] and rows["refusal"]["missing"] == ["fare"]
    assert rows["false_accept"]["wrong_fields"] == ["fare"]
    assert rows["false_accept"]["decision"] == "ACCEPT" and rows["false_accept"]["true_decision"] == "DECLINE"
    assert rows["wrong"]["decision"] != "ACCEPT"
    assert rows["correct_null"]["true_decision"] == "UNKNOWN"
    assert r["wrong_number_count"] == 2          # refusals never count
    assert r["false_accept_count"] == 1
    assert r["readable_n"] == 3                  # correct_null has a null expected field
    assert r["readable_manual_rate"] == round(1 / 3, 4)


def test_readable_manual_rate_is_none_without_readable_cases():
    r = evaluate([CASES[3]])
    assert r["readable_n"] == 0 and r["readable_manual_rate"] is None
    assert r["wrong_number_count"] == 0 and r["false_accept_count"] == 0


def test_false_accept_is_judged_with_the_app_defaults_too():
    """QA cycle 3 F6: the app's default £/mile floor (0.9) is lower than verdict.py's (1.00). A wrong fare that gives
    ACCEPT only at the app's defaults must still count as a false ACCEPT."""
    from fairfare import DriverProfile, Offer, estimate
    from tools.run_eval import APP_DEFAULTS
    legs = dict(pickup_min=5, pickup_miles=2.0, trip_min=15, trip_miles=6.0)
    app, py = DriverProfile(**APP_DEFAULTS), DriverProfile()
    dec = lambda fare, p: estimate(Offer(fare=fare, **legs), p).decision  # noqa: E731
    pairs = [(t / 20, r / 20) for t in range(100, 600) for r in range(t + 1, t + 40)
             if dec(r / 20, app) == "ACCEPT" and dec(r / 20, py) != "ACCEPT" and dec(t / 20, app) != "ACCEPT"]
    assert pairs, "no fare pair separates the two profiles"
    true_fare, read_fare = pairs[0]
    c = {"id": "app_only", "origin": "synthetic", "profile": {"cost_per_mile": 0.2},
         "ocr_text": f"UberX\n£{read_fare:.2f}\n5 mins (2.0 mi) away\n15 mins (6.0 mi) trip",
         "expected_fields": {"fare": true_fare, **legs}}
    assert evaluate([c])["false_accept_count"] == 1


def test_app_defaults_match_engine_js():
    import json
    import re
    import shutil
    import subprocess
    import pytest
    from tools.run_eval import APP_DEFAULTS
    if shutil.which("node") is None:
        pytest.skip("node not installed")
    engine = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app", "js", "engine.js"))
    r = subprocess.run(["node", "--input-type=module", "-e",
                        f"import {{ DEFAULT_SETTINGS as d }} from '{engine}'; console.log(JSON.stringify(d))"],
                       capture_output=True, text=True, check=True)
    d = json.loads(r.stdout)
    assert (d["targetHr"], d["minMile"], d["costMile"], d["commission"] / 100) == (
        APP_DEFAULTS["target_per_hour"], APP_DEFAULTS["target_per_mile"], APP_DEFAULTS["cost_per_mile"],
        APP_DEFAULTS["service_fee_share"])
    assert re.match(r"^(both)$", d["optimise"])
