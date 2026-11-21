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
