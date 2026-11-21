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
  "spent|spend|paid|pay|payment|received|bank|card|transfer|order|refund|bill|" +
  "from|via|paypal|sent|earnings)\\b", "i");
// A card's fare line holds the amount and nothing else that reads as words: only punctuation,
// ride-type names or the Accept button may stand before or after it; a leg may follow on the line.
const FARE_WORDS = "(?:[^A-Za-z0-9]|\\b(?:uber|uberx|uberxl|comfort|exclusive|xl|exec|executive|green|pet|" +
  "lux|black|electric|priority|saver|wav|access|assist|accept|x|share|taxi)\\b)*";
const FARE_PREFIX_OK = new RegExp("^" + FARE_WORDS + "$", "i");
const FARE_TRAIL_OK = FARE_PREFIX_OK;
const ACCEPT = /\baccept\b/i;
// A status label next to a bare amount marks the earnings pill ("£84.20" / "You're online").
const PILL_LABEL = /\b(?:online|offline|finding trips|earnings|today|this week)\b/i;
const RATE_AFTER = /[ \t]*(?:\/|per\b)/iy;                                   // "£1.14/mi"
const RANGE_AFTER = new RegExp("[ \\t]*[-\\u2013\\u2014~][ \\t]*£[ \\t]?" + NUM, "y"); // "£10.80–£13.20"
// A card fare whose £ was misread ("E11.10", "€9.60", "$12.95") or dropped ("15.75"), alone on its line:
// the card's own fare is unreadable. Without a symbol, values up to 5 are a rating that lost its star.
const GARBLED_FARE_LINE = /^[^A-Za-z0-9£€$]*([A-Za-z€$¥¢]{1,2})?[ \t]?([0-9OoIl]{1,3}[.,][0-9OoIl]{2})[^A-Za-z0-9£]*$/;
function garbledFareLine(line) {
  const g = GARBLED_FARE_LINE.exec(line);
  return !!g && (g[1] !== undefined || f(ocrDigits(g[2])) > 5);
}
// Lines whose min/distance pair is navigation, not an offer leg.
const NOT_LEG = /\b(?:arriv\w*|eta|remaining|destination|route|to go)\b/i;
// The fare sits on the card just above the legs: at most this many NON-BLANK lines above the first leg.
const FARE_WINDOW_LINES = 4;
// Fare plausibility against its legs (UK private hire, generous); see parser.py for the reasoning.
const FARE_MAX_BASE = 20.0, FARE_MAX_PER_MILE = 6.0, FARE_MAX_PER_MIN = 1.0, FARE_MIN_PER_MILE = 0.25;
const SURGE = new RegExp("\\+\\s?£\\s?" + NUM + "[^\\n]*?(?:surge|boost|included)", "i");
// [ \t] not \s: a label must be on the same line, or "Trip" on the next line is stolen.
// Hours: "1 hr 20 mins", "1h20min", "1h 20m", "1hr20", "2 hrs".
const LEG_SRC = "(?:([0-9]+)[ \\t]*(?:hours?|hrs?|h)(?![A-Za-z])[ \\t]*(?:([0-9]+)[ \\t]*(?:minutes?|mins?|m)?(?![A-Za-z]))?|" +
  NUM + "[ \\t]*(?:mins?|minutes?))" +
  "[ \\t]*[(\\[·•,-]?[ \\t]*" + NUM + "[ \\t]*(mi|miles?|km)\\b\\)?[ \\t]*(away|trip|pickup)?";
const RATING = new RegExp(NUM + "\\s*[★*]");
// Cycle 2 fare zone. Ride-type names and badges that make up a product-label line ("UberX",
// "Comfort Electric", "UberX · Exclusive"). A guess at real layouts; the one shared list.
// Attempt 2: "Uber" may stand before any name ("Uber X", "Uber-X", "Uber Comfort"); "Uber" or "X" alone count too.
const PRODUCT_CORE = "x[ \\t]+share|comfort[ \\t]+electric|xl|x|comfort|green|exec|executive|lux|black|pet|access|" +
  "assist|wav|exclusive|priority|share|electric|taxi";
const PRODUCT_NAMES = "uber[ \\t-]*(?:" + PRODUCT_CORE + ")|uber|" + PRODUCT_CORE;
// A product-label line: only names from that list, separators, and optionally the fare amount.
const PRODUCT_LABEL = new RegExp(
  "^(?:[^A-Za-z0-9£]|£[ \\t]?[0-9OoIl]+(?:[.,][0-9OoIl]{1,2})?|\\b(?:" + PRODUCT_NAMES + ")\\b)*$", "i");
// The anchor needs a ride-type name: a line of badges only ("Exclusive", "Priority") can sit
// below the fare, so it is card text but never the anchor.
const PRODUCT_BADGES = /\b(?:exclusive|priority)\b/gi;
const PRODUCT_WORD = new RegExp("\\b(?:" + PRODUCT_NAMES + ")\\b", "i");
// A label glued to the (unreadable) fare: "UberX9.80", "UberXE12.40", "UberX E12.40".
const GLUED_LABEL = /^[^A-Za-z0-9]*uber[ \t-]*xl?[ \t]?[A-Za-z]?[ \t]?[0-9£€$]/i;
// At most this many non-blank lines between the label and the first leg (ratings and badge-only lines
// not counted). A label further up is not this card's: no fare.
const ZONE_MAX_LINES = 3;
// A rider-price caption: the amount on the line, or next to it, is what the rider pays.
const RIDER_PRICE = /\b(?:riders?|customer pays|you paid|total paid)\b/i;
const RATING_ONLY = /^[^A-Za-z0-9£]*[0-9OoIl][.,][0-9OoIl]{1,2}[ \t]*[★*xX%]?[^A-Za-z0-9£]*$/;
// Card text: once numbers (with OCR's O/o/I/l), these words and lone letters are removed, a card-text
// line holds only ASCII punctuation, spaces and a few symbols. Any other letter, in any script, means
// ordinary words (notification, pill, banner). A status-bar line (clock or battery %) isn't card text.
const CARD_WORDS = new RegExp(
  "\\b(?:" + PRODUCT_NAMES + "|uber|accept|mins?|minutes?|mi|miles?|km|hrs?|hours?|away|trip|pickup|" +
  "surge|boost|includes?|included|incl|per)\\b", "gi");
const LONE_LETTER = /\b[A-Za-z]\b/g;
const OCR_NUMBER = /[0-9OoIl]*[0-9][0-9OoIl]*/g; // "4.9l", "£1O.80": digits OCR misread
const CARD_CHARS = /^[\x00-\x40\x5b-\x60\x7b-\x7f\u00a0\u00a3\u00b7\u2013\u2014\u2022\u200e\u200f\u20ac\u2605]*$/;
// A battery % never follows a decimal point: "4.90 %" is a rating whose star OCR read as "%".
const STATUS_BAR = /(?:^|[^0-9])[0-9]{1,2}:[0-9]{2}(?![0-9])|(?:^|[^0-9.,])[0-9]{1,3}[ \t]?%/;
const productLabelLine = (line) =>
  GLUED_LABEL.test(line) || (PRODUCT_WORD.test(line.replace(PRODUCT_BADGES, " ")) && PRODUCT_LABEL.test(line));
const cardTextLine = (line) =>
  !STATUS_BAR.test(line) && CARD_CHARS.test(line.replace(OCR_NUMBER, " ").replace(CARD_WORDS, "").replace(LONE_LETTER, ""));
const isBlank = (line) => /^[ \t\r\f\v]*$/.test(line);
// A non-blank line that counts towards ZONE_MAX_LINES (not a rating, not a badge-only line).
const windowCounted = (line) => !isBlank(line) && !RATING_ONLY.test(line) &&
  !(/\b(?:exclusive|priority)\b/i.test(line) && PRODUCT_LABEL.test(line));
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
  // nb[n]: how many non-blank lines come before line n; nonblank: indices of non-blank lines.
  const nb = [], nonblank = [];
  for (let n = 0; n < starts.length; n++) {
    nb.push(nonblank.length);
    if (!/^[ \t\r\f\v]*$/.test(line(n))) nonblank.push(n);
  }
  const neighbours = (n) => { // the non-blank lines just before and just after line n
    const k = nb[n], out = [];
    if (k > 0) out.push(line(nonblank[k - 1]));
    const j = k < nonblank.length && nonblank[k] === n ? k + 1 : k;
    if (j < nonblank.length) out.push(line(nonblank[j]));
    return out;
  };
  return { starts, no, line, nb, neighbours };
}

function plausible(value, legs) {
  const miles = legs.reduce((a, l) => a + l[2], 0), mins = legs.reduce((a, l) => a + l[1], 0);
  if (miles <= 0) return true;
  const top = FARE_MAX_BASE + FARE_MAX_PER_MILE * miles + FARE_MAX_PER_MIN * mins;
  return FARE_MIN_PER_MILE * miles <= value && value <= top;
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

// The fare zone (a product label above the legs): the label line, the lines between it and the first
// leg, and the Accept-button line below the legs. Amounts above the label or below the Accept line are
// outside the card and ignored. Between the legs and the Accept line (or the end of the text) another
// product label, or an amount that differs from the card's, may be a second offer cut off: refuse.
function fareFromZone(o, L, fares, label, anchorLine, first, last) {
  const lastLine = L.no(last), nLines = L.starts.length;
  let acceptLine = null;
  for (let n = lastLine + 1; n < nLines; n++) if (ACCEPT.test(L.line(n))) { acceptLine = n; break; }
  const cardEnd = acceptLine !== null ? acceptLine : nLines;
  const zoneStart = L.starts[label];
  const zone = fares.filter((c) => zoneStart <= c[0] && c[0] < first && !c[3]); // Accept counts only below the legs
  const accept = fares.filter((c) => acceptLine !== null && L.no(c[0]) === acceptLine);
  const below = fares.filter((c) => c[0] > last && L.no(c[0]) < cardEnd);
  let garbled = false;
  for (let n = label + 1; n < anchorLine; n++) if (garbledFareLine(L.line(n))) garbled = true;
  const values = new Set([...zone.map((c) => c[2]), ...accept.map((c) => c[2])]);
  let labelBelow = false;
  for (let n = lastLine + 1; n < cardEnd; n++) if (productLabelLine(L.line(n))) labelBelow = true;
  if (below.some((c) => !values.has(c[2])) || labelBelow) o.warnings.push("fare_ambiguous"); // a second offer below
  else if (values.size > 1) o.warnings.push("fare_ambiguous");
  else if (accept.length) o.fare = accept[0][2]; // the Accept button: the card's own fare
  else if (garbled) o.warnings.push("fare_unreadable"); // the card's own fare line is misread: don't substitute
  else if (zone.length) o.fare = zone[0][2];
  else o.warnings.push("fare_missing"); // never look above the label
}

// No product label: the cycle-1 rules, but the window stops at the nearest line above the legs that is
// not card text (status bar, notification, pill, banner); nothing at or above it counts.
function fareWithoutLabel(o, L, allFares, used, first, anchorLine) {
  let cut = -1;
  for (let n = anchorLine - 1; n >= 0; n--) if (!isBlank(L.line(n)) && !cardTextLine(L.line(n))) { cut = n; break; }
  const fares = allFares.filter((c) => L.no(c[0]) > cut);
  if (fares.some((c) => c[3] && c[0] < first)) { o.warnings.push("fare_ambiguous"); return; } // another card's Accept
  if (new Set(fares.map((c) => c[2])).size > 1) { o.warnings.push("fare_ambiguous"); return; } // only a lone amount
  const anchorNb = L.nb[anchorLine];
  const plaus = fares.filter((c) => plausible(c[2], used));
  const onAccept = new Set(plaus.filter((c) => c[3]).map((c) => c[2]));
  const near = fares.filter((c) => c[0] < first && anchorNb - c[1] <= FARE_WINDOW_LINES);
  const after = near.length ? near[near.length - 1][0] : -1;
  let garbled = false;
  for (let n = cut + 1; n < anchorLine; n++)
    if (L.starts[n] > after && anchorNb - L.nb[n] <= FARE_WINDOW_LINES && garbledFareLine(L.line(n))) garbled = true;
  if (onAccept.size) {
    // The amount on the Accept button is the card's own fare; a different fare above the legs too: refuse.
    const v = [...onAccept][0];
    if (onAccept.size === 1 && !(near.length && near[near.length - 1][2] !== v)) o.fare = v;
    else o.warnings.push("fare_ambiguous");
  } else if (garbled) {
    o.warnings.push("fare_unreadable"); // the card's own fare line is misread: don't substitute
  } else if (near.length) {
    const pick = near[near.length - 1];
    // Another plausible fare elsewhere on the screen: never guess between them.
    if (plaus.some((c) => c !== pick && c[2] !== pick[2])) o.warnings.push("fare_ambiguous");
    else o.fare = pick[2];
  } else if (fares.length) {
    o.warnings.push("fare_not_near_legs");
  }
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
    const inside = unl.filter((l) => lo < l[3] && l[3] < hi);
    if (unl.length > inside.length) o.warnings.push("unlabelled_leg_ignored"); // outside the card (navigation, etc.)
    unl = [];
    if (inside.length) {
      // A stop leg between pickup and trip (multi-stop): the trip total is unclear, the pickup isn't.
      o.warnings.push("extra_leg");
      trips.length = 0;
      used = [pickups[0]];
    } else {
      used = [pickups[0], trips[0]];
    }
  } else if (legs.length > 2) {
    // Several offers on one screen (e.g. a Trip Radar list): can't tell which one is meant.
    return refuseAll(o, "multiple_offers");
  } else {
    used = legs;
  }

  // Fare candidates: £ amounts on a card-fare-shaped line (see FARE_WORDS); not the surge,
  // an add-on ("+£5.00 airport fee"), a rate, a promo/payment/earnings line or the earnings pill.
  const fares = []; // [position, non-blank line number, value, on the Accept line]
  let rangeSeen = false;
  const fareRe = new RegExp(FARE_SRC, "g");
  while ((m = fareRe.exec(text))) {
    if (sm && sm.index <= m.index && m.index < sm.index + sm[0].length) continue;
    if (!hasDigit(m[1])) continue;
    const n = L.no(m.index);
    const line = L.line(n);
    const lineEnd = L.starts[n] + line.length;
    const prefix = line.slice(0, m.index - L.starts[n]);
    if (NOT_FARE.test(line) || !FARE_PREFIX_OK.test(prefix) || prefix.trimEnd().endsWith("+")) continue;
    let end = m.index + m[0].length;
    if (matchAt(RATE_AFTER, text, end)) continue;
    let value = f(ocrDigits(m[1]));
    const rng = matchAt(RANGE_AFTER, text, end);
    if (rng) { value = Math.min(value, f(rng[1])); end = rng.index + rng[0].length; } // lower, guaranteed end
    const legOnLine = legs.find((l) => end <= l[3] && l[3] < lineEnd);
    if (!FARE_TRAIL_OK.test(text.slice(end, legOnLine ? legOnLine[3] : lineEnd))) continue;
    if (L.neighbours(n).some((x) => PILL_LABEL.test(x))) continue;
    if (RIDER_PRICE.test(line) || L.neighbours(n).some((x) => RIDER_PRICE.test(x))) continue; // the rider's price
    rangeSeen = rangeSeen || !!rng;
    fares.push([m.index, L.nb[n], value, ACCEPT.test(line)]);
  }

  if (used.length) {
    const first = Math.min(...used.map((l) => l[3])), last = Math.max(...used.map((l) => l[3]));
    if (fares.some((c) => first < c[0] && c[0] < last)) return refuseAll(o, "multiple_offers"); // stacked offers
    const anchorLine = L.no(first);
    let label = null;
    for (let n = anchorLine - 1; n >= 0; n--) if (productLabelLine(L.line(n))) { label = n; break; }
    let counted = 0;
    if (label !== null) for (let n = label + 1; n < anchorLine; n++) if (windowCounted(L.line(n))) counted++;
    if (label !== null && counted > ZONE_MAX_LINES) o.warnings.push("fare_label_too_far"); // not this card's label
    else if (label !== null) fareFromZone(o, L, fares, label, anchorLine, first, last);
    else fareWithoutLabel(o, L, fares, used, first, anchorLine);
  } else if (fares.length) {
    let values = new Set(fares.filter((c) => c[3]).map((c) => c[2]));
    if (!values.size) values = new Set(fares.map((c) => c[2]));
    if (values.size === 1) o.fare = [...values][0];
    else o.warnings.push("fare_ambiguous");
  }
  if (rangeSeen && o.fare !== null) o.warnings.push("fare_range_low_end");

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

// ---- Second signal for screenshots (attempt 2): text height. On a real offer card the fare is by far the
// tallest text on screen; pills, notifications and captions are small. Pure function, no DOM.
// lines: [{text, height}] from the OCR (height = bbox y1 - y0, any scale). Returns the fare or null.
// The fare is the £ amount on the tallest line that holds a money-shaped amount, only if:
//   - that line is at least GEO_MEDIAN_RATIO (1.5) times the median height of all text lines, and
//   - it is at least GEO_MARGIN (1.25) times as tall as every other money-shaped line (25% margin), and
//   - it holds exactly one distinct £ amount (not a rate "£1.10/mi", not an add-on "+£2.00").
// A money-shaped line without a £ (a misread "E14.20", a rating "4.92") can be the tallest: then null.
export const GEO_MEDIAN_RATIO = 1.5, GEO_MARGIN = 1.25;
const MONEY_SHAPED = /(?:^|[^0-9A-Za-z.,])[0-9OoIl]{1,3}[.,][0-9OoIl]{2}(?![0-9])/;
export function fareFromLines(lines) {
  if (!Array.isArray(lines)) return null;
  const rows = [];
  for (const l of lines) {
    const text = unicodeDigits(String((l && l.text) || "")).replace(/[\r\n]+/g, " ");
    const h = Number(l && l.height);
    if (text.trim() && Number.isFinite(h) && h > 0) rows.push({ text, h });
  }
  if (rows.length < 3) return null;
  const hs = rows.map((r) => r.h).sort((a, b) => a - b);
  const k = hs.length >> 1;
  const median = hs.length % 2 ? hs[k] : (hs[k - 1] + hs[k]) / 2;
  const money = rows.filter((r) => MONEY_SHAPED.test(r.text) || new RegExp(FARE_SRC).test(r.text));
  if (!money.length) return null;
  let top = money[0];
  for (const r of money) if (r.h > top.h) top = r;
  if (top.h < GEO_MEDIAN_RATIO * median) return null;
  if (money.some((r) => r !== top && r.h * GEO_MARGIN > top.h)) return null;
  const values = new Set();
  const re = new RegExp(FARE_SRC, "g");
  let m;
  while ((m = re.exec(top.text))) {
    if (!hasDigit(m[1])) continue;
    const end = m.index + m[0].length;
    if (matchAt(RATE_AFTER, top.text, end)) continue; // "£1.10/mi"
    if (top.text.slice(0, m.index).trimEnd().endsWith("+")) continue; // "+£2.00" add-on
    values.add(f(ocrDigits(m[1])));
  }
  return values.size === 1 ? [...values][0] : null;
}

// Screenshot scans: the text rules' fare and the height fare must agree, or the fare goes to manual entry.
// geoFare undefined means no geometry (pasted text): the text rules alone decide.
export function reconcileScanFare(offer, geoFare) {
  if (geoFare === undefined) return offer;
  const o = { ...offer, warnings: [...offer.warnings] };
  if (o.fare === null || geoFare === null || Math.abs(o.fare - geoFare) > 0.005) {
    if (o.fare !== null || geoFare !== null) o.warnings.push("fare_height_disagrees");
    o.fare = null;
    o.missing = REQUIRED.filter((x) => o[x] === null);
    if (!o.warnings.includes("needs_manual_entry")) o.warnings.push("needs_manual_entry");
  }
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
  // A leg that covers miles in no time (or any negative value) is a typing or reading error,
  // not a sky-high £/h. Same rule in fairfare/verdict.py estimate().
  for (const [mins, miles] of [[o.pickup_min, o.pickup_miles], [o.trip_min, o.trip_miles]])
    if (mins < 0 || miles < 0 || (mins <= 0 && miles > 0))
      return { decision: "UNKNOWN", confidence: "low", reasons: ["zero_minute_leg"], missing: [] };
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
