"""Cycle 3 attempt 2 (QA F2): on a screenshot the bare legs are put in screen order using the OCR line boxes
(engine.js orderLegsByPosition), and bare legs whose order can't be confirmed go to manual entry
(reconcileLegOrder). My own made-up line lists; not QA's cases."""
import json
import os
import shutil
import subprocess

import pytest

ROOT = os.path.join(os.path.dirname(__file__), "..")
ENGINE = "file://" + os.path.abspath(os.path.join(ROOT, "app", "js", "engine.js"))
pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")

# Screen order (top to bottom) of a real-layout card. y = line-box top in px.
SCREEN = [("UberX", 100), ("£19.40", 140), ("After fees", 200), ("£1.87 est. holiday entitlement included", 240),
          ("| 4 min (1.1 mi)", 300), ("[ADDRESS]", 330), ("41 mins (21.3 mi)", 360), ("[ADDRESS]", 390), ("Match", 450)]
TRUE = [19.40, 4, 1.1, 41, 21.3]


def ocr_text(order):
    return "\n\n".join(SCREEN[i][0] for i in order) + "\n"


CASES = {
    # OCR emits the first leg (connector glyph glued to it) last: put back in screen order.
    "first_leg_last": ([0, 1, 2, 3, 5, 6, 7, 4, 8], [{"text": t, "y": y} for t, y in SCREEN], True),
    "already_in_order": (list(range(9)), [{"text": t, "y": y} for t, y in SCREEN], True),
    # OCR line text with different spacing still matches.
    "spacing": ([0, 1, 2, 3, 5, 6, 7, 4, 8], [{"text": "  " + t.replace(" ", "  ") + "\n", "y": y} for t, y in SCREEN], True),
    # A leg line is not among the OCR lines: its screen position is unknown.
    "leg_not_in_lines": ([0, 1, 2, 3, 5, 6, 7, 4, 8], [{"text": t, "y": y} for t, y in SCREEN if "41 mins" not in t], False),
    "no_geometry": ([0, 1, 2, 3, 5, 6, 7, 4, 8], None, False),
    "bad_y": ([0, 1, 2, 3, 5, 6, 7, 4, 8], [{"text": t, "y": None if "4 min" in t else y} for t, y in SCREEN], False),
}

JS = """
import { orderLegsByPosition, reconcileLegOrder, parseOfferText } from '%s';
const cases = JSON.parse(process.argv[1]);
const out = {};
for (const [k, [text, lines]] of Object.entries(cases)) {
  const r = orderLegsByPosition(text, lines);
  const o = reconcileLegOrder(parseOfferText(r.text), r.ok);
  out[k] = { ok: r.ok, fields: [o.fare, o.pickup_min, o.pickup_miles, o.trip_min, o.trip_miles], warnings: o.warnings,
             sameLines: r.text.split('\\n').slice().sort().join('|') === text.split('\\n').slice().sort().join('|') };
}
// One leg only, or labelled legs: nothing to confirm, never refused for order.
const one = orderLegsByPosition('UberX\\n£9.00\\n6 min (2.0 mi)', null);
const lab = orderLegsByPosition('UberX\\n£9.00\\n18 mins (7.2 mi) trip\\n6 mins (1.8 mi) away', null);
out.one = one.ok;
out.labelled = reconcileLegOrder(parseOfferText(lab.text), lab.ok).pickup_min;
console.log(JSON.stringify(out));
"""


def test_leg_order_by_position():
    payload = {k: [ocr_text(order), lines] for k, (order, lines, _) in CASES.items()}
    r = subprocess.run(["node", "--input-type=module", "-e", JS % ENGINE, json.dumps(payload)],
                       capture_output=True, text=True, check=True)
    out = json.loads(r.stdout)
    for k, (_, _, ok) in CASES.items():
        assert out[k]["ok"] is ok, k
        assert out[k]["sameLines"], k  # only reordered, nothing added or lost
        if ok:
            assert out[k]["fields"] == TRUE, (k, out[k])
        else:
            assert out[k]["fields"][1:] == [None] * 4 and "leg_order_unconfirmed" in out[k]["warnings"], k
    assert out["one"] is True
    assert out["labelled"] == 6  # labelled legs don't depend on order
