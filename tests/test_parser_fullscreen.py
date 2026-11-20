"""Regression tests for full-phone-screenshot parsing (cycle 1, R3).

Each test is one bug the cycle-1 fix closed. Text is invented (synthetic), with no
real rider names or addresses. Fields are (fare, pickup_min, pickup_miles, trip_min, trip_miles).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from fairfare import parse_offer_text  # noqa: E402

CARD = "UberX\n£12.40\n4.92 ★\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip\nAccept"


def fields(o):
    return (o.fare, o.pickup_min, o.pickup_miles, o.trip_min, o.trip_miles)


def test_promo_banner_above_card_is_not_the_fare():
    # Bug: first £ on screen was taken, so "£5.00 off" became the fare.
    o = parse_offer_text("14:05 4G 87%\n£5.00 off your next ride\n" + CARD)
    assert fields(o) == (12.40, 6, 1.8, 18, 7.2)


def test_labelled_earnings_balance_tip_and_bonus_lines_are_not_the_fare():
    for noise in ("Today £61.35", "This week £412.80", "Balance £230.40 · Cash out",
                  "You received a £1.50 tip", "Quest: 5 more trips for £15.00 bonus",
                  "Boost zone · £2.50 extra per trip", "Get £10 voucher with code RIDE10"):
        assert parse_offer_text("09:41 5G 64%\n" + noise + "\n" + CARD).fare == 12.40, noise


def test_unlabelled_earnings_pill_above_card_loses_to_the_card_fare():
    # Bug: a bare "£84.20" earnings pill at the top of the screen was taken as the fare.
    o = parse_offer_text("09:41 5G 64%\n£84.20\nYou're online\n" + CARD)
    assert o.fare == 12.40


def test_message_with_amount_above_card_loses_to_nearest_fare():
    o = parse_offer_text("12:30\nMessages · Alex: that's £15 for the tickets\n" + CARD)
    assert o.fare == 12.40


def test_garbled_card_fare_refuses_instead_of_taking_other_amount():
    # Card "£" read as "E"/"f": a promo or pill elsewhere must not stand in for it.
    o = parse_offer_text("14:05\n£5.00 off your next ride\nUberX\nE12.40\n4.92 ★\n"
                         "6 mins (1.8 mi) away\n18 mins (7.2 mi) trip")
    assert o.fare is None and o.pickup_min == 6 and o.trip_min == 18
    o = parse_offer_text("09:02\n£84.20\nYou're online\nUberX\nfl2.40\n4.92 ★\n"
                         "6 mins (1.8 mi) away\n18 mins (7.2 mi) trip")
    assert o.fare is None and "fare_not_near_legs" in o.warnings


def test_ocr_letter_o_for_zero_in_fare():
    # Bug: "£1O.80" parsed as £1.00 (in range, so it passed the sanity check).
    o = parse_offer_text(CARD.replace("£12.40", "£1O.80"))
    assert o.fare == 10.80


def test_fare_token_glued_to_letters_or_extra_decimals_is_not_trusted():
    assert parse_offer_text(CARD.replace("£12.40", "£12.40Accept")).fare is None
    assert parse_offer_text(CARD.replace("£12.40", "£12.405")).fare is None


def test_navigation_eta_is_not_a_leg():
    # Bug: "12 min · 4.0 mi · ETA 18:18" above an unlabelled card became the pickup leg.
    o = parse_offer_text("18:06\n12 min · 4.0 mi · ETA 18:18\nUberX · Exclusive\n£10.20\n"
                         "5 min · 1.7 mi\n16 min · 6.3 mi")
    assert fields(o) == (10.20, 5, 1.7, 16, 6.3)
    o = parse_offer_text(CARD + "\n14 min · 5.2 mi · arrive 18:02")
    assert fields(o) == (12.40, 6, 1.8, 18, 7.2)


def test_several_offers_on_screen_refuses_everything():
    # Bug: a Trip Radar list gave the first offer's numbers as if it were the only one.
    o = parse_offer_text("Trip Radar\n£7.40\n5 min (1.6 mi) away\n12 min (4.2 mi) trip\n"
                         "£11.90\n8 min (2.9 mi) away\n19 mins (7.8 mi) trip")
    assert fields(o) == (None,) * 5 and "multiple_offers" in o.warnings


def test_several_amounts_and_no_legs_refuses_fare():
    assert parse_offer_text("£12.40\n£9.80").fare is None
    assert parse_offer_text("£12.40\nUberX").fare == 12.40


def test_surge_still_read_and_not_taken_as_fare():
    o = parse_offer_text("19:02\nUberX\n£19.30\n5 mins (1.7 mi) away\n26 mins (11.9 mi) trip\n"
                         "+£3.20 surge included")
    assert o.fare == 19.30 and o.surge == 3.20


def test_includes_surge_line_between_fare_and_legs_is_skipped():
    o = parse_offer_text("UberX\n£12.40\nIncludes £2.10 surge\n4.9 ★\n6 mins (1.8 mi) away\n"
                         "18 mins (7.2 mi) trip")
    assert o.fare == 12.40
