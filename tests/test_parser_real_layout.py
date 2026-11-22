"""Cycle 3: the real Uber UK offer card layout (structure of pilot-0001, re-valued; no pilot text or numbers).

Rules R1.1-R1.7 in spec.md, the safety cases, the real-pay plausibility check, and Python/JS parity on every text.
"""
import json
import os
import shutil
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from fairfare import parse_offer_text  # noqa: E402
from fairfare.parser import _anchor_label_line  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
ENGINE = "file://" + os.path.abspath(os.path.join(ROOT, "app", "js", "engine.js"))


def real_card(top=("13:47 4G 52%", "0204+", "3°", "Morrisons", "B3227"), label="ae UberX", junk="Ee ~",
              fare="£21.85 ⚡", chip="% 4.00 After fees", subs=("£2.11 est. holiday entitlement included",),
              leg1="14 min (5.9 mi)", leg2="23 mins (9.3 mi)", connector="|", button=None, extra=()):
    lines = list(top) + [label] + ([junk] if junk else []) + ([fare] if fare else []) + ([chip] if chip else [])
    lines += list(subs) + [leg1, "[ADDRESS]", connector] + list(extra) + [leg2, "[ADDRESS]"] + ([button] if button else [])
    return "\n\n".join(lines) + "\n"


def fields(o):
    return (o.fare, o.pickup_min, o.pickup_miles, o.trip_min, o.trip_miles)


# At least 3 re-valued copies of the real card: different fare, sub-amounts, legs, labels and junk lines.
VARIANTS = [
    (real_card(), (21.85, 14, 5.9, 23, 9.3)),
    (real_card(top=("8:02 .ul 3G", "Co-op", "A361"), label="© Comfort", junk="a —", fare="£12.70 4",
               chip="After fees", subs=("£1.23 est. holiday entitlement included", "£1.00 tip included"),
               leg1="4 min (1.2 mi)", leg2="11 mins (3.9 mi)", button="Match"), (12.70, 4, 1.2, 11, 3.9)),
    (real_card(top=(), label="UberX Priority", junk=None, fare="£47.35 %", chip="& 6.00 After fees",
               subs=("£3.60 tolls included",), leg1="9 min (4.1 mi)", leg2="38 mins (26.2 mi)", connector="•",
               button="Accept"), (47.35, 9, 4.1, 38, 26.2)),
    (real_card(label="oa a Uber Green", junk="Il", fare="£16.05", chip=None,
               subs=("£1.00 Clean Air Zone fee included",), leg1="7 min (4.8 km)", leg2="19 mins (12.9 km)",
               button="Match £16.05"), (16.05, 7, 2.98, 19, 8.02)),
]


@pytest.mark.parametrize("text,want", VARIANTS)
def test_real_layout_variants_read_all_five_fields(text, want):
    o = parse_offer_text(text)
    assert fields(o) == want, o.warnings
    assert not o.missing


def test_sub_amounts_are_never_rivals_or_candidates():
    # R1.1: captioned sub-amounts never give fare_ambiguous ...
    o = parse_offer_text(real_card(subs=("£2.11 est. holiday entitlement included", "£1.50 tip included",
                                         "£2.00 tolls included", "£0.80 booking fee included")))
    assert o.fare == 21.85 and "fare_ambiguous" not in o.warnings
    # ... and are never the fare: fare line lost, only a captioned sub-amount left -> None.
    o = parse_offer_text(real_card(fare=None))
    assert o.fare is None and "fare_missing" in o.warnings
    o = parse_offer_text(real_card(fare=None, chip=None, subs=("£3.00 surcharge included",)))
    assert o.fare is None


def test_uncaptioned_second_amount_in_the_zone_still_refuses():
    # The owner's unaccepted risk must not widen: an uncaptioned amount next to the fare is a rival.
    o = parse_offer_text(real_card(subs=("£21.00", "£2.11 est. holiday entitlement included")))
    assert o.fare is None and "fare_ambiguous" in o.warnings
    # Fare misread (E for £) with an uncaptioned amount left in the zone: the misread line wins, None.
    o = parse_offer_text(real_card(fare="E21.85 4", subs=("£45.00",)))
    assert o.fare is None and "fare_unreadable" in o.warnings


def test_sub_amount_not_smaller_than_the_fare_refuses():
    o = parse_offer_text(real_card(fare="£2.40", subs=("£3.10 tolls included",)))
    assert o.fare is None and "sub_amount_not_smaller" in o.warnings
    o = parse_offer_text(real_card(fare="£2.11", subs=("£2.11 est. holiday entitlement included",)))
    assert o.fare is None
    # Same check without a label (pasted text, label lost).
    o = parse_offer_text(real_card(label="Morrisons", fare="£1.80", subs=("£2.30 est. holiday entitlement included",)))
    assert o.fare is None


def test_after_fees_chip_is_flagged_not_a_fare_and_no_surge_invented():
    o = parse_offer_text(real_card())
    assert "fare_after_fees" in o.warnings and o.surge is None and o.fare == 21.85
    o = parse_offer_text(real_card(chip=None))
    assert "fare_after_fees" not in o.warnings and o.fare == 21.85
    # With no label (OCR lost it), the chip and the sub-amount are still card text: the fare is read.
    o = parse_offer_text(real_card(top=(), label="", junk=None))
    assert o.fare == 21.85


def test_match_counts_like_accept():
    assert parse_offer_text(real_card(button="Match £21.85")).fare == 21.85
    o = parse_offer_text(real_card(button="Match £30.00"))  # a different amount on the button
    assert o.fare is None and "fare_ambiguous" in o.warnings
    # Fare lost, amount on the Match button below the legs: the button's amount is the fare (as with Accept).
    assert parse_offer_text(real_card(fare=None, button="Match £21.85")).fare == 21.85
    # A Match amount inside the zone is not a fare (as with Accept).
    assert parse_offer_text("Comfort\nMatch £22.10\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip").fare is None


def test_label_junk_tokens():
    for label in ("ue UberX", "4 XL", "© UberX Priority", "a b Comfort", "UberX Priority", "ae Uber X"):
        assert parse_offer_text(real_card(label=label)).fare == 21.85, label
    # Ordinary words or more than 2 junk tokens: not a label (the no-label rules apply, cut at that line).
    for label in ("Your next UberX", "ab cd ef UberX", "Ee —", "to the UberX"):
        assert not _anchor_label_line(label), label
    o = parse_offer_text("£50.00\nYour next UberX\n£12.00\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip")
    assert o.fare == 12.00  # the stray amount above the words line is cut off, as in cycle 2
    # Short junk lines between label and fare don't count; a real short word still does.
    o = parse_offer_text("UberX\nEe —\na ~\n£12.00\nKeep going\nNice work\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip")
    assert o.fare == 12.00
    o = parse_offer_text("Black\nGoal\n£64.00\nKeep going\nNice work\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip")
    assert o.fare is None and "fare_label_too_far" in o.warnings


def test_bare_legs_with_address_and_connector_lines():
    o = parse_offer_text(real_card(connector="·"))
    assert fields(o)[1:] == (14, 5.9, 23, 9.3)
    # A third leg-like line: can't tell which legs are this offer's.
    o = parse_offer_text(real_card(extra=("6 min (1.4 mi)", "[ADDRESS]", "|")))
    assert o.fare is None and o.pickup_min is None and o.trip_min is None and "multiple_offers" in o.warnings
    # One bare leg: the missing leg is a refusal.
    o = parse_offer_text("UberX\n£12.00\n14 min (5.9 mi)\n[ADDRESS]\n")
    assert o.pickup_min == 14 and o.trip_min is None and o.missing == ["trip_min", "trip_miles"]


def test_surge_icon_after_the_fare():
    for fare in ("£21.85 ⚡", "£21.85 %", "£21.85 4", "£21.85 4 ⚡"):
        assert parse_offer_text(real_card(fare=fare)).fare == 21.85, fare
    # Only after a clean £d.dd: a garbled amount with an icon is still not read.
    for fare in ("£21 4", "£2l.85 4 x y", "£21.85 44"):
        assert parse_offer_text(real_card(fare=fare)).fare is None, fare


def test_real_pay_shaped_fares_are_not_refused_as_implausible():
    """R1.7: real completed trips pay about £1.5-£10 per trip mile (short minimum-fare trips the high end), trips of
    about 1-24 miles. Aggregate ranges only. Every fare in that range, with or without a pickup leg, is kept.
    Fares are floored at £4 (no real trip pays less than a minimum fare; the owner's lowest fee is above £5)."""
    refused = []
    for trip in (1, 1.5, 2, 3, 5, 8, 12, 16, 20, 24):
        for rate in (1.5, 2, 3, 5, 7.5, 10):
            for pickup in (None, 0.3, 2, 5, 10):
                for mph in (12, 25, 40):
                    fare = max(4.0, rate * trip)
                    legs = (f"{max(1, round(pickup / mph * 60))} mins ({pickup} mi) away\n" if pickup else "")
                    legs += f"{max(1, round(trip / mph * 60))} mins ({trip} mi) trip"
                    o = parse_offer_text(f"UberX\n£{fare:.2f}\n{legs}")
                    if o.fare is None:
                        refused.append((trip, rate, pickup, mph, o.warnings))
    assert not refused, refused[:5]
    # A lost decimal point is still refused.
    o = parse_offer_text("UberX\n£850\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip")
    assert o.fare is None and "fare_implausible" in o.warnings


TEXTS = [t for t, _ in VARIANTS] + [
    real_card(fare=None), real_card(subs=("£21.00",)), real_card(fare="E21.85 4", subs=("£45.00",)),
    real_card(fare="£2.40", subs=("£3.10 tolls included",)), real_card(button="Match £30.00"),
    real_card(fare=None, button="Match £21.85"), real_card(top=(), label="", junk=None),
    real_card(label="Morrisons", fare="£1.80", subs=("£2.30 est. holiday entitlement included",)),
    real_card(extra=("6 min (1.4 mi)", "[ADDRESS]", "|")), real_card(fare="£21.85 4 ⚡"), real_card(fare="£21.85 44"),
    "UberX\nEe —\na ~\n£12.00\nKeep going\nNice work\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip",
    "£50.00\nab cd ef UberX\n£12.00\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip",
]

JS = """
import { parseOfferText, cardMarkerFound, fareFromWords } from '%s';
const texts = JSON.parse(process.argv[1]);
const words = JSON.parse(process.argv[2]);
console.log(JSON.stringify({
  parsed: texts.map((t) => { const o = parseOfferText(t); return [[o.fare, o.pickup_min, o.pickup_miles, o.trip_min, o.trip_miles], o.warnings]; }),
  marker: texts.map((t) => cardMarkerFound(t)),
  geo: words.map((ws) => fareFromWords(ws.map(([text, height]) => ({ text, height, prev: '' })))),
}));
"""

# Word boxes as Tesseract measures them on a drawn real-layout card (heights in px; scan.md attempt 3 ratios).
BODY = [("ae", 22), ("UberX", 30), ("%", 22), ("4.00", 22), ("After", 22), ("fees", 22), ("£2.11", 21), ("est.", 21),
        ("holiday", 21), ("entitlement", 21), ("included", 21), ("14", 24), ("min", 24), ("(5.9", 26), ("mi)", 26),
        ("23", 24), ("mins", 24), ("(9.3", 26), ("mi)", 26)]
WORDS = [
    [("£21.85", 52)] + BODY,                    # the real layout: fare far taller than the chip and the sub-amount
    [("£21.85", 52), ("£21.00", 50)] + BODY,    # an uncaptioned amount drawn as big as the fare: refuse
    BODY,                                       # fare lost: the sub-amount is not 1.5x the median
]


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_js_matches_python_and_screen_path_on_real_layout():
    r = subprocess.run(["node", "--input-type=module", "-e", JS % ENGINE, json.dumps(TEXTS), json.dumps(WORDS)],
                       capture_output=True, text=True, check=True)
    out = json.loads(r.stdout)
    for t, (js_fields, js_warn) in zip(TEXTS, out["parsed"]):
        o = parse_offer_text(t)
        assert js_fields == list(fields(o)), t
        assert js_warn == o.warnings, t
    # Label with junk, or a Match button: the screenshot card-marker rule finds the card.
    assert out["marker"][0] and out["marker"][1]
    assert out["geo"] == [21.85, None, None]
