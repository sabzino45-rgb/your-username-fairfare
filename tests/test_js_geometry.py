"""Attempt 2 (cycle 2): the screenshot height check in app/js/engine.js (fareFromLines, reconcileScanFare).

Examples are my own (synthetic line lists with made-up heights), not QA's cases.
"""
import json
import os
import shutil
import subprocess

import pytest

ROOT = os.path.join(os.path.dirname(__file__), "..")
ENGINE = "file://" + os.path.abspath(os.path.join(ROOT, "app", "js", "engine.js"))

S, M, B = 20, 24, 60  # small text, label size, fare size (pixels)
CARD = [("10:02 4G 61%", S), ("UberX", M), ("£12.40", B), ("4.92 ★", S),
        ("6 mins (1.8 mi) away", S), ("18 mins (7.2 mi) trip", S), ("Accept", M)]

CASES = {
    "normal": (CARD, 12.40),
    "fare_lost_pill_small": ([("£58.40", 26), ("Gold", S)] + [l for l in CARD if l[0] != "£12.40"], None),
    "pill_as_tall_as_fare": ([("£58.40", 52), ("Online", S)] + CARD, None),          # within the 25% margin
    "pill_just_outside_margin": ([("£58.40", 47), ("Online", S)] + CARD, 12.40),     # 60 >= 1.25 * 47
    "tallest_amount_unreadable": ([(t, h) if t != "£12.40" else ("E12.40", B) for t, h in CARD], None),
    "two_amounts_on_tallest": ([(t, h) if t != "£12.40" else ("£14.90 £12.40", B) for t, h in CARD], None),
    "rate_on_fare_line": ([(t, h) if t != "£12.40" else ("Accept £14.20 · £1.10/mi", B) for t, h in CARD], 14.20),
    "ocr_letter_in_fare": ([(t, h) if t != "£12.40" else ("£1O.80", B) for t, h in CARD], 10.80),
    "everything_same_size": ([(t, S) for t, _ in CARD], None),                       # not 1.5x the median
    "too_few_lines": ([("£12.40", B), ("UberX", M)], None),
    "no_amount": ([(t, h) for t, h in CARD if "£" not in t], None),
    "rider_price_taller_than_fare": ([(t, h) if t != "£12.40" else ("£16.00", 70) for t, h in CARD]
                                     + [("Rider pays", S), ("£10.40", 40)], 16.00),  # height alone: text rules must catch it
    "garbage_input": ([("", 0), ("£5.00", -3)], None),
}

JS = """
import { fareFromLines, reconcileScanFare } from '%s';
const cases = JSON.parse(process.argv[1]);
const out = {};
for (const [k, [lines]] of Object.entries(cases)) out[k] = fareFromLines(lines.map(([text, height]) => ({ text, height })));
const base = { fare: 12.4, pickup_min: 6, pickup_miles: 1.8, trip_min: 18, trip_miles: 7.2, warnings: [], missing: [] };
out.rec = [reconcileScanFare(base, 12.4).fare, reconcileScanFare(base, 58.4).fare, reconcileScanFare(base, null).fare,
           reconcileScanFare({ ...base, fare: null, missing: ['fare'] }, 12.4).fare, reconcileScanFare(base, undefined).fare,
           reconcileScanFare(base, 58.4).missing, reconcileScanFare(base, 58.4).warnings, base.warnings.length];
out.notArray = fareFromLines(null);
console.log(JSON.stringify(out));
"""


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_fare_from_lines_and_reconcile():
    r = subprocess.run(["node", "--input-type=module", "-e", JS % ENGINE, json.dumps(CASES)],
                       capture_output=True, text=True, check=True)
    out = json.loads(r.stdout)
    for k, (_, want) in CASES.items():
        assert out[k] == want, k
    agree, disagree, geo_none, text_none, no_geo, missing, warnings, untouched = out["rec"]
    assert agree == 12.4 and no_geo == 12.4
    assert disagree is None and geo_none is None and text_none is None
    assert missing == ["fare"] and "fare_height_disagrees" in warnings and "needs_manual_entry" in warnings
    assert untouched == 0  # the input offer is not changed
    assert out["notArray"] is None
