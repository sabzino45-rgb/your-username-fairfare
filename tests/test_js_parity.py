"""The app's JavaScript engine (app/js/engine.js) must match the Python engine on every eval case."""
import glob
import json
import os
import shutil
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from fairfare import DriverProfile, estimate, parse_offer_text  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")

JS = """
import { parseOfferText, estimate } from '%s';
import fs from 'fs';
const out = [];
for (const line of fs.readFileSync('%s', 'utf8').split('\\n')) {
  if (!line.trim()) continue;
  const c = JSON.parse(line);
  const o = parseOfferText(c.ocr_text);
  const v = estimate(o, { optimise: 'both', targetHr: 18, minMile: 1.0, costMile: 0.2, commission: 0 });
  out.push({ id: c.id, fields: [o.fare, o.pickup_min, o.pickup_miles, o.trip_min, o.trip_miles],
             decision: v.decision, perHr: v.perHr || null, perMile: v.perMile || null });
}
console.log(JSON.stringify(out));
"""


CASE_FILES = sorted(glob.glob(os.path.abspath(os.path.join(ROOT, "eval_set", "*.jsonl"))))


def test_parity_covers_every_eval_file():
    assert len(CASE_FILES) >= 2 and any(p.endswith("synthetic_fullscreen.jsonl") for p in CASE_FILES)


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
@pytest.mark.parametrize("cases", CASE_FILES, ids=os.path.basename)
def test_js_engine_matches_python(cases):
    engine = os.path.abspath(os.path.join(ROOT, "app", "js", "engine.js"))
    r = subprocess.run(["node", "--input-type=module", "-e", JS % ("file://" + engine, cases)],
                       capture_output=True, text=True, check=True)
    js = {row["id"]: row for row in json.loads(r.stdout)}
    with open(cases) as fh:
        for line in fh:
            if not line.strip():
                continue
            c = json.loads(line)
            o = parse_offer_text(c["ocr_text"])
            v = estimate(o, DriverProfile())
            j = js[c["id"]]
            assert j["fields"] == [o.fare, o.pickup_min, o.pickup_miles, o.trip_min, o.trip_miles], c["id"]
            assert j["decision"] == v.decision, c["id"]
            if v.per_hour_mid is not None:
                assert j["perHr"] == [v.per_hour_low, v.per_hour_mid, v.per_hour_high], c["id"]
                assert j["perMile"] == [v.per_mile_low, v.per_mile_mid, v.per_mile_high], c["id"]


# Adversarial texts (QA cycle 1) that aren't in any eval file: the two engines must agree on these too.
ADVERSARIAL = [
    "UberX\n£١٢.٤٠\n٦ mins (١.٨ mi) away\n١٨ mins (٧.٢ mi) trip",
    "UberX\n£１２.４０\n６ mins (１.８ mi) away\n１８ mins (７.２ mi) trip",
    "UberX\n£40.00\n5 mins (1.5 mi) away\n1 hr 20 mins (25 mi) trip",
    "UberX\n£l2.40\n6 mins (l.8 mi) away\nl8 mins (7.2 mi) trip",
    "UberX\n£950\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip",
    "UberX\n£10.80\u2013£13.20\n5 mins (1.6 mi) away\n15 mins (6.0 mi) trip",
    "13:10\nUberX\nMonzo · You spent £32.50 at Shell\nE11.10\n5 mins (1.8 mi) away\n16 mins (6.6 mi) trip",
    "08:01\n£7.20 · 3 min (1.0 mi)\n£21.40 · 12 min (6.0 mi)",
    "UberX\n£21.00\n5 mins (2 mi) away\n0 mins (12 mi) trip",
    "12 min · 5.1 mi\nUberX\n£13.60\n7 mins (2.4 mi) away\n21 mins (8.6 mi) trip",
    "UberX\n£14.20\n£1.14/mi · £0.62/min\n6 mins (2.1 mi) away\n17 mins (8.1 mi) trip",
    "£22.40\n6 mins (1.8 mi) away\n10 mins (3.2 mi) to stop\n12 mins (5 mi) trip",
    "UberX\n£‏12.40\n‎6 mins (1.8 mi) away\n18 mins (7.2 mi) trip",
    "£10.20\n5 min · 1.7 mi\n16 min · 6.3 mi",
]


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_js_engine_matches_python_on_adversarial_texts(tmp_path):
    cases = tmp_path / "adv.jsonl"
    cases.write_text("\n".join(json.dumps({"id": f"adv-{i}", "ocr_text": t}) for i, t in enumerate(ADVERSARIAL)))
    engine = os.path.abspath(os.path.join(ROOT, "app", "js", "engine.js"))
    r = subprocess.run(["node", "--input-type=module", "-e", JS % ("file://" + engine, str(cases))],
                       capture_output=True, text=True, check=True)
    js = {row["id"]: row for row in json.loads(r.stdout)}
    for i, t in enumerate(ADVERSARIAL):
        o = parse_offer_text(t)
        v = estimate(o, DriverProfile())
        j = js[f"adv-{i}"]
        assert j["fields"] == [o.fare, o.pickup_min, o.pickup_miles, o.trip_min, o.trip_miles], t
        assert j["decision"] == v.decision, t
