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
    assert o.fare is None and "fare_unreadable" in o.warnings


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


# ---- Cycle 1, attempt 2: QA red-team findings (reports/cycle-1/qa.md) ----

def test_h1_fare_with_lost_decimal_point_is_refused():
    # "£950" for £9.50 on 9 miles / 24 minutes: far above any UK private-hire fare.
    for bad in ("£950", "£850", "£999.00"):
        o = parse_offer_text(CARD.replace("£12.40", bad))
        assert o.fare is None and "fare_implausible" in o.warnings, bad
    # Real long and surged fares still pass.
    assert parse_offer_text("£48.60\n7 mins (2.4 mi) away\n1 hr 12 mins (52.3 mi) trip").fare == 48.60
    assert parse_offer_text(CARD.replace("£12.40", "£45.00")).fare == 45.00   # ~3.6x surge
    # Far too low for the distance (decimal shifted the other way): refused.
    assert parse_offer_text("£1.24\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip").fare is None


def test_h2_payment_or_message_line_never_stands_in_for_a_garbled_fare():
    o = parse_offer_text("13:10\nUberX\nMonzo · You spent £32.50 at Shell\nE11.10\n"
                         "5 mins (1.8 mi) away\n16 mins (6.6 mi) trip")
    assert o.fare is None and o.pickup_min == 5
    o = parse_offer_text("12:30\nMessages · Alex: that's £15 for the tickets\nUberX\nE8.45\n"
                         "2 mins (0.7 mi) away\n10 mins (3.4 mi) trip")
    assert o.fare is None
    # An amount mid-sentence is never a fare, even with no keyword.
    o = parse_offer_text("UberX\nSam: here is £20\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip")
    assert o.fare is None


def test_h2_fare_line_may_start_with_ride_type():
    assert parse_offer_text("UberX £12.40\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip").fare == 12.40


def test_h3_hours_and_minutes():
    for leg in ("1 hr 20 mins (25 mi) trip", "1 h 20 min (25 mi) trip", "1 hour 20 minutes (25 mi) trip"):
        o = parse_offer_text("UberX\n£40.00\n5 mins (1.5 mi) away\n" + leg)
        assert (o.trip_min, o.trip_miles) == (80, 25), leg
    o = parse_offer_text("UberX\n£60.00\n5 mins (1.5 mi) away\n2 hrs (90 mi) trip")
    assert o.trip_min == 120


def test_fare_range_uses_lower_end():
    o = parse_offer_text("UberX\n£10.80–£13.20\n5 mins (1.6 mi) away\n15 mins (6.0 mi) trip")
    assert o.fare == 10.80 and "fare_range_low_end" in o.warnings


def test_ocr_letters_in_leg_numbers():
    o = parse_offer_text("UberX\n£l2.40\n6 mins (l.8 mi) away\nl8 mins (7.2 mi) trip")
    assert fields(o) == (12.40, 6, 1.8, 18, 7.2)
    # Words next to units are left alone.
    assert parse_offer_text("Bristol 5 mins (1.0 mi) away\n£9.00").pickup_min == 5


def test_zero_minute_leg_with_miles_is_refused():
    o = parse_offer_text("UberX\n£21.00\n5 mins (2 mi) away\n0 mins (12 mi) trip")
    assert o.trip_min is None and o.trip_miles is None and "trip_speed_implausible" in o.warnings


def test_two_stacked_one_leg_offers_are_not_merged():
    o = parse_offer_text("08:01\n£7.20 · 3 min (1.0 mi)\n£21.40 · 12 min (6.0 mi)")
    assert fields(o) == (None,) * 5 and "multiple_offers" in o.warnings
    o = parse_offer_text("£8.00\n5 mins (1.2 mi) away\n£30.00\n25 mins (14 mi) trip")
    assert fields(o) == (None,) * 5


def test_non_ascii_digits_are_normalised():
    want = (12.40, 6, 1.8, 18, 7.2)
    assert fields(parse_offer_text("UberX\n£١٢.٤٠\n٦ mins (١.٨ mi) away\n١٨ mins (٧.٢ mi) trip")) == want
    assert fields(parse_offer_text("UberX\n£１２.４０\n６ mins (１.８ mi) away\n１８ mins (７.２ mi) trip")) == want


def test_rate_line_is_not_the_fare():
    o = parse_offer_text("UberX\n£14.20\n£1.14/mi · £0.62/min\n6 mins (2.1 mi) away\n17 mins (8.1 mi) trip")
    assert o.fare == 14.20


def test_unlabelled_navigation_outside_a_labelled_card_is_ignored():
    o = parse_offer_text("12 min · 5.1 mi\nTurn left\nUberX\n£13.60\n7 mins (2.4 mi) away\n21 mins (8.6 mi) trip")
    assert fields(o) == (13.60, 7, 2.4, 21, 8.6)
    # ...but an unlabelled leg between pickup and trip (multi-stop) is refused.
    o = parse_offer_text("£22.40\n6 mins (1.8 mi) away\n10 mins (3.2 mi) to stop\n12 mins (5 mi) trip")
    assert fields(o) == (None,) * 5


def test_large_paste_is_fast():
    import time
    big = ("£1.00 x\n" * 20000) + CARD
    t = time.time()
    parse_offer_text(big)
    assert time.time() - t < 2.0
