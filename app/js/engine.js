// FairFare engine: offer parser + verdict model.
// JavaScript port of fairfare/parser.py and fairfare/verdict.py, extended with the
// driver settings from the app (optimise for, commission, minimum per mile, shift goal).
// tests/test_js_parity.py checks this file against the Python engine on the eval set.

export const KM_PER_MILE = 1.609344;
export const REQUIRED = ["fare", "pickup_min", "pickup_miles", "trip_min", "trip_miles"];
const f = (s) => parseFloat(String(s).replace(",", "."));
// Round to 2 decimals exactly like Python's round(x, 2): use the exact binary value
// (toFixed is exact), and break true ties to even. Math.round(x * 100) / 100 differs,
// e.g. 1.075 (really 1.07499...) gives 1.08 in JS but 1.07 in Python.
const r2 = (x) => {
  if (!Number.isFinite(x)) return x;
  const exact = Math.abs(x).toFixed(60);
  if (/\.\d\d50*$/.test(exact)) {
    const lo = Math.floor(Math.abs(x) * 100);
    const n = (lo % 2 === 0 ? lo : lo + 1) / 100;
    return x < 0 ? -n : n;
  }
  return Number(x.toFixed(2));
};
// ---- Offer parser. Every rule mirrors fairfare/parser.py (same names, upper-cased);
// tests/test_js_parity.py checks they agree. Regexes are ASCII-only, as in Python (re.ASCII).

// Non-ASCII digits (Arabic-Indic, Extended Arabic-Indic, full-width), full-width £ / full stop and
// the Arabic decimal sign, mapped one-for-one so positions are kept.
function unicodeDigits(s) {
  return s.replace(/[٠-٩۰-۹０-９٫．￡]/g, (c) => {
    const k = c.charCodeAt(0);
    if (k === 0x066b || k === 0xff0e) return ".";
    if (k === 0xffe1) return "£";
    return String(k >= 0xff10 ? k - 0xff10 : k >= 0x06f0 ? k - 0x06f0 : k - 0x0660);
  });
}
const ocrDigits = (s) => s.replace(/[Oo]/g, "0").replace(/[Il]/g, "1");
// A number next to a time/distance unit, where OCR may read 1 as l/I and 0 as O/o ("l8 mins").
const LEG_NUM_TOKEN = new RegExp(
  "(^|[^A-Za-z0-9])([0-9OoIl]+(?:[.,][0-9OoIl]+)?)" +
  "(?=[ \\t]*(?:[Mm]inutes?|[Mm]ins?|[Mm]iles?|[Mm]i|[Kk]m|[Hh]ours?|[Hh]rs?|[Hh])(?![A-Za-z]))", "g");

const NUM = "([0-9]+(?:[.,][0-9]+)?)";
// A £ amount. Inside it, l/I and O/o are read as 1 and 0 (it must contain a real digit).
// It must end at a non-alphanumeric character (and not mid-decimal), or it isn't trusted.
const FARE_SRC = "£\\s?([0-9Il][0-9OoIl]*(?:[.,][0-9OoIl]{1,2})?)(?![A-Za-z0-9]|[.,][0-9OoIl])";
// Lines whose £ amount is not the offer fare: promos, earnings, balances, tips, bonuses,
// surge/boost lines, and payments/bank/shopping notifications.
const NOT_FARE = new RegExp(
  "\\b(?:off|discount|promo|code|voucher|coupon|save|saved|earned|today|week|weekly|" +
  "balance|cash ?out|tips?|bonus|quest|reward|refer|cashback|credit|wallet|extra|" +
  "surge|boost|includes?|included|incl|" +
  "spent|spend|paid|pay|payment|received|bank|card|transfer|order|refund|bill)\\b", "i");
// The fare is the prominent amount that starts its line; only ride-type names may come before it.
const FARE_PREFIX_OK = new RegExp(
  "^(?:[^A-Za-z0-9]|\\b(?:uber|uberx|comfort|exclusive|xl|exec|executive|green|pet|lux|" +
  "black|electric|priority|saver|wav|access|assist)\\b)*$", "i");
const RATE_AFTER = /[ \t]*(?:\/|per\b)/iy;                                   // "£1.14/mi"
const RANGE_AFTER = new RegExp("[ \\t]*[-\\u2013\\u2014~][ \\t]*£[ \\t]?" + NUM, "y"); // "£10.80–£13.20"
// A card fare whose £ was misread as a letter ("E11.10", "fl2.40"): the card's own fare is unreadable.
const GARBLED_FARE_LINE = /^[^A-Za-z0-9£]*[A-Za-z]{1,2}[ \t]?[0-9OoIl]{1,3}[.,][0-9OoIl]{2}[^A-Za-z0-9£]*$/;
// Lines whose min/distance pair is navigation, not an offer leg.
const NOT_LEG = /\b(?:arriv\w*|eta|remaining|destination|route|to go)\b/i;
// The fare sits on the card just above the legs: at most this many lines above the first leg.
const FARE_WINDOW_LINES = 4;
// Fare plausibility against its legs (UK private hire, generous); see parser.py for the reasoning.
const FARE_MAX_BASE = 20.0, FARE_MAX_PER_MILE = 6.0, FARE_MAX_PER_MIN = 1.0, FARE_MIN_PER_MILE = 0.25;
const SURGE = new RegExp("\\+\\s?£\\s?" + NUM + "[^\\n]*?(?:surge|boost|included)", "i");
// [ \t] not \s: a label must be on the same line, or "Trip" on the next line is stolen.
const LEG_SRC = "(?:([0-9]+)[ \\t]*(?:hours?|hrs?|h)\\b[ \\t]*(?:([0-9]+)[ \\t]*(?:mins?|minutes?))?|" +
  NUM + "[ \\t]*(?:mins?|minutes?))" +
  "[ \\t]*[(\\[·•,-]?[ \\t]*" + NUM + "[ \\t]*(mi|miles?|km)\\b\\)?[ \\t]*(away|trip|pickup)?";
const RATING = new RegExp(NUM + "\\s*[★*]");
const hasDigit = (s) => /[0-9]/.test(s);
const matchAt = (re, text, pos) => { re.lastIndex = pos; return re.exec(text); };

// Line number / line text for a position, in O(log n) (large pastes stay fast).
function makeLines(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  const no = (pos) => { // bisect_right(starts, pos) - 1
    let lo = 0, hi = starts.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= pos) lo = mid + 1; else hi = mid; }
    return lo - 1;
  };
  const line = (n) => text.slice(starts[n], n + 1 < starts.length ? starts[n + 1] - 1 : text.length);
  return { starts, no, line };
}

export function emptyOffer(source = "scan") {
  return { fare: null, pickup_min: null, pickup_miles: null, trip_min: null, trip_miles: null,
           surge: null, rider_rating: null, source, warnings: [], missing: [...REQUIRED] };
}

function refuseAll(o, why) {
  o.fare = null; o.surge = null;
  o.warnings.push(why, "needs_manual_entry");
  o.missing = REQUIRED.filter((k) => o[k] === null);
  return o;
}

// Returns numbers only. Raw text, rider names and addresses never leave this function.
export function parseOfferText(text) {
  const o = emptyOffer("scan");
  if (!text || !text.trim()) { o.warnings.push("empty_text"); return o; }

  // Same length in and out, so positions stay valid.
  text = unicodeDigits(text);
  text = text.replace(LEG_NUM_TOKEN, (all, pre, tok) => (hasDigit(tok) ? pre + ocrDigits(tok) : all));
  const L = makeLines(text);

  const sm = SURGE.exec(text);
  if (sm) o.surge = f(sm[1]);

  const legs = []; // [label, minutes, miles, position]
  const legRe = new RegExp(LEG_SRC, "gi");
  let m;
  while ((m = legRe.exec(text))) {
    if (NOT_LEG.test(L.line(L.no(m.index)))) continue; // navigation bar, not an offer leg
    const minutes = m[1] !== undefined ? parseInt(m[1], 10) * 60 + (m[2] !== undefined ? parseInt(m[2], 10) : 0) : f(m[3]);
    let label = (m[6] || "").toLowerCase();
    const before = text.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    if (!label) label = before.includes("pickup") ? "pickup" : before.includes("trip") ? "trip" : "";
    const d = f(m[4]);
    legs.push([label, minutes, m[5].toLowerCase().startsWith("km") ? d / KM_PER_MILE : d, m.index]);
  }

  const pickups = legs.filter((l) => l[0] === "away" || l[0] === "pickup");
  const trips = legs.filter((l) => l[0] === "trip");
  let unl = legs.filter((l) => l[0] === "");
  let used;
  if (pickups.length > 1 || trips.length > 1) return refuseAll(o, "multiple_offers");
  if (pickups.length && trips.length) {
    const [lo, hi] = [pickups[0][3], trips[0][3]].sort((a, b) => a - b);
    if (unl.some((l) => lo < l[3] && l[3] < hi)) return refuseAll(o, "extra_leg"); // e.g. multi-stop
    if (unl.length) o.warnings.push("unlabelled_leg_ignored"); // outside the card (navigation, etc.)
    unl = [];
    used = [pickups[0], trips[0]];
  } else if (legs.length > 2) {
    // Several offers on one screen (e.g. a Trip Radar list): can't tell which one is meant.
    return refuseAll(o, "multiple_offers");
  } else {
    used = legs;
  }

  // Fare candidates: prominent £ amounts that start their line, not surge, rate, promo or notification.
  const fares = []; // [position, line number, value]
  const fareRe = new RegExp(FARE_SRC, "g");
  while ((m = fareRe.exec(text))) {
    if (sm && sm.index <= m.index && m.index < sm.index + sm[0].length) continue;
    if (!hasDigit(m[1])) continue;
    const n = L.no(m.index);
    const line = L.line(n);
    if (NOT_FARE.test(line) || !FARE_PREFIX_OK.test(line.slice(0, m.index - L.starts[n]))) continue;
    const end = m.index + m[0].length;
    if (matchAt(RATE_AFTER, text, end)) continue;
    let value = f(ocrDigits(m[1]));
    const rng = matchAt(RANGE_AFTER, text, end);
    if (rng) { value = Math.min(value, f(rng[1])); o.warnings.push("fare_range_low_end"); } // lower end
    fares.push([m.index, n, value]);
  }

  if (used.length) {
    const first = Math.min(...used.map((l) => l[3])), last = Math.max(...used.map((l) => l[3]));
    if (fares.some((c) => first < c[0] && c[0] < last)) return refuseAll(o, "multiple_offers"); // stacked offers
    const anchorLine = L.no(first);
    const near = fares.filter((c) => c[0] < first && anchorLine - c[1] <= FARE_WINDOW_LINES);
    const startLine = near.length ? near[near.length - 1][1] + 1 : Math.max(0, anchorLine - FARE_WINDOW_LINES);
    let garbled = false;
    for (let n = startLine; n < anchorLine; n++) {
      const ln = L.line(n);
      if (GARBLED_FARE_LINE.test(ln) && hasDigit(ln)) garbled = true;
    }
    if (garbled) o.warnings.push("fare_unreadable"); // the card's own fare line is misread: don't substitute
    else if (near.length) o.fare = near[near.length - 1][2];
    else if (fares.length) o.warnings.push("fare_not_near_legs");
  } else if (fares.length) {
    if (new Set(fares.map((c) => c[2])).size === 1) o.fare = fares[0][2];
    else o.warnings.push("fare_ambiguous");
  }

  let pickup = pickups[0] || null;
  let trip = trips[0] || null;
  if (!pickup && unl.length) { pickup = unl.shift(); o.warnings.push("pickup_inferred_from_order"); }
  if (!trip && unl.length) { trip = unl.shift(); o.warnings.push("trip_inferred_from_order"); }
  if (pickup) { o.pickup_min = pickup[1]; o.pickup_miles = r2(pickup[2]); }
  if (trip) { o.trip_min = trip[1]; o.trip_miles = r2(trip[2]); }

  const rr = RATING.exec(text);
  if (rr && f(rr[1]) >= 1 && f(rr[1]) <= 5) o.rider_rating = f(rr[1]);

  if (o.fare !== null && !(o.fare >= 1 && o.fare <= 1000)) { o.warnings.push("fare_out_of_range"); o.fare = null; }
  for (const leg of ["pickup", "trip"]) {
    const mins = o[leg + "_min"], miles = o[leg + "_miles"];
    if (mins !== null && miles !== null && ((mins <= 0 && miles > 0) || (mins > 0 && miles / (mins / 60) > 90))) {
      o.warnings.push(leg + "_speed_implausible");
      o[leg + "_min"] = null;
      o[leg + "_miles"] = null;
    }
  }
  const knownMiles = [o.pickup_miles, o.trip_miles].filter((x) => x !== null).reduce((a, b) => a + b, 0);
  const knownMins = [o.pickup_min, o.trip_min].filter((x) => x !== null).reduce((a, b) => a + b, 0);
  if (o.fare !== null && knownMiles > 0) {
    const top = FARE_MAX_BASE + FARE_MAX_PER_MILE * knownMiles + FARE_MAX_PER_MIN * knownMins;
    if (o.fare > top || o.fare < FARE_MIN_PER_MILE * knownMiles) {
      o.warnings.push("fare_implausible"); // e.g. "£950" for £9.50: decimal point lost
      o.fare = null;
    }
  }
  o.missing = REQUIRED.filter((k) => o[k] === null);
  if (o.missing.length) o.warnings.push("needs_manual_entry");
  return o;
}

export function manualOffer(v) {
  const o = emptyOffer("manual");
  for (const k of REQUIRED) o[k] = Number.isFinite(v[k]) ? v[k] : null;
  o.missing = REQUIRED.filter((k) => o[k] === null);
  return o;
}

export const ASSUMPTIONS = {
  tf: [1.0, 1.15, 1.4],         // time actually taken vs minutes shown: best, mid, worst
  overhead: 2.0,                // minutes waiting at pickup + drop-off
  dead: [0.0, 0.15, 0.35],      // unpaid miles after drop-off, share of trip miles
  shortTrip: 8.0,
  longPickupRatio: 0.6,
};

export const DEFAULT_SETTINGS = {
  optimise: "both",             // "hour" | "mile" | "both"
  targetHr: 18,                 // £ take-home per hour
  minMile: 0.9,                 // £ take-home per mile driven (floor)
  costMile: 0.2,                // £ running cost per mile
  commission: 0,                // % taken from the shown fare (0 if the fare is already earnings)
  pickupMinPerMile: 2,          // used when the card shows pickup miles but not minutes
  shiftGoal: 200,
  shiftHours: 8,
};

function scenario(o, s, i) {
  const A = ASSUMPTIONS;
  const net = o.fare * (1 - (s.commission || 0) / 100);
  const miles = o.pickup_miles + o.trip_miles * (1 + A.dead[i]);
  const minutes = (o.pickup_min + o.trip_min) * A.tf[i] + A.overhead;
  const take = net - miles * s.costMile;
  return { perHr: take / (minutes / 60), perMile: take / miles, take, miles, minutes };
}

// Verdict: a range (worst / mid / best) with confidence, never one falsely precise number.
export function estimate(offer, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const o = { ...offer };
  if (o.pickup_min === null && o.pickup_miles !== null && s.pickupMinPerMile > 0) {
    o.pickup_min = r2(o.pickup_miles * s.pickupMinPerMile);
    o.missing = REQUIRED.filter((k) => o[k] === null);
  }
  if (o.missing.length) return { decision: "UNKNOWN", confidence: "low", reasons: ["missing"], missing: o.missing };
  if (o.pickup_miles + o.trip_miles <= 0 || o.pickup_min + o.trip_min <= 0)
    return { decision: "UNKNOWN", confidence: "low", reasons: ["zero"], missing: [] };

  const [best, mid, worst] = [0, 1, 2].map((i) => scenario(o, s, i));
  const reasons = [];
  let score = 3;
  if (o.source === "scan" && o.warnings.some((w) => w.includes("inferred"))) { score--; reasons.push("layout_inferred"); }
  if (o.trip_min < ASSUMPTIONS.shortTrip) { score--; reasons.push("short_trip"); }
  if (o.trip_min > 0 && o.pickup_min / o.trip_min > ASSUMPTIONS.longPickupRatio) { score--; reasons.push("long_pickup"); }
  if (o.surge) reasons.push("surge_included");
  const confidence = score >= 3 ? "high" : score === 2 ? "medium" : "low";

  const useHr = s.optimise !== "mile", useMi = s.optimise !== "hour";
  const passes = (sc) => (!useHr || sc.perHr >= s.targetHr) && (!useMi || sc.perMile >= s.minMile);
  const decision = passes(worst) ? "ACCEPT" : !passes(best) ? "DECLINE" : "MARGINAL";

  // Fare this trip would need for a safe ACCEPT (worst case still meets the targets).
  const keep = 1 - (s.commission || 0) / 100;
  const needHr = useHr ? (s.targetHr * worst.minutes / 60 + worst.miles * s.costMile) / keep : 0;
  const needMi = useMi ? (s.minMile * worst.miles + worst.miles * s.costMile) / keep : 0;

  return {
    decision, confidence, reasons, missing: [],
    perHr: [r2(worst.perHr), r2(mid.perHr), r2(best.perHr)],
    perMile: [r2(worst.perMile), r2(mid.perMile), r2(best.perMile)],
    perMin: r2(mid.take / mid.minutes),
    take: r2(mid.take),
    cost: r2(mid.miles * s.costMile),
    totalMiles: r2(o.pickup_miles + o.trip_miles),
    totalMin: Math.round(o.pickup_min + o.trip_min),
    fareNeeded: r2(Math.max(needHr, needMi)),
    offer: o,
  };
}

export function shiftNeed(s) {
  return s.shiftHours > 0 ? r2(s.shiftGoal / s.shiftHours) : null;
}
