"""Cycle 2, R1: the fare is read only from the card's fare zone.

Texts are my own invented examples (synthetic), not QA's probe cases.
Fields are (fare, pickup_min, pickup_miles, trip_min, trip_miles).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from fairfare import parse_offer_text  # noqa: E402

LEGS = "5 mins (1.6 mi) away\n17 mins (6.8 mi) trip"


def fields(o):
    return (o.fare, o.pickup_min, o.pickup_miles, o.trip_min, o.trip_miles)


def test_amount_above_the_label_is_never_the_fare():
    # Fare line lost by OCR; whatever the pill says, in any language, it is not read.
    for pill in ("Diamond tier", "Ein Satz ohne Listenwort", "متصل الآن", "В сети", "Paid in", "🚗 on a roll"):
        o = parse_offer_text(f"10:00 4G 70%\n£44.10\n{pill}\nUberX\n4.9 ★\n" + LEGS)
        assert fields(o) == (None, 5, 1.6, 17, 6.8), pill
        assert "fare_missing" in o.warnings


def test_amount_above_the_label_is_not_a_conflict():
    o = parse_offer_text("£44.10\nDiamond tier\nUberX\n£12.10\n4.9 ★\n" + LEGS + "\nAccept")
    assert o.fare == 12.10


def test_fare_on_the_label_line_and_on_the_accept_line():
    assert parse_offer_text("£60.00\nUberX £12.10\n" + LEGS).fare == 12.10
    assert parse_offer_text("£60.00\nComfort\n4.9 ★\n" + LEGS + "\nAccept £12.10").fare == 12.10
    assert parse_offer_text("Comfort\n£12.10\n" + LEGS + "\nAccept £12.10").fare == 12.10  # same amount twice


def test_two_amounts_in_the_zone_or_zone_and_accept_differ_refuse():
    o = parse_offer_text("UberX\n£12.10\n£12.90\n" + LEGS)
    assert o.fare is None and "fare_ambiguous" in o.warnings
    o = parse_offer_text("UberX\n£12.10\n" + LEGS + "\nAccept £13.00")
    assert o.fare is None and "fare_ambiguous" in o.warnings


def test_amount_below_the_accept_line_is_outside_the_card():
    o = parse_offer_text("UberX\n£12.10\n" + LEGS + "\nAccept\n£3.00\nRecent tip")
    assert o.fare == 12.10


def test_second_offer_cut_off_below_keeps_the_fare_refusal():
    o = parse_offer_text("UberX\n£12.10\n" + LEGS + "\n£25.40\nComfort")
    assert fields(o) == (None, 5, 1.6, 17, 6.8) and "fare_ambiguous" in o.warnings
    o = parse_offer_text("UberX\n£12.10\n" + LEGS + "\nUberXL")  # second card's label only
    assert o.fare is None


def test_badge_only_line_is_not_the_anchor():
    o = parse_offer_text("£50.00\nGold\nUberX\n£12.10\nExclusive\n4.9 ★\n" + LEGS)
    assert o.fare == 12.10
    # Badge only, no ride type: no label, so the no-label rules read it; a badge is card text.
    assert parse_offer_text("£14.00\nPriority\n4.9 ★\n" + LEGS).fare == 14.00


def test_garbled_fare_in_the_zone_is_unreadable():
    o = parse_offer_text("£50.00\nOnline\nUberX\nE12.10\n" + LEGS)
    assert o.fare is None and "fare_unreadable" in o.warnings


def test_no_label_window_stops_at_status_bar_notification_or_words():
    for stop in ("14:21 4G 58%", "Lloyds · now", "Nearly there", "87%"):
        o = parse_offer_text(f"£31.50\n{stop}\n4.9 ★\n" + LEGS)
        assert fields(o) == (None, 5, 1.6, 17, 6.8), stop
    # Readable cards with no label still read.
    assert parse_offer_text("14:21 4G 58%\n£12.10\n4.9 ★\n" + LEGS).fare == 12.10
    assert parse_offer_text("£31.50\nNearly there\n£12.10\n4.9 ★\n" + LEGS).fare == 12.10
    assert parse_offer_text("09:00 5G 80%\n4.9 ★\n" + LEGS + "\nAccept £12.10").fare == 12.10


def test_label_list_variants():
    for label in ("Comfort Electric", "Uber X Share", "Uber Pet", "UberX · Exclusive", "WAV", "Taxi", "Exec"):
        o = parse_offer_text(f"£50.00\nPro status\n{label}\n£12.10\n" + LEGS)
        assert o.fare == 12.10, label
