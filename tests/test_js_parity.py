"""The app's JavaScript engine (app/js/engine.js) must match the Python engine on every eval case."""
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


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_js_engine_matches_python():
    engine = os.path.abspath(os.path.join(ROOT, "app", "js", "engine.js"))
    cases = os.path.abspath(os.path.join(ROOT, "eval_set", "synthetic.jsonl"))
    r = subprocess.run(["node", "--input-type=module", "-e", JS % ("file://" + engine, cases)],
                       capture_output=True, text=True, check=True)
    js = {row["id"]: row for row in json.loads(r.stdout)}
    with open(cases) as fh:
        for line in fh:
            c = json.loads(line)
            o = parse_offer_text(c["ocr_text"])
            v = estimate(o, DriverProfile())
            j = js[c["id"]]
            assert j["fields"] == [o.fare, o.pickup_min, o.pickup_miles, o.trip_min, o.trip_miles], c["id"]
            assert j["decision"] == v.decision, c["id"]
            if v.per_hour_mid is not None:
                assert j["perHr"] == [v.per_hour_low, v.per_hour_mid, v.per_hour_high], c["id"]
                assert j["perMile"] == [v.per_mile_low, v.per_mile_mid, v.per_mile_high], c["id"]
