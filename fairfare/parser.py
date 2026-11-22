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
    r"spent|spend|paid|pay|payment|received|bank|card|transfer|order|refund|bill|"
    r"from|via|paypal|sent|earnings)\b",
    re.I | re.ASCII,
)
# A card's fare line holds the amount and nothing else that reads as words: only punctuation,
# ride-type names or the Accept button may stand before or after it ("£12.40", "UberX £12.40",
# "£9.15 · UberX", "Accept £10.20"); a leg may follow on the same line ("£7.20 · 3 min (1.0 mi)").
# Anything else ("£30 for the shopping", "£25.00 from Sam") is a message, banner or notification.
_FARE_WORDS = (r"(?:[^A-Za-z0-9]|\b(?:uber|uberx|uberxl|comfort|exclusive|xl|exec|executive|green|pet|"
               r"lux|black|electric|priority|saver|wav|access|assist|accept|match|x|share|taxi)\b)*")
_FARE_PREFIX_OK = re.compile("^" + _FARE_WORDS + "$", re.I | re.ASCII)
_FARE_TRAIL_OK = _FARE_PREFIX_OK
# Cycle 3: the card's button words, one shared list. Real UK cards say "Match" (pilot); older/other layouts "Accept".
# Wherever the rules use "the Accept line", any of these words counts.
_ACCEPT = re.compile(r"\b(?:accept|match)\b", re.I | re.ASCII)
# A status label next to a bare amount marks the earnings pill ("£84.20" / "You're online").
_PILL_LABEL = re.compile(r"\b(?:online|offline|finding trips|earnings|today|this week)\b", re.I | re.ASCII)
_RATE_AFTER = re.compile(r"[ \t]*(?:/|per\b)", re.I | re.ASCII)            # "£1.14/mi", "£0.62 per min"
_RANGE_AFTER = re.compile(r"[ \t]*[-–—~][ \t]*£[ \t]?" + _NUM)    # "£10.80–£13.20"
# A card fare whose £ was misread ("E11.10", "fl2.40", "€9.60", "$12.95") or dropped ("15.75"),
# alone on its line: the card's own fare is unreadable, so no other amount may stand in for it.
# Without any symbol, values up to 5 are left alone: that is a rider rating whose star was lost.
_GARBLED_FARE_LINE = re.compile(
    r"^[^A-Za-z0-9£€$]*([A-Za-z€$¥¢]{1,2})?[ \t]?([0-9OoIl]{1,3}[.,][0-9OoIl]{2})(?:[ \t]+[0-9])?[^A-Za-z0-9£]*$", re.ASCII
)
# Lines whose min/distance pair is navigation, not an offer leg.
_NOT_LEG = re.compile(r"\b(?:arriv\w*|eta|remaining|destination|route|to go)\b", re.I | re.ASCII)
# The fare sits on the card just above the legs: at most this many NON-BLANK lines above the
# first leg (OCR page-segmentation modes put blank lines between text lines).
_FARE_WINDOW_LINES = 4
# Plausibility of a fare against the legs it was read with (UK private hire, generous):
# base £20 + £6/mile + £1/minute over pickup+trip is above any surge we know of (about 4x
# the ~£2.50 base, ~£1.25/mi, ~£0.20/min driver rates), plus tolls/airport fees.
# Below £0.25 per mile no UK offer pays. Outside these, a decimal point was probably lost.
# Cycle 3: the owner's real completed trips pay about £1.5-£10 per trip mile (research/, aggregate only). £6/mile
# refused a £10/mile fare on trips over about 8 miles (tests/test_parser_real_layout.py), so the cap is now
# £10/mile; a lost decimal point (x100) is still far outside it.
_FARE_MAX_BASE, _FARE_MAX_PER_MILE, _FARE_MAX_PER_MIN, _FARE_MIN_PER_MILE = 20.0, 10.0, 1.0, 0.25
_SURGE = re.compile(r"\+\s?£\s?" + _NUM + r"[^\n]*?(?:surge|boost|included)", re.I | re.ASCII)
# "6 mins (1.8 mi) away" / "6 min (2.9 km) away" / "Pickup: 6 min · 1.8 mi" / "1 hr 20 mins (25 mi) trip"
_LEG = re.compile(
    # [ \t] not \s: a label must be on the same line, or "Trip" on the next line is stolen.
    # Hours: "1 hr 20 mins", "1h20min", "1h 20m", "1hr20", "2 hrs".
    r"(?:([0-9]+)[ \t]*(?:hours?|hrs?|h)(?![A-Za-z])[ \t]*(?:([0-9]+)[ \t]*(?:minutes?|mins?|m)?(?![A-Za-z]))?|"
    + _NUM + r"[ \t]*(?:mins?|minutes?))"
    r"[ \t]*[(\[·•,-]?[ \t]*" + _NUM + r"[ \t]*(mi|miles?|km)\b\)?[ \t]*(away|trip|pickup)?",
    re.I | re.ASCII,
)
_RATING = re.compile(_NUM + r"\s*[★*]")
# Cycle 2 fare zone. Ride-type names and badges that make up a product-label line ("UberX",
# "Comfort Electric", "UberX · Exclusive"). A guess at real layouts; the one shared list.
# Attempt 2: "Uber" may stand before any name, with or without a space or hyphen ("Uber X", "Uber-X",
# "Uber Comfort"), and "Uber" or "X" alone also count: a misread label must still close the zone.
_PRODUCT_CORE = (r"x[ \t]+share|comfort[ \t]+electric|xl|x|comfort|green|exec|executive|lux|black|pet|access|"
                 r"assist|wav|exclusive|priority|share|electric|taxi")
_PRODUCT_NAMES = r"uber[ \t-]*(?:" + _PRODUCT_CORE + r")|uber|" + _PRODUCT_CORE
# A product-label line: only names from that list, separators, and optionally the fare amount.
_PRODUCT_LABEL = re.compile(
    r"^(?:[^A-Za-z0-9£]|£[ \t]?[0-9OoIl]+(?:[.,][0-9OoIl]{1,2})?|\b(?:" + _PRODUCT_NAMES + r")\b)*$", re.I | re.ASCII)
# The anchor needs a ride-type name: a line of badges only ("Exclusive", "Priority") can sit
# below the fare ("£13.75" / "Exclusive" / legs), so it is card text but never the anchor.
_PRODUCT_BADGES = re.compile(r"\b(?:exclusive|priority)\b", re.I | re.ASCII)
_PRODUCT_WORD = re.compile(r"\b(?:" + _PRODUCT_NAMES + r")\b", re.I | re.ASCII)
# A label glued to the (unreadable) fare: "UberX9.80", "UberX12.40", "UberXE12.40", "UberX E12.40".
_GLUED_LABEL = re.compile(r"^[^A-Za-z0-9]*uber[ \t-]*xl?[ \t]?[A-Za-z]?[ \t]?[0-9£€$]", re.I | re.ASCII)
# At most this many non-blank lines between the label and the first leg (rating-only and
# badge-only lines are not counted). A label further up is not this card's: no fare.
_ZONE_MAX_LINES = 3
# A rider-price caption: the amount on the line, or next to it, is what the rider pays.
_RIDER_PRICE = re.compile(r"\b(?:riders?|customer pays|you paid|total paid)\b", re.I | re.ASCII)
# Attempt 3: a promo/reward caption on the amount's line or the next/previous non-blank line means the
# amount is a promo, reward or earnings figure. A surge/boost "included" line (_SURGE) is card text, not a caption.
_PROMO_CAPTION = re.compile(r"\b(?:bonus|promo|reward|rewards|streak|quest|extra|earn|earns|earned|earning|earnings|boost)\b",
                            re.I | re.ASCII)
_RATING_ONLY = re.compile(r"^[^A-Za-z0-9£]*[0-9OoIl][.,][0-9OoIl]{1,2}[ \t]*[★*xX%]?[^A-Za-z0-9£]*$", re.ASCII)
# Card text: once numbers (with OCR's O/o/I/l), the words below (product names, units, leg labels,
# the Accept button, surge/boost lines, rate lines) and lone letters ("4.89 x", "E11.10") are
# removed, a card-text line holds only ASCII punctuation, spaces and a few symbols (£ · – — • € ★,
# direction marks). Any other letter, in any script, means ordinary words: a notification, a pill,
# a banner. A status-bar line (clock or battery %) is not card text either.
_CARD_WORDS = re.compile(
    r"\b(?:" + _PRODUCT_NAMES + r"|uber|accept|match|mins?|minutes?|mi|miles?|km|hrs?|hours?|away|trip|pickup|"
    r"surge|boost|includes?|included|incl|per)\b", re.I | re.ASCII)
_LONE_LETTER = re.compile(r"\b[A-Za-z]\b", re.ASCII)
_OCR_NUMBER = re.compile(r"[0-9OoIl]*[0-9][0-9OoIl]*", re.ASCII)  # "4.9l", "£1O.80": digits OCR misread
_CARD_CHARS = re.compile(r"^[\x00-\x40\x5b-\x60\x7b-\x7f\u00a0\u00a3\u00b7\u2013\u2014\u2022\u200e\u200f\u20ac\u2605]*$")
# A status-bar line: a clock ("14:05") or a battery level ("87%").
# A battery % never follows a decimal point: "4.90 %" is a rating whose star OCR read as "%".
_STATUS_BAR = re.compile(r"(?:^|[^0-9])[0-9]{1,2}:[0-9]{2}(?![0-9])|(?:^|[^0-9.,])[0-9]{1,3}[ \t]?%", re.ASCII)
# Cycle 3 (real Uber UK card). A sub-amount line: a £ amount whose caption on the same line says it is a part of,
# or a note on, the fare ("£2.40 est. holiday entitlement included", "£2.00 tip included", "£3.50 tolls").
# Never a fare candidate, never a rival fare; it must be smaller than the fare. One shared caption list.
_SUB_CAPTION = re.compile(
    r"\b(?:included|includes?|incl|est|estimated|entitlement|holiday|after[ \t]+fees|tips?|fees?|tolls?|"
    r"surcharges?|clean[ \t]+air[ \t]+zone|caz|boost|surge)\b", re.I | re.ASCII)
# The "After fees" chip next to the fare, with or without an OCR-junk icon and a number ("% 5.00 After fees").
_AFTER_FEES_CHIP = re.compile(r"^[^A-Za-z£]*after[ \t]+fees[^A-Za-z£]*$", re.I | re.ASCII)
_AFTER_FEES = re.compile(r"\bafter[ \t]+fees\b", re.I | re.ASCII)
# A short OCR-junk line (a mis-read icon, "Ee ~"): no digit, no £, at most 4 characters besides spaces,
# and no run of 3 letters (a short word such as "Goal" is a word, not junk).
_JUNK_LINE = re.compile(r"^(?![^\n]*[A-Za-z]{3})[ \t]*(?:[^ \t0-9£][ \t]*){1,4}$", re.ASCII)
# A junk token on a label line: 1 or 2 characters, no £, not itself a ride-type name ("ae Comfort",
# "© UberX Priority", a mis-read icon "4 XL").
_LABEL_JUNK = re.compile(r"(?:^|(?<=[ \t]))[^ \t£]{1,2}(?=[ \t]|$)", re.ASCII)
_PRODUCT_TOKEN = re.compile(r"^(?:" + _PRODUCT_NAMES + r")$", re.I | re.ASCII)
_LABEL_JUNK_MAX = 2
# An OCR-junk icon after a clean fare (surge icon read as "4"): one digit, alone, after "£d.dd".
_CLEAN_FARE = re.compile(r"£[ \t]?[0-9]+\.[0-9]{2}$", re.ASCII)
_ICON_TRAIL = re.compile(r"^[ \t]+[0-9](?:[ \t]+[^A-Za-z0-9 \t]+)?[ \t]*$", re.ASCII)
# A clean fare with a surge icon after it ("£24.60 ⚡", "£24.60 4") is card text (the no-label cut-off).
_FARE_ICON_LINE = re.compile(r"^[ \t]*£[ \t]?[0-9]+\.[0-9]{2}(?:[ \t]+[0-9])?(?:[ \t]*[^A-Za-z0-9 \t]{1,2})?[ \t]*$")


def _f(s: str) -> float:
    return float(s.replace(",", "."))


_BLANK = re.compile(r"[ \t\r\f\v]*$")  # explicit set, identical in JS


class _Lines:
    """Line number / line text for a position, in O(log n) (large pastes stay fast)."""

    def __init__(self, text: str):
        self.text = text
        self.starts = [0] + [i + 1 for i, ch in enumerate(text) if ch == "\n"]
        # nb[n]: how many non-blank lines come before line n; nonblank: indices of non-blank lines.
        self.nb, self.nonblank = [], []
        for n in range(len(self.starts)):
            self.nb.append(len(self.nonblank))
            if not _BLANK.match(self.line(n)):
                self.nonblank.append(n)

    def neighbours(self, n: int) -> list[str]:
        """The non-blank lines just before and just after line n."""
        k = self.nb[n]
        out = [self.line(self.nonblank[k - 1])] if k > 0 else []
        j = k + 1 if k < len(self.nonblank) and self.nonblank[k] == n else k
        if j < len(self.nonblank):
            out.append(self.line(self.nonblank[j]))
        return out

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


def _garbled_fare_line(line: str) -> bool:
    g = _GARBLED_FARE_LINE.match(line)
    return bool(g) and (g.group(1) is not None or _f(g.group(2).translate(_OCR_DIGITS)) > 5)


def _product_label_line(line: str) -> bool:
    if _GLUED_LABEL.match(line):
        return True
    return bool(_PRODUCT_WORD.search(_PRODUCT_BADGES.sub(" ", line))) and bool(_PRODUCT_LABEL.match(line))


def _anchor_label_line(line: str) -> bool:
    """A product label that may anchor the fare zone: as _product_label_line, or one that, besides
    ride-type names, holds at most 2 short OCR-junk tokens (at most 2 characters each)."""
    if _product_label_line(line):
        return True
    junk = [t for t in _LABEL_JUNK.findall(line) if not _PRODUCT_TOKEN.match(t)]
    if not 0 < len(junk) <= _LABEL_JUNK_MAX:
        return False
    return _product_label_line(_LABEL_JUNK.sub(lambda m: m.group(0) if _PRODUCT_TOKEN.match(m.group(0)) else " ", line))


def _sub_amount_line(line: str) -> bool:
    """A line with a £ amount and a sub-amount caption (part of, or a note on, the fare)."""
    return "£" in line and bool(_FARE.search(line)) and bool(_SUB_CAPTION.search(line))


def _sub_amounts(line: str) -> list:
    return [_f(m.group(1).translate(_OCR_DIGITS)) for m in _FARE.finditer(line)
            if re.search(r"[0-9]", m.group(1))] if _sub_amount_line(line) else []


def _caption(line: str) -> bool:
    """A promo/reward caption line: a promo word, no £ amount of its own, not a surge/boost-included line."""
    return bool(_PROMO_CAPTION.search(line)) and "£" not in line and not _SURGE.search(line)


def _promo_captioned(lines: "_Lines", n: int) -> bool:
    """The amount on line n has a promo caption just below it, or just above it (unless that caption
    already sits directly under another £ amount, which it then belongs to)."""
    k = lines.nb[n]  # index of line n among the non-blank lines
    nb = lambda j: lines.line(lines.nonblank[j])  # noqa: E731
    if k + 1 < len(lines.nonblank) and _caption(nb(k + 1)):
        return True
    return k >= 1 and _caption(nb(k - 1)) and not (k >= 2 and "£" in nb(k - 2))


def _window_counted(line: str) -> bool:
    """A non-blank line that counts towards _ZONE_MAX_LINES (not a rating, not a badge-only line)."""
    if _BLANK.match(line) or _RATING_ONLY.match(line):
        return False
    if _sub_amount_line(line) or _AFTER_FEES_CHIP.match(line) or _JUNK_LINE.match(line):
        return False  # cycle 3: sub-amounts, the "After fees" chip and short OCR junk describe the fare
    return not (_PRODUCT_BADGES.search(line) and _PRODUCT_LABEL.match(line))


def _card_text_line(line: str) -> bool:
    """False for a status-bar line or a line with ordinary words (notification, pill, banner)."""
    if _STATUS_BAR.search(line):
        return False
    if _sub_amount_line(line) or _AFTER_FEES_CHIP.match(line) or _FARE_ICON_LINE.match(line):
        return True  # cycle 3: a sub-amount, the "After fees" chip or a fare with a surge icon is part of the card
    return bool(_CARD_CHARS.match(_LONE_LETTER.sub("", _CARD_WORDS.sub("", _OCR_NUMBER.sub(" ", line)))))


def _plausible(value: float, legs: list) -> bool:
    miles = sum(l[2] for l in legs)
    mins = sum(l[1] for l in legs)
    if miles <= 0:
        return True
    top = _FARE_MAX_BASE + _FARE_MAX_PER_MILE * miles + _FARE_MAX_PER_MIN * mins
    return _FARE_MIN_PER_MILE * miles <= value <= top


def _check_sub_amounts(offer: Offer, lines: _Lines, start: int, anchor_line: int) -> None:
    """Cycle 3: on the lines from start up to the first leg, note an "After fees" chip, and refuse a fare
    that is not bigger than every sub-amount that describes it (one of them was misread)."""
    zone = [lines.line(n) for n in range(start, anchor_line)]
    if any(_AFTER_FEES.search(l) for l in zone):
        offer.warnings.append("fare_after_fees")
    subs = [v for l in zone for v in _sub_amounts(l)]
    if offer.fare is not None and any(v >= offer.fare for v in subs):
        offer.fare = None
        offer.warnings.append("sub_amount_not_smaller")


def _refuse_all(offer: Offer, why: str) -> Offer:
    offer.fare = offer.surge = None
    offer.warnings += [why, "needs_manual_entry"]
    return offer


def _fare_from_zone(offer: Offer, lines: _Lines, fares: list, label: int, anchor_line: int,
                    first: int, last: int) -> None:
    """The fare zone (a product label above the legs): the label line, the lines between it and the
    first leg, and the Accept-button line below the legs. Amounts above the label or below the
    Accept line are outside the card and ignored. Between the legs and the Accept line (or the end
    of the text, if there is no Accept line) another product label, or a fare-shaped amount that
    differs from the card's, may be the start of a second offer (a card cut off): the fare is
    refused, as in cycle 1."""
    last_line = lines.no(last)
    n_lines = len(lines.starts)
    accept_line = next((n for n in range(last_line + 1, n_lines) if _ACCEPT.search(lines.line(n))), None)
    card_end = accept_line if accept_line is not None else n_lines
    zone_start = lines.starts[label]
    zone = [c for c in fares if zone_start <= c[0] < first and not c[3]]  # Accept counts only below the legs
    accept = [c for c in fares if accept_line is not None and lines.no(c[0]) == accept_line]
    below = [c for c in fares if c[0] > last and lines.no(c[0]) < card_end]
    garbled = any(_garbled_fare_line(lines.line(n)) for n in range(label + 1, anchor_line))
    values = {c[2] for c in zone} | {c[2] for c in accept}
    if any(c[2] not in values for c in below) or any(_product_label_line(lines.line(n)) for n in range(last_line + 1, card_end)):
        offer.warnings.append("fare_ambiguous")  # a second offer starts below this one
    elif len(values) > 1:
        offer.warnings.append("fare_ambiguous")
    elif accept:
        offer.fare = accept[0][2]  # the Accept button: the card's own fare
    elif garbled:
        offer.warnings.append("fare_unreadable")  # the card's own fare line is misread: don't substitute
    elif zone:
        offer.fare = zone[0][2]
    else:
        offer.warnings.append("fare_missing")  # never look above the label
    _check_sub_amounts(offer, lines, label, anchor_line)


def _fare_without_label(offer: Offer, lines: _Lines, fares: list, used: list, first: int,
                        anchor_line: int) -> None:
    """No product label: the cycle-1 rules, but the window stops at the nearest line above the legs
    that is not card text (status bar, notification, pill, banner); nothing at or above it counts.
    Attempt 2: below that cut-off there must be exactly one distinct amount, and an Accept line
    above the legs (another card's) refuses."""
    cut = next((n for n in range(anchor_line - 1, -1, -1)
                if not _BLANK.match(lines.line(n)) and not _card_text_line(lines.line(n))), -1)
    _fare_below_cut(offer, lines, fares, used, first, anchor_line, cut)
    _check_sub_amounts(offer, lines, cut + 1, anchor_line)


def _fare_below_cut(offer: Offer, lines: _Lines, fares: list, used: list, first: int,
                    anchor_line: int, cut: int) -> None:
    fares = [c for c in fares if lines.no(c[0]) > cut]
    if any(c[3] and c[0] < first for c in fares):
        offer.warnings.append("fare_ambiguous")  # an Accept line above the legs: another card's
        return
    if len({c[2] for c in fares}) > 1:
        offer.warnings.append("fare_ambiguous")  # no label: only a lone amount may be the fare
        return
    anchor_nb = lines.nb[anchor_line]
    plausible = [c for c in fares if _plausible(c[2], used)]
    on_accept = {c[2] for c in plausible if c[3]}
    near = [c for c in fares if c[0] < first and anchor_nb - c[1] <= _FARE_WINDOW_LINES]
    after = near[-1][0] if near else -1
    garbled = any(
        lines.starts[n] > after and anchor_nb - lines.nb[n] <= _FARE_WINDOW_LINES
        and _garbled_fare_line(lines.line(n))
        for n in range(cut + 1, anchor_line))
    if on_accept:
        # The amount on the Accept button is the card's own fare.
        # A different fare above the legs as well means we can't tell: refuse.
        if len(on_accept) == 1 and not (near and near[-1][2] not in on_accept):
            offer.fare = on_accept.pop()
        else:
            offer.warnings.append("fare_ambiguous")
    elif garbled:
        offer.warnings.append("fare_unreadable")  # the card's own fare line is misread: don't substitute
    elif near:
        pick = near[-1]
        if any(c[2] != pick[2] for c in plausible if c is not pick):
            # Another plausible fare elsewhere on the screen: never guess between them.
            offer.warnings.append("fare_ambiguous")
        else:
            offer.fare = pick[2]
    elif fares:
        offer.warnings.append("fare_not_near_legs")


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
        unlabeled_inside = [l for l in unlabeled if lo < l[3] < hi]
        if len(unlabeled) > len(unlabeled_inside):
            offer.warnings.append("unlabelled_leg_ignored")  # outside the card (navigation, etc.)
        unlabeled = []
        if unlabeled_inside:
            # A stop leg between pickup and trip (multi-stop): the trip total is unclear, the pickup isn't.
            offer.warnings.append("extra_leg")
            trips = []
            used = [pickups[0]]
        else:
            used = [pickups[0], trips[0]]
    elif len(legs) > 2:
        # Several offers on one screen (e.g. a Trip Radar list): can't tell which one is meant.
        return _refuse_all(offer, "multiple_offers")
    else:
        used = legs

    # Fare candidates: £ amounts on a card-fare-shaped line (see _FARE_WORDS); not the surge,
    # an add-on ("+£5.00 airport fee"), a rate, a promo/payment/earnings line or the earnings pill.
    fares = []  # (position, non-blank line number, value, on the Accept line)
    range_seen = False
    for m in _FARE.finditer(text):
        if surge_m and surge_m.start() <= m.start() < surge_m.end():
            continue
        if not re.search(r"[0-9]", m.group(1)):
            continue
        n = lines.no(m.start())
        line = lines.line(n)
        line_end = lines.starts[n] + len(line)
        prefix = line[: m.start() - lines.starts[n]]
        if _NOT_FARE.search(line) or not _FARE_PREFIX_OK.match(prefix) or prefix.rstrip().endswith("+"):
            continue
        if _RATE_AFTER.match(text, m.end()):
            continue
        value, end = _f(m.group(1).translate(_OCR_DIGITS)), m.end()
        rng = _RANGE_AFTER.match(text, m.end())
        if rng:
            value, end = min(value, _f(rng.group(1))), rng.end()  # a range: the lower, guaranteed end
        trail_end = next((l[3] for l in legs if end <= l[3] < line_end), line_end)
        trail = text[end:trail_end]
        # Cycle 3: a surge icon OCR read as a digit may follow a clean "£d.dd" fare ("£24.60 4").
        icon = not rng and bool(_CLEAN_FARE.match(m.group(0))) and bool(_ICON_TRAIL.match(trail))
        if not (_FARE_TRAIL_OK.match(trail) or icon):
            continue
        if any(_PILL_LABEL.search(nb) for nb in lines.neighbours(n)):
            continue
        if _RIDER_PRICE.search(line) or any(_RIDER_PRICE.search(nb) for nb in lines.neighbours(n)):
            continue  # the rider's price, not the driver's fare
        if _PROMO_CAPTION.search(line) or _promo_captioned(lines, n):
            continue  # a promo, reward or earnings amount
        range_seen = range_seen or bool(rng)
        fares.append((m.start(), lines.nb[n], value, bool(_ACCEPT.search(line))))

    if used:
        first, last = min(l[3] for l in used), max(l[3] for l in used)
        if any(first < c[0] < last for c in fares):
            return _refuse_all(offer, "multiple_offers")  # a second fare between the legs: stacked offers
        anchor_line = lines.no(first)
        label = next((n for n in range(anchor_line - 1, -1, -1) if _anchor_label_line(lines.line(n))), None)
        if label is not None and sum(_window_counted(lines.line(n)) for n in range(label + 1, anchor_line)) > _ZONE_MAX_LINES:
            offer.warnings.append("fare_label_too_far")  # the nearest label is not this card's: no fare
        elif label is not None:
            _fare_from_zone(offer, lines, fares, label, anchor_line, first, last)
        else:
            _fare_without_label(offer, lines, fares, used, first, anchor_line)
    elif fares:
        values = {c[2] for c in fares if c[3]} or {c[2] for c in fares}
        if len(values) == 1:
            offer.fare = values.pop()
        else:
            offer.warnings.append("fare_ambiguous")
    if range_seen and offer.fare is not None:
        offer.warnings.append("fare_range_low_end")

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
