"""Cycle 2 screenshot path in app/js/engine.js: word-height check (fareFromWords), label-or-Accept rule
(cardMarkerFound, reconcileScanFare) and the colour-aware OCR clean-up (cleanPixels).

Examples are my own (made-up word lists and pixel images), not QA's cases.
"""
import json
import os
import shutil
import subprocess

import pytest

ROOT = os.path.join(os.path.dirname(__file__), "..")
ENGINE = "file://" + os.path.abspath(os.path.join(ROOT, "app", "js", "engine.js"))
pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")

S, B = 25, 49  # word box heights measured on drawn cards: 17px body text, 34px fare (scan.md, attempt 3)
BODY = [("UberX", 26), ("4.92", 21), ("6", S), ("mins", S), ("(1.8", 30), ("mi)", 30), ("away", S),
        ("18", S), ("mins", S), ("(7.2", 30), ("mi)", 30), ("trip", S), ("Accept", 26)]


def card(fare="£12.40", h=B, extra=()):
    return [(fare, h)] + BODY + list(extra)


WORD_CASES = {
    "normal": (card(), 12.40),
    "smaller_fare_1.6x_body": (card(h=40), 12.40),
    "pill_80pct_of_fare": (card(extra=[("£58.40", 39)]), 12.40),      # 49 >= 1.15 * 39
    "pill_90pct_of_fare": (card(extra=[("£58.40", 44)]), None),        # within the margin
    "pill_taller_than_fare": (card(extra=[("£50.00", 54)]), None),
    "fare_lost_pill_small": ([("£58.40", 32)] + BODY, None),           # not 1.5x the median
    "tallest_unreadable": (card(fare="E12.40"), None),
    "pound_as_own_word": ([("£", B), ("12.40", B)] + BODY, 12.40),
    "rate_word_tallest": (card(fare="£1.10/mi"), None),
    "ocr_letter": (card(fare="£1O.80"), 10.80),
    "everything_same_size": ([(t, S) for t, _ in card()], None),
    "too_few_words": ([("£12.40", B), ("UberX", 26)], None),
    "garbage": ([("", 0), ("£5.00", -1)], None),
}

JS = """
import { fareFromWords, reconcileScanFare, cardMarkerFound, cleanPixels } from '%s';
const cases = JSON.parse(process.argv[1]);
const out = {};
for (const [k, [ws]] of Object.entries(cases)) {
  out[k] = fareFromWords(ws.map(([text, height], i) => ({ text, height, prev: i && ws[i - 1][0] === '£' ? '£' : '' })));
}
out.notArray = fareFromWords(null);
const legs = '6 mins (1.8 mi) away\\n18 mins (7.2 mi) trip';
out.marker = [cardMarkerFound('UberX\\n£12.40\\n' + legs), cardMarkerFound('Uber X\\n£12.40\\n' + legs),
              cardMarkerFound('£12.40\\n' + legs + '\\nAccept'), cardMarkerFound('£12.40\\n' + legs),
              cardMarkerFound('Accept £9.00\\n£12.40\\n' + legs), cardMarkerFound('UberX\\n£12.40')];
const base = { fare: 12.4, pickup_min: 6, pickup_miles: 1.8, trip_min: 18, trip_miles: 7.2, warnings: [], missing: [] };
const t = 'UberX\\n£12.40\\n' + legs;
out.rec = [reconcileScanFare(base, 12.4, t).fare, reconcileScanFare(base, 58.4, t).fare, reconcileScanFare(base, null, t).fare,
           reconcileScanFare({ ...base, fare: null, missing: ['fare'] }, 12.4, t).fare, reconcileScanFare(base, undefined, t).fare,
           reconcileScanFare(base, 12.4, '£12.40\\n' + legs).fare, reconcileScanFare(base, 12.4, '£12.40\\n' + legs).warnings,
           reconcileScanFare(base, 58.4, t).missing, base.warnings.length];

// cleanPixels on 200 x 100 images: a 160 x 60 block at (20, 20) with a 20 x 10 "stroke" inside at (90, 45).
function img(bg, block, stroke) {
  const w = 200, h = 100, a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inBlock = x >= 20 && x < 180 && y >= 20 && y < 80, inStroke = x >= 90 && x < 110 && y >= 45 && y < 55;
    const c = inStroke ? stroke : inBlock ? block : bg;
    a.set([...c, 255], (y * w + x) * 4);
  }
  cleanPixels(a, w, h);
  const at = (x, y) => a[(y * w + x) * 4];
  return [at(100, 50), at(40, 30), at(5, 5)]; // stroke, block, page
}
const W = [255, 255, 255], K = [0, 0, 0], GREEN = [46, 158, 91], BLUE = [39, 110, 241], YEL = [255, 192, 67], CARD = [28, 28, 30];
out.px = {
  white_on_green_light: img(W, GREEN, W), white_on_green_dark: img(K, GREEN, W), white_on_blue: img(W, BLUE, W),
  black_on_yellow: img(W, YEL, K), black_on_yellow_dark: img(CARD, YEL, K), white_on_black_button: img(W, K, W),
  black_on_white_button_dark: img(K, W, K), plain_dark_text: img(W, W, K), plain_light_text_dark: img(K, K, W),
};
console.log(JSON.stringify(out));
"""


def run():
    r = subprocess.run(["node", "--input-type=module", "-e", JS % ENGINE, json.dumps(WORD_CASES)],
                       capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def test_fare_from_words():
    out = run()
    for k, (_, want) in WORD_CASES.items():
        assert out[k] == want, k
    assert out["notArray"] is None


def test_label_or_accept_rule_and_reconcile():
    out = run()
    assert out["marker"] == [True, True, True, False, False, False]
    agree, disagree, geo_none, text_none, no_geo, no_marker, no_marker_warn, missing, untouched = out["rec"]
    assert agree == 12.4 and no_geo == 12.4
    assert disagree is None and geo_none is None and text_none is None and no_marker is None
    assert "fare_no_card_marker" in no_marker_warn
    assert missing == ["fare"] and untouched == 0  # the input offer is not changed


def test_clean_pixels_reads_text_on_colour_and_on_buttons():
    px = run()["px"]
    # [stroke, block, page]: text must come out black (0), its background and the page white (255).
    for k, v in px.items():
        assert v == [0, 255, 255], (k, v)
