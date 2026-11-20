"""FairFare: ride-offer analyzer. Parses an offer card and estimates take-home pay."""

from .parser import Offer, parse_offer_text, manual_offer
from .verdict import DriverProfile, Verdict, estimate

__all__ = ["Offer", "parse_offer_text", "manual_offer", "DriverProfile", "Verdict", "estimate"]
