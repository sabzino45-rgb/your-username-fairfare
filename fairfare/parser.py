"""Scan parser: turns OCR text from an offer screenshot into numeric offer fields.

Owned by the Scan Engineer agent.

Privacy by design: the parser extracts only numbers (fare, times, distances,
surge, rating). It never returns or stores the raw OCR text, so rider names
and addresses on the card do not leave this function. Images should be OCR'd
on-device and deleted immediately; this module only ever sees text.
"""

from __future__ import annotations

import bisect
import re
from dataclasses import dataclass, asdict, field

KM_PER_MILE = 1.609344

# Fields the verdict model needs. Missing ones lower confidence.
REQUIRED = ("fare", "pickup_min", "pickup_miles", "trip_min", "trip_miles")


@dataclass
class Offer:
    fare: float | None = None          # £ shown to the driver
    pickup_min: float | None = None
    pickup_miles: float | None = None
    trip_min: float | None = None
    trip_miles: float | None = None
    surge: float | None = None         # £ surge/boost included in fare, if shown
    rider_rating: float | None = None
    source: str = "scan"               # "scan" or "manual"
    warnings: list[str] = field(default_factory=list)

    @property
    def missing(self) -> list[str]:
        return [f for f in REQUIRED if getattr(self, f) is None]

    def to_dict(self) -> dict:
        d = asdict(self)
        d["missing"] = self.missing
        return d


# Every rule below is mirrored in app/js/engine.js; tests/test_js_parity.py checks they agree.
# All regexes are ASCII-only ([0-9], re.ASCII) so Python and JavaScript match the same text.

# Non-ASCII digits OCR may emit (Arabic-Indic, Extended Arabic-Indic, full-width) and
# full-width £ / full stop / Arabic decimal sign, mapped one-for-one (positions are kept).
_UNICODE_DIGITS = str.maketrans(
    {**{chr(base + i): str(i) for base in (0x660, 0x6F0, 0xFF10) for i in range(10)},
     "٫": ".", "．": ".", "￡": "£"}
)
_OCR_DIGITS = str.maketrans("OoIl", "0011")
# A number next to a time/distance unit, where OCR may read 1 as l/I and 0 as O/o ("l8 mins").
_LEG_NUM_TOKEN = re.compile(
    r"(^|[^A-Za-z0-9])([0-9OoIl]+(?:[.,][0-9OoIl]+)?)"
    r"(?=[ \t]*(?:[Mm]inutes?|[Mm]ins?|[Mm]iles?|[Mm]i|[Kk]m|[Hh]ours?|[Hh]rs?|[Hh])(?![A-Za-z]))"
)

_NUM = r"([0-9]+(?:[.,][0-9]+)?)"
# A £ amount. Inside it, l/I and O/o are read as 1 and 0 (it must contain a real digit).
# It must end at a non-alphanumeric character (and not mid-decimal), or it isn't trusted.
_FARE = re.compile(r"£\s?([0-9Il][0-9OoIl]*(?:[.,][0-9OoIl]{1,2})?)(?![A-Za-z0-9]|[.,][0-9OoIl])")
# Lines whose £ amount is not the offer fare: promos, earnings, balances, tips, bonuses,
# surge/boost lines, and payments/bank/shopping notifications.
_NOT_FARE = re.compile(
    r"\b(?:off|discount|promo|code|voucher|coupon|save|saved|earned|today|week|weekly|"
    r"balance|cash ?out|tips?|bonus|quest|reward|refer|cashback|credit|wallet|extra|"
    r"surge|boost|includes?|included|incl|"
    r"spent|spend|paid|pay|payment|received|bank|card|transfer|order|refund|bill)\b",
    re.I | re.ASCII,
)
# The fare is the prominent amount that starts its line. Only ride-type names (and
# punctuation) may come before it: "£12.40", "UberX £12.40", "~ £14.60".
_FARE_PREFIX_OK = re.compile(
    r"^(?:[^A-Za-z0-9]|\b(?:uber|uberx|comfort|exclusive|xl|exec|executive|green|pet|lux|"
    r"black|electric|priority|saver|wav|access|assist)\b)*$",
    re.I | re.ASCII,
)
_RATE_AFTER = re.compile(r"[ \t]*(?:/|per\b)", re.I | re.ASCII)            # "£1.14/mi", "£0.62 per min"
_RANGE_AFTER = re.compile(r"[ \t]*[-–—~][ \t]*£[ \t]?" + _NUM)    # "£10.80–£13.20"
# A card fare whose £ was misread as a letter ("E11.10", "fl2.40"): the card's own fare is unreadable.
_GARBLED_FARE_LINE = re.compile(
    r"^[^A-Za-z0-9£]*[A-Za-z]{1,2}[ \t]?[0-9OoIl]{1,3}[.,][0-9OoIl]{2}[^A-Za-z0-9£]*$", re.ASCII
)
# Lines whose min/distance pair is navigation, not an offer leg.
_NOT_LEG = re.compile(r"\b(?:arriv\w*|eta|remaining|destination|route|to go)\b", re.I | re.ASCII)
# The fare sits on the card just above the legs: at most this many lines above the first leg.
_FARE_WINDOW_LINES = 4
# Plausibility of a fare against the legs it was read with (UK private hire, generous):
# base £20 + £6/mile + £1/minute over pickup+trip is above any surge we know of (about 4x
# the ~£2.50 base, ~£1.25/mi, ~£0.20/min driver rates), plus tolls/airport fees.
# Below £0.25 per mile no UK offer pays. Outside these, a decimal point was probably lost.
_FARE_MAX_BASE, _FARE_MAX_PER_MILE, _FARE_MAX_PER_MIN, _FARE_MIN_PER_MILE = 20.0, 6.0, 1.0, 0.25
_SURGE = re.compile(r"\+\s?£\s?" + _NUM + r"[^\n]*?(?:surge|boost|included)", re.I | re.ASCII)
# "6 mins (1.8 mi) away" / "6 min (2.9 km) away" / "Pickup: 6 min · 1.8 mi" / "1 hr 20 mins (25 mi) trip"
_LEG = re.compile(
    # [ \t] not \s: a label must be on the same line, or "Trip" on the next line is stolen.
    r"(?:([0-9]+)[ \t]*(?:hours?|hrs?|h)\b[ \t]*(?:([0-9]+)[ \t]*(?:mins?|minutes?))?|"
    + _NUM + r"[ \t]*(?:mins?|minutes?))"
    r"[ \t]*[(\[·•,-]?[ \t]*" + _NUM + r"[ \t]*(mi|miles?|km)\b\)?[ \t]*(away|trip|pickup)?",
    re.I | re.ASCII,
)
_RATING = re.compile(_NUM + r"\s*[★*]")


def _f(s: str) -> float:
    return float(s.replace(",", "."))


class _Lines:
    """Line number / line text for a position, in O(log n) (large pastes stay fast)."""

    def __init__(self, text: str):
        self.text = text
        self.starts = [0] + [i + 1 for i, ch in enumerate(text) if ch == "\n"]

    def no(self, pos: int) -> int:
        return bisect.bisect_right(self.starts, pos) - 1

    def line(self, n: int) -> str:
        end = self.starts[n + 1] - 1 if n + 1 < len(self.starts) else len(self.text)
        return self.text[self.starts[n]:end]


def _miles(value: float, unit: str) -> float:
    return value / KM_PER_MILE if unit.lower().startswith("km") else value


def _fix_leg_token(m: re.Match) -> str:
    tok = m.group(2)
    if not re.search(r"[0-9]", tok):
        return m.group(0)
    return m.group(1) + tok.translate(_OCR_DIGITS)


def _refuse_all(offer: Offer, why: str) -> Offer:
    offer.fare = offer.surge = None
    offer.warnings += [why, "needs_manual_entry"]
    return offer


def parse_offer_text(text: str) -> Offer:
    """Parse OCR text of a single offer card. Never raises; returns what it found."""
    offer = Offer()
    if not text or not text.strip():
        offer.warnings.append("empty_text")
        return offer

    # Same length in and out, so positions stay valid.
    text = text.translate(_UNICODE_DIGITS)
    text = _LEG_NUM_TOKEN.sub(_fix_leg_token, text)
    lines = _Lines(text)

    surge_m = _SURGE.search(text)
    if surge_m:
        offer.surge = _f(surge_m.group(1))

    legs = []  # (label, minutes, miles, position)
    for m in _LEG.finditer(text):
        if _NOT_LEG.search(lines.line(lines.no(m.start()))):
            continue  # navigation bar ("14 min · 5.2 mi · arrive 18:02"), not an offer leg
        if m.group(1) is not None:
            minutes = int(m.group(1)) * 60 + (int(m.group(2)) if m.group(2) is not None else 0)
        else:
            minutes = _f(m.group(3))
        dist, unit, label = _f(m.group(4)), m.group(5), (m.group(6) or "").lower()
        # Look just before the match too, for layouts like "Pickup: 6 min · 1.8 mi"
        before = text[max(0, m.start() - 12):m.start()].lower()
        if not label:
            label = "pickup" if "pickup" in before else "trip" if "trip" in before else ""
        legs.append((label, float(minutes), _miles(dist, unit), m.start()))

    pickups = [l for l in legs if l[0] in ("away", "pickup")]
    trips = [l for l in legs if l[0] == "trip"]
    unlabeled = [l for l in legs if l[0] == ""]
    if len(pickups) > 1 or len(trips) > 1:
        return _refuse_all(offer, "multiple_offers")
    if pickups and trips:
        lo, hi = sorted((pickups[0][3], trips[0][3]))
        if any(lo < l[3] < hi for l in unlabeled):
            return _refuse_all(offer, "extra_leg")  # e.g. a multi-stop trip: the leg sum is unclear
        if unlabeled:
            offer.warnings.append("unlabelled_leg_ignored")  # outside the card (navigation, etc.)
        unlabeled = []
        used = [pickups[0], trips[0]]
    elif len(legs) > 2:
        # Several offers on one screen (e.g. a Trip Radar list): can't tell which one is meant.
        return _refuse_all(offer, "multiple_offers")
    else:
        used = legs

    # Fare candidates: prominent £ amounts that start their line, not surge, rate, promo or notification.
    fares = []  # (position, line number, value)
    for m in _FARE.finditer(text):
        if surge_m and surge_m.start() <= m.start() < surge_m.end():
            continue
        if not re.search(r"[0-9]", m.group(1)):
            continue
        n = lines.no(m.start())
        line = lines.line(n)
        if _NOT_FARE.search(line) or not _FARE_PREFIX_OK.match(line[: m.start() - lines.starts[n]]):
            continue
        if _RATE_AFTER.match(text, m.end()):
            continue
        value = _f(m.group(1).translate(_OCR_DIGITS))
        rng = _RANGE_AFTER.match(text, m.end())
        if rng:
            # A fare range: use the lower end, the amount the offer guarantees.
            value = min(value, _f(rng.group(1)))
            offer.warnings.append("fare_range_low_end")
        fares.append((m.start(), n, value))

    if used:
        first, last = min(l[3] for l in used), max(l[3] for l in used)
        if any(first < c[0] < last for c in fares):
            return _refuse_all(offer, "multiple_offers")  # a second fare between the legs: stacked offers
        anchor_line = lines.no(first)
        near = [c for c in fares if c[0] < first and anchor_line - c[1] <= _FARE_WINDOW_LINES]
        start_line = near[-1][1] + 1 if near else max(0, anchor_line - _FARE_WINDOW_LINES)
        garbled = any(_GARBLED_FARE_LINE.match(lines.line(n)) and re.search(r"[0-9]", lines.line(n))
                      for n in range(start_line, anchor_line))
        if garbled:
            offer.warnings.append("fare_unreadable")  # the card's own fare line is misread: don't substitute
        elif near:
            offer.fare = near[-1][2]
        elif fares:
            offer.warnings.append("fare_not_near_legs")
    elif fares:
        if len({c[2] for c in fares}) == 1:
            offer.fare = fares[0][2]
        else:
            offer.warnings.append("fare_ambiguous")

    pickup = pickups[0] if pickups else None
    trip = trips[0] if trips else None
    # Unlabeled legs: Uber shows pickup first, then trip.
    if pickup is None and unlabeled:
        pickup = unlabeled.pop(0)
        offer.warnings.append("pickup_inferred_from_order")
    if trip is None and unlabeled:
        trip = unlabeled.pop(0)
        offer.warnings.append("trip_inferred_from_order")

    if pickup:
        offer.pickup_min, offer.pickup_miles = pickup[1], round(pickup[2], 2)
    if trip:
        offer.trip_min, offer.trip_miles = trip[1], round(trip[2], 2)

    r = _RATING.search(text)
    if r and 1.0 <= _f(r.group(1)) <= 5.0:
        offer.rider_rating = _f(r.group(1))

    # Sanity checks: implausible values are dropped, not guessed.
    if offer.fare is not None and not (1 <= offer.fare <= 1000):
        offer.warnings.append("fare_out_of_range")
        offer.fare = None
    for leg in ("pickup", "trip"):
        mins, miles = getattr(offer, f"{leg}_min"), getattr(offer, f"{leg}_miles")
        if mins is not None and miles is not None and (
                (mins <= 0 and miles > 0) or (mins > 0 and miles / (mins / 60) > 90)):
            offer.warnings.append(f"{leg}_speed_implausible")
            setattr(offer, f"{leg}_min", None)
            setattr(offer, f"{leg}_miles", None)
    known_miles = sum(x for x in (offer.pickup_miles, offer.trip_miles) if x is not None)
    known_mins = sum(x for x in (offer.pickup_min, offer.trip_min) if x is not None)
    if offer.fare is not None and known_miles > 0:
        top = _FARE_MAX_BASE + _FARE_MAX_PER_MILE * known_miles + _FARE_MAX_PER_MIN * known_mins
        if offer.fare > top or offer.fare < _FARE_MIN_PER_MILE * known_miles:
            offer.warnings.append("fare_implausible")  # e.g. "£950" for £9.50: decimal point lost
            offer.fare = None

    if offer.missing:
        offer.warnings.append("needs_manual_entry")
    return offer


def manual_offer(fare: float, pickup_min: float, pickup_miles: float,
                 trip_min: float, trip_miles: float, surge: float | None = None) -> Offer:
    """Manual-entry fallback when the scan fails or the layout changes."""
    return Offer(fare=fare, pickup_min=pickup_min, pickup_miles=pickup_miles,
                 trip_min=trip_min, trip_miles=trip_miles, surge=surge, source="manual")
