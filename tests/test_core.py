import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fairfare import DriverProfile, estimate, manual_offer, parse_offer_text  # noqa: E402
from tools.redact import redact  # noqa: E402
from tools.economics import compute  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")

CARD = """UberX
£12.40
4.92 ★
Sarah
6 mins (1.8 mi) away
14 Baker Street, NW1 6XE
18 mins (7.2 mi) trip
+£2.10 surge included
Accept"""


def test_parses_standard_card():
    o = parse_offer_text(CARD)
    assert (o.fare, o.pickup_min, o.pickup_miles, o.trip_min, o.trip_miles) == (12.40, 6, 1.8, 18, 7.2)
    assert o.surge == 2.10 and o.rider_rating == 4.92 and not o.missing


def test_parser_output_contains_no_personal_data():
    blob = json.dumps(parse_offer_text(CARD).to_dict())
    for pii in ("Sarah", "Baker", "NW1"):
        assert pii not in blob


def test_km_layout_converted_to_miles():
    o = parse_offer_text("£9.00\n5 min (3.2 km) away\n12 min (8.0 km) trip")
    assert abs(o.pickup_miles - 1.99) < 0.01 and abs(o.trip_miles - 4.97) < 0.01


def test_label_on_next_line_not_stolen():
    o = parse_offer_text("£10\nPickup: 4 min · 1.4 mi\nTrip: 13 min · 6.1 mi")
    assert (o.pickup_min, o.trip_min) == (4, 13)


def test_missing_and_garbage_never_raise_and_never_guess():
    for text in ("", "   ", "E12.40 rnins", "£12.40\n6 mins (1.8 mi) away"):
        o = parse_offer_text(text)
        assert o.missing
        assert estimate(o).decision == "UNKNOWN"


def test_implausible_speed_dropped():
    o = parse_offer_text("£10\n1 min (40 mi) away\n10 min (3 mi) trip")
    assert o.pickup_min is None and "pickup_speed_implausible" in o.warnings


def test_verdict_is_a_range_not_a_point():
    v = estimate(manual_offer(15, 5, 1.5, 20, 8))
    assert v.per_hour_low < v.per_hour_mid < v.per_hour_high
    assert v.per_mile_low < v.per_mile_mid < v.per_mile_high


def test_verdict_decisions():
    great = estimate(manual_offer(40, 3, 1, 20, 10), DriverProfile(target_per_hour=18))
    awful = estimate(manual_offer(4, 15, 6, 6, 2), DriverProfile(target_per_hour=18))
    assert great.decision == "ACCEPT" and awful.decision == "DECLINE"


def test_edge_cases_lower_confidence():
    assert estimate(manual_offer(6, 2, 0.5, 5, 1.5)).confidence != "high"      # very short trip
    assert estimate(manual_offer(20, 20, 8, 15, 6)).confidence != "high"      # long pickup


def test_redaction():
    out = redact(CARD + "\nCall 07700 900123 or a@b.com")
    for pii in ("Sarah", "Baker Street", "NW1 6XE", "07700", "a@b.com"):
        assert pii not in out
    assert "£12.40" in out and "UberX" in out and "18 mins (7.2 mi) trip" in out


def test_economics_margin():
    r = compute({"price_per_month": 5, "vat_rate": 0, "app_store_fee": 0, "ocr_cost_per_scan": 0.01,
                 "on_device_ocr_share": 0, "llm_cost_per_scan": 0, "storage_cost_per_scan": 0,
                 "scans_per_user_month": 100, "fixed_cost_per_user_month": 1})
    assert r["gross_margin_per_user_month"] == 3.0


def test_gate_blocks_and_holds(tmp_path, monkeypatch):
    import tools.gate as gate
    monkeypatch.setattr(gate, "ROOT", str(tmp_path))
    d = tmp_path / "reports" / "cycle-1"
    d.mkdir(parents=True)
    (d / "goal.json").write_text(json.dumps({"metric": "verdict_median_error", "op": "<", "value": 0.15}))
    (d / "eval.json").write_text(json.dumps({"judged_on": "synthetic", "synthetic": {"verdict_median_error": 0.1}}))
    for r in ("qa.md", "privacy.md", "economics.md", "ops.md"):
        (d / r).write_text("STATUS: PASS\n")
    assert gate.main("1") == 0
    (d / "privacy.md").write_text("STATUS: BLOCK\nraw images retained")
    assert gate.main("1") == 1
    (d / "privacy.md").write_text("STATUS: PASS\n")
    (d / "human_gates.md").write_text("- [ ] Pricing change to £5.99\n")
    assert gate.main("1") == 2


def test_eval_runs_on_seed_set():
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "run_eval.py")], capture_output=True, text=True)
    assert r.returncode == 0 and "[synthetic] cases=" in r.stdout
