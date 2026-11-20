"""Scan parser: turns OCR text from an offer screenshot into numeric offer fields.

Owned by the Scan Engineer agent.

Privacy by design: the parser extracts only numbers (fare, times, distances,
surge, rating). It never returns or stores the raw OCR text, so rider names
and addresses on the card do not leave this function. Images should be OCR'd
on-device and deleted immediately; this module only ever sees text.
"""

from __future__ import annotations

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


_NUM = r"(\d+(?:[.,]\d+)?)"
# A £ amount. OCR (dark mode especially) reads 0 as O/o and 1 as l/I inside the
# number, so those are allowed after the first digit and mapped back. The amount
# must end at a non-alphanumeric character (and not mid-decimal), or it is not trusted at all.
_FARE = re.compile(r"£\s?([0-9][0-9OoIl]*(?:[.,][0-9OoIl]{1,2})?)(?![A-Za-z0-9]|[.,][0-9OoIl])")
_OCR_DIGITS = str.maketrans("OoIl", "0011")
# Lines whose £ amount is not the offer fare: promos, earnings totals, balances,
# tips, bonuses, and surge/boost lines (the surge is part of the fare, not the fare).
_NOT_FARE = re.compile(
    r"\b(?:off|discount|promo|code|voucher|coupon|save|saved|earned|today|week|weekly|"
    r"balance|cash ?out|tips?|bonus|quest|reward|refer|cashback|credit|wallet|extra|"
    r"surge|boost|includes?|included|incl)\b",
    re.I | re.ASCII,  # ASCII \b, as in the JS port
)
# Lines whose min/distance pair is navigation, not an offer leg.
_NOT_LEG = re.compile(r"\b(?:arriv\w*|eta|remaining|destination|route|to go)\b", re.I | re.ASCII)
# The fare sits on the card just above the legs: at most this many lines above the first leg.
_FARE_WINDOW_LINES = 4
_SURGE = re.compile(r"\+\s?£\s?" + _NUM + r"[^\n]*?(?:surge|boost|included)", re.I)
# "6 mins (1.8 mi) away" / "6 min (2.9 km) away" / "Pickup: 6 min · 1.8 mi"
_LEG = re.compile(
    # [ \t] not \s: a label must be on the same line, or "Trip" on the next line is stolen.
    _NUM + r"[ \t]*(?:mins?|minutes?)[ \t]*[(\[·•,-]?[ \t]*" + _NUM + r"[ \t]*(mi|miles?|km)\b\)?[ \t]*(away|trip|pickup)?",
    re.I,
)
_RATING = re.compile(_NUM + r"\s*[★*]")


def _f(s: str) -> float:
    return float(s.replace(",", "."))


def _line_at(text: str, pos: int) -> tuple[int, str]:
    """Line number and full line containing position pos."""
    start = text.rfind("\n", 0, pos) + 1
    end = text.find("\n", pos)
    return text.count("\n", 0, pos), text[start:] if end == -1 else text[start:end]


def _miles(value: float, unit: str) -> float:
    return value / KM_PER_MILE if unit.lower().startswith("km") else value


def parse_offer_text(text: str) -> Offer:
    """Parse OCR text of a single offer card. Never raises; returns what it found."""
    offer = Offer()
    if not text or not text.strip():
        offer.warnings.append("empty_text")
        return offer

    surge_m = _SURGE.search(text)
    if surge_m:
        offer.surge = _f(surge_m.group(1))

    legs = []
    for m in _LEG.finditer(text):
        if _NOT_LEG.search(_line_at(text, m.start())[1]):
            continue  # navigation bar ("14 min · 5.2 mi · arrive 18:02"), not an offer leg
        minutes, dist, unit, label = _f(m.group(1)), _f(m.group(2)), m.group(3), (m.group(4) or "").lower()
        # Look just before the match too, for layouts like "Pickup: 6 min · 1.8 mi"
        before = text[max(0, m.start() - 12):m.start()].lower()
        if not label:
            label = "pickup" if "pickup" in before else "trip" if "trip" in before else ""
        legs.append((label, minutes, _miles(dist, unit), m.start()))

    if len(legs) > 2:
        # Several offers on one screen (e.g. a Trip Radar list): can't tell which one is meant.
        offer.surge = None
        offer.warnings.append("multiple_offers")
        offer.warnings.append("needs_manual_entry")
        return offer

    # Fare candidates: £ amounts that are not the surge line and not on a promo/earnings/tip line.
    fares = []
    for m in _FARE.finditer(text):
        if surge_m and surge_m.start() <= m.start() < surge_m.end():
            continue
        line_no, line = _line_at(text, m.start())
        if _NOT_FARE.search(line):
            continue
        fares.append((m.start(), line_no, _f(m.group(1).translate(_OCR_DIGITS))))

    if legs:
        # The fare is the nearest candidate above the first leg, within the card.
        anchor = min(l[3] for l in legs)
        anchor_line = _line_at(text, anchor)[0]
        near = [c for c in fares if c[0] < anchor and anchor_line - c[1] <= _FARE_WINDOW_LINES]
        if near:
            offer.fare = near[-1][2]
        elif fares:
            offer.warnings.append("fare_not_near_legs")
    elif fares:
        values = {c[2] for c in fares}
        if len(values) == 1:
            offer.fare = fares[0][2]
        else:
            offer.warnings.append("fare_ambiguous")

    pickup = next((l for l in legs if l[0] in ("away", "pickup")), None)
    trip = next((l for l in legs if l[0] == "trip"), None)
    unlabeled = [l for l in legs if l[0] == ""]
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
        if mins is not None and miles is not None and mins > 0 and miles / (mins / 60) > 90:
            offer.warnings.append(f"{leg}_speed_implausible")
            setattr(offer, f"{leg}_min", None)
            setattr(offer, f"{leg}_miles", None)

    if offer.missing:
        offer.warnings.append("needs_manual_entry")
    return offer


def manual_offer(fare: float, pickup_min: float, pickup_miles: float,
                 trip_min: float, trip_miles: float, surge: float | None = None) -> Offer:
    """Manual-entry fallback when the scan fails or the layout changes."""
    return Offer(fare=fare, pickup_min=pickup_min, pickup_miles=pickup_miles,
                 trip_min=trip_min, trip_miles=trip_miles, surge=surge, source="manual")
