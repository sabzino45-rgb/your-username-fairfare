"""Verdict model: take-home per hour and per mile, as a range with a confidence.

Owned by the Verdict Modeler agent. Rule from the design doc: return a range
with a confidence level, never a single falsely precise number.

All tunable assumptions live in ASSUMPTIONS so the modeler can calibrate them
against logged outcomes in eval_set/ (see tools/run_eval.py).
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

from .parser import Offer

ASSUMPTIONS = {
    # Time actually spent vs the minutes Uber shows (traffic, finding the rider, drop-off).
    "time_factor_low": 1.00,    # optimistic
    "time_factor_mid": 1.15,
    "time_factor_high": 1.40,   # pessimistic
    "fixed_overhead_min": 2.0,  # wait at pickup + drop-off
    # Unpaid miles after drop-off (repositioning), as a share of trip miles.
    "deadhead_low": 0.0,
    "deadhead_mid": 0.15,
    "deadhead_high": 0.35,
    # Below this many paid minutes, estimates are noisy.
    "short_trip_min": 8.0,
    "long_pickup_ratio": 0.6,   # pickup minutes / trip minutes
}


@dataclass
class DriverProfile:
    cost_per_mile: float = 0.20        # £ fuel/charge + wear; driver sets their own
    target_per_hour: float = 18.0      # £ take-home
    target_per_mile: float = 1.00      # £ take-home per total mile driven
    service_fee_share: float = 0.0     # 0 if the shown fare is already the driver's earnings


@dataclass
class Verdict:
    decision: str                       # "ACCEPT" | "MARGINAL" | "DECLINE" | "UNKNOWN"
    per_hour_low: float | None
    per_hour_mid: float | None
    per_hour_high: float | None
    per_mile_low: float | None
    per_mile_mid: float | None
    per_mile_high: float | None
    confidence: str                     # "high" | "medium" | "low"
    reasons: list[str]

    def to_dict(self) -> dict:
        return asdict(self)

    def headline(self) -> str:
        """Short, glanceable text. Designed to be read while parked, not driving."""
        if self.decision == "UNKNOWN":
            return "Can't judge this one - enter details when parked"
        return (f"{self.decision}: £{self.per_hour_low:.0f}-{self.per_hour_high:.0f}/hr "
                f"({self.confidence} confidence)")


def _scenario(offer: Offer, p: DriverProfile, time_factor: float, deadhead: float) -> tuple[float, float]:
    a = ASSUMPTIONS
    net_fare = offer.fare * (1 - p.service_fee_share)
    miles = offer.pickup_miles + offer.trip_miles * (1 + deadhead)
    minutes = (offer.pickup_min + offer.trip_min) * time_factor + a["fixed_overhead_min"]
    take_home = net_fare - miles * p.cost_per_mile
    return take_home / (minutes / 60), take_home / miles


def estimate(offer: Offer, profile: DriverProfile | None = None) -> Verdict:
    p = profile or DriverProfile()
    a = ASSUMPTIONS
    reasons: list[str] = []

    if offer.missing:
        return Verdict("UNKNOWN", None, None, None, None, None, None, "low",
                       [f"missing:{','.join(offer.missing)}"])

    # A leg that covers miles in no time (or any negative value) is a typing or reading error,
    # not a sky-high £/h. Same rule in app/js/engine.js estimate().
    for mins, miles in ((offer.pickup_min, offer.pickup_miles), (offer.trip_min, offer.trip_miles)):
        if mins < 0 or miles < 0 or (mins <= 0 and miles > 0):
            return Verdict("UNKNOWN", None, None, None, None, None, None, "low", ["zero_minute_leg"])

    total_miles = offer.pickup_miles + offer.trip_miles
    total_min = offer.pickup_min + offer.trip_min
    if total_miles <= 0 or total_min <= 0:
        return Verdict("UNKNOWN", None, None, None, None, None, None, "low", ["zero_time_or_distance"])

    best = _scenario(offer, p, a["time_factor_low"], a["deadhead_low"])
    mid = _scenario(offer, p, a["time_factor_mid"], a["deadhead_mid"])
    worst = _scenario(offer, p, a["time_factor_high"], a["deadhead_high"])

    # Confidence: start high, step down for known sources of error.
    score = 3
    if offer.source == "scan" and any("inferred" in w for w in offer.warnings):
        score -= 1
        reasons.append("layout_inferred")
    if offer.trip_min < a["short_trip_min"]:
        score -= 1
        reasons.append("short_trip")
    if offer.trip_min > 0 and offer.pickup_min / offer.trip_min > a["long_pickup_ratio"]:
        score -= 1
        reasons.append("long_pickup")
    if offer.surge:
        reasons.append("surge_included")
    confidence = {3: "high", 2: "medium"}.get(score, "low")

    hr_ok_worst = worst[0] >= p.target_per_hour
    mi_ok_worst = worst[1] >= p.target_per_mile
    hr_ok_best = best[0] >= p.target_per_hour
    mi_ok_best = best[1] >= p.target_per_mile
    if hr_ok_worst and mi_ok_worst:
        decision = "ACCEPT"
    elif not hr_ok_best or not mi_ok_best:
        decision = "DECLINE"
    else:
        decision = "MARGINAL"

    r2 = lambda x: round(x, 2)
    return Verdict(decision, r2(worst[0]), r2(mid[0]), r2(best[0]),
                   r2(worst[1]), r2(mid[1]), r2(best[1]), confidence, reasons)
