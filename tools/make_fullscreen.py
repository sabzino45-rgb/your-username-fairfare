"""Write SYNTHETIC full-phone-screenshot cases (R3, cycle 1) for eval_set/.

A shared screenshot is the whole phone screen: status bar, notifications,
promo banners, earnings totals, navigation, toasts. These hand-written cases
put an offer card inside that noise. They are synthetic (invented layouts,
no real riders, no real addresses) and prove nothing about real Uber
screenshots; they only check the parser copes with the noise we imagined.

Expected fields are what a careful human reading the screen would take as the
offer's fare and legs. null means the card doesn't show it (or the screen is
ambiguous, e.g. several offers at once), so the parser should refuse.

No outcome is attached: these cases test scanning only, so they don't change
the verdict-error metrics.

Deterministic (no randomness). Usage:
  python tools/make_fullscreen.py > eval_set/synthetic_fullscreen.jsonl
"""

from __future__ import annotations

import json

N = None  # shorthand for "not on the card"

# (screen text, (fare, pickup_min, pickup_miles, trip_min, trip_miles), note)
CASES = [
    # 001: the spec probe. Promo banner above the card.
    ("14:05 ▾ 4G 87%\nUber Eats · now\n£5.00 off your next order\nUberX\n£12.40\n4.92 ★\n"
     "6 mins (1.8 mi) away\n18 mins (7.2 mi) trip\nAccept",
     (12.40, 6, 1.8, 18, 7.2), "promo above card"),
    # 002: bare earnings pill at the top (no label), km card.
    ("09:41 5G 64%\n£84.20\nYou're online\nComfort\n£15.75\n4.88★\n"
     "4 min (2.6 km) away\n22 min (14.3 km) trip",
     (15.75, 4, 1.6, 22, 8.9), "unlabelled earnings pill"),
    # 003: labelled earnings so far + screenshot toast.
    ("21:17 ⚡ 52%\nToday £61.35\nUberX · Exclusive\n£9.80\n3 min · 1.1 mi\n11 min · 3.9 mi\n"
     "Screenshot saved",
     (9.80, 3, 1.1, 11, 3.9), "earnings today + toast"),
    # 004: Trip Radar list of three offers: which one? Refuse.
    ("13:22 4G 71%\nTrip Radar\n£7.40\n5 min (1.6 mi) away\n12 min (4.2 mi) trip\n"
     "£11.90\n8 min (2.9 mi) away\n19 mins (7.8 mi) trip\n"
     "£6.25\n3 min (0.9 mi) away\n9 min (2.8 mi) trip",
     (N, N, N, N, N), "trip radar, 3 offers"),
    # 005: on a trip, navigation around a queued request; nav ETA bar below.
    ("17:48 4G 33%\nTurn left onto Station Road\n0.3 mi\nNew request\n£13.60\n4.95 ★\n"
     "7 mins (2.4 mi) away\n21 mins (8.6 mi) trip\nAccept\n14 min · 5.2 mi · arrive 18:02",
     (13.60, 7, 2.4, 21, 8.6), "navigation ETA below card"),
    # 006: dark-mode OCR noise (stray bars, tildes, spaced £).
    ("| 22:03 ▯ 4G 18% ~\n. UberX\n£ 14.60\n~ 4.9l ★\n5 mins (1.9 mi) away |\n"
     "24 mins (11.2 mi) trip\n' Accept",
     (14.60, 5, 1.9, 24, 11.2), "dark mode noise"),
    # 007: dark mode, OCR reads 0 as O in the fare.
    ("23:11 4G 41%\nUberX\n£1O.80\n4.86 ★\n4 mins (1.5 mi) away\n15 mins (5.9 mi) trip\nAccept",
     (10.80, 4, 1.5, 15, 5.9), "O for 0 in fare"),
    # 008: heads-up message preview with an amount, above the card.
    ("12:30 4G 90%\nMessages · Alex: that's £15 for the tickets\nUberX\n£8.45\n4.81 ★\n"
     "2 mins (0.7 mi) away\n10 mins (3.4 mi) trip\nAccept",
     (8.45, 2, 0.7, 10, 3.4), "message preview above"),
    # 009: quest banner, Pickup:/Trip: layout.
    ("07:55 4G 100%\nQuest: 5 more trips for £15.00 bonus\n£11.20\nPickup: 6 min · 2.2 mi\n"
     "Trip: 17 min · 7.5 mi\n4.97 ★",
     (11.20, 6, 2.2, 17, 7.5), "quest bonus banner"),
    # 010: boost-zone banner without '+', plus a real surge line.
    ("19:02 4G 45%\nBoost zone · £2.50 extra per trip until 20:00\nUberX\n£19.30\n4.90 ★\n"
     "5 mins (1.7 mi) away\n26 mins (11.9 mi) trip\n+£3.20 surge included\nAccept",
     (19.30, 5, 1.7, 26, 11.9), "boost banner + surge"),
    # 011: weekly earnings, pickup in km and trip in miles.
    ("16:40 5G 58%\nThis week £412.80\nComfort\n£22.10\n4.85★\n6 min (3.1 km) away\n"
     "31 min (12.4 mi) trip",
     (22.10, 6, 1.9, 31, 12.4), "km/mi mix"),
    # 012: navigation ETA bar above an unlabelled card.
    ("18:06 4G 29%\n12 min · 4.0 mi · ETA 18:18\nContinue on A38\nUberX · Exclusive\n£10.20\n"
     "5 min · 1.7 mi\n16 min · 6.3 mi",
     (10.20, 5, 1.7, 16, 6.3), "navigation ETA above unlabelled card"),
    # 013: card cropped at the bottom (no trip leg), promo above.
    ("10:12 4G 77%\n£3.00 off Uber Eats today\nUberX\n£7.95\n4.93 ★\n3 mins (1.0 mi) away",
     (7.95, 3, 1.0, N, N), "cropped card, promo above"),
    # 014: Trip Radar with a single offer: readable.
    ("11:47 4G 66%\nTrip Radar\n1 trip nearby\n£9.15 · UberX\n4 min (1.3 mi) away\n"
     "13 min (4.6 mi) trip",
     (9.15, 4, 1.3, 13, 4.6), "trip radar, 1 offer"),
    # 015: Trip Radar with two unlabelled offers: refuse.
    ("08:20 4G 82%\nTrip Radar\n£12.05 UberX\n6 min · 2.0 mi\n20 min · 8.1 mi\n"
     "£8.70 UberX\n3 min · 1.2 mi\n12 min · 4.4 mi",
     (N, N, N, N, N), "trip radar, 2 offers"),
    # 016: calendar notification with minutes, tip notification, toast.
    ("20:20 4G 39%\nCalendar · Dentist in 15 min\nTips · You received a £1.50 tip\nUberX\n£16.05\n"
     "4.89 ★\n8 mins (3.0 mi) away\n19 mins (8.3 mi) trip\nAccept\nScreenshot saved",
     (16.05, 8, 3.0, 19, 8.3), "tip notification + minutes notification"),
    # 017: balance / cash-out banner, km card.
    ("15:03 4G 70%\nBalance £230.40 · Cash out\nUberX\n£11.35\n4.91 ★\n3 min (1.9 km) away\n"
     "17 min (9.7 km) trip",
     (11.35, 3, 1.2, 17, 6.0), "balance banner"),
    # 018: card fare unreadable (£ read as E) while a promo is readable: refuse fare.
    ("14:05 4G 87%\n£5.00 off your next ride\nUberX\nE12.40\n4.92 ★\n6 mins (1.8 mi) away\n"
     "18 mins (7.2 mi) trip",
     (N, 6, 1.8, 18, 7.2), "garbled card fare, readable promo"),
    # 019: message preview with an amount below the card.
    ("12:58 4G 55%\nUberX\n£8.90\n4.84 ★\n3 mins (1.2 mi) away\n12 mins (4.5 mi) trip\nAccept\n"
     "WhatsApp · Sam: owe you £20 for petrol",
     (8.90, 3, 1.2, 12, 4.5), "message preview below"),
    # 020: unlabelled earnings pill, card fare garbled (£ read as f): refuse fare.
    ("09:02 5G 61%\n£84.20\nYou're online\nUberX\nfl2.40\n4.92 ★\n6 mins (1.8 mi) away\n"
     "18 mins (7.2 mi) trip",
     (N, 6, 1.8, 18, 7.2), "garbled card fare, earnings pill far above"),
]

KEYS = ("fare", "pickup_min", "pickup_miles", "trip_min", "trip_miles")


def main() -> None:
    for i, (text, exp, note) in enumerate(CASES, 1):
        print(json.dumps({
            "id": f"syn-fs-{i:03d}",
            "origin": "synthetic",
            "kind": "fullscreen",
            "note": note,
            "ocr_text": text,
            "expected_fields": dict(zip(KEYS, exp)),
            "profile": {"cost_per_mile": 0.20},
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
