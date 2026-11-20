// FairFare engine: offer parser + verdict model.
// JavaScript port of fairfare/parser.py and fairfare/verdict.py, extended with the
// driver settings from the app (optimise for, commission, minimum per mile, shift goal).
// tests/test_js_parity.py checks this file against the Python engine on the eval set.

export const KM_PER_MILE = 1.609344;
export const REQUIRED = ["fare", "pickup_min", "pickup_miles", "trip_min", "trip_miles"];
const NUM = "(\\d+(?:[.,]\\d+)?)";
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
// Same rules as fairfare/parser.py (_FARE, _NOT_FARE, _NOT_LEG, _FARE_WINDOW_LINES).
// OCR reads 0 as O/o and 1 as l/I inside a number; the amount must end cleanly or it isn't trusted.
const FARE_SRC = "£\\s?([0-9][0-9OoIl]*(?:[.,][0-9OoIl]{1,2})?)(?![A-Za-z0-9]|[.,][0-9OoIl])";
const ocrDigits = (s) => s.replace(/[Oo]/g, "0").replace(/[Il]/g, "1");
const NOT_FARE = new RegExp(
  "\\b(?:off|discount|promo|code|voucher|coupon|save|saved|earned|today|week|weekly|" +
  "balance|cash ?out|tips?|bonus|quest|reward|refer|cashback|credit|wallet|extra|" +
  "surge|boost|includes?|included|incl)\\b", "i");
const NOT_LEG = /\b(?:arriv\w*|eta|remaining|destination|route|to go)\b/i;
const FARE_WINDOW_LINES = 4;
// Line number and full line containing position pos.
function lineAt(text, pos) {
  const start = text.lastIndexOf("\n", pos - 1) + 1;
  const end = text.indexOf("\n", pos);
  return [text.slice(0, pos).split("\n").length - 1, end === -1 ? text.slice(start) : text.slice(start, end)];
}

export function emptyOffer(source = "scan") {
  return { fare: null, pickup_min: null, pickup_miles: null, trip_min: null, trip_miles: null,
           surge: null, rider_rating: null, source, warnings: [], missing: [...REQUIRED] };
}

// Returns numbers only. Raw text, rider names and addresses never leave this function.
export function parseOfferText(text) {
  const o = emptyOffer("scan");
  if (!text || !text.trim()) { o.warnings.push("empty_text"); return o; }

  const sm = new RegExp("\\+\\s?£\\s?" + NUM + "[^\\n]*?(?:surge|boost|included)", "i").exec(text);
  if (sm) o.surge = f(sm[1]);

  // [ \t] not \s: a label must be on the same line, or "Trip" on the next line is stolen.
  const legRe = new RegExp(NUM + "[ \\t]*(?:mins?|minutes?)[ \\t]*[(\\[·•,-]?[ \\t]*" + NUM +
                           "[ \\t]*(mi|miles?|km)\\b\\)?[ \\t]*(away|trip|pickup)?", "gi");
  const legs = [];
  let m;
  while ((m = legRe.exec(text))) {
    if (NOT_LEG.test(lineAt(text, m.index)[1])) continue; // navigation bar, not an offer leg
    let label = (m[4] || "").toLowerCase();
    const before = text.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    if (!label) label = before.includes("pickup") ? "pickup" : before.includes("trip") ? "trip" : "";
    const d = f(m[2]);
    legs.push([label, f(m[1]), m[3].toLowerCase().startsWith("km") ? d / KM_PER_MILE : d, m.index]);
  }

  if (legs.length > 2) {
    // Several offers on one screen (e.g. a Trip Radar list): can't tell which one is meant.
    o.surge = null;
    o.warnings.push("multiple_offers");
    o.warnings.push("needs_manual_entry");
    return o;
  }

  // Fare candidates: £ amounts that are not the surge line and not on a promo/earnings/tip line.
  const fareRe = new RegExp(FARE_SRC, "g");
  const fares = [];
  while ((m = fareRe.exec(text))) {
    if (sm && sm.index <= m.index && m.index < sm.index + sm[0].length) continue;
    const [lineNo, line] = lineAt(text, m.index);
    if (NOT_FARE.test(line)) continue;
    fares.push([m.index, lineNo, f(ocrDigits(m[1]))]);
  }
  if (legs.length) {
    // The fare is the nearest candidate above the first leg, within the card.
    const anchor = Math.min(...legs.map((l) => l[3]));
    const anchorLine = lineAt(text, anchor)[0];
    const near = fares.filter((c) => c[0] < anchor && anchorLine - c[1] <= FARE_WINDOW_LINES);
    if (near.length) o.fare = near[near.length - 1][2];
    else if (fares.length) o.warnings.push("fare_not_near_legs");
  } else if (fares.length) {
    if (new Set(fares.map((c) => c[2])).size === 1) o.fare = fares[0][2];
    else o.warnings.push("fare_ambiguous");
  }

  let pickup = legs.find((l) => l[0] === "away" || l[0] === "pickup") || null;
  let trip = legs.find((l) => l[0] === "trip") || null;
  const unl = legs.filter((l) => l[0] === "");
  if (!pickup && unl.length) { pickup = unl.shift(); o.warnings.push("pickup_inferred_from_order"); }
  if (!trip && unl.length) { trip = unl.shift(); o.warnings.push("trip_inferred_from_order"); }
  if (pickup) { o.pickup_min = pickup[1]; o.pickup_miles = r2(pickup[2]); }
  if (trip) { o.trip_min = trip[1]; o.trip_miles = r2(trip[2]); }

  const rr = new RegExp(NUM + "\\s*[★*]").exec(text);
  if (rr && f(rr[1]) >= 1 && f(rr[1]) <= 5) o.rider_rating = f(rr[1]);

  if (o.fare !== null && !(o.fare >= 1 && o.fare <= 1000)) { o.warnings.push("fare_out_of_range"); o.fare = null; }
  for (const leg of ["pickup", "trip"]) {
    const mins = o[leg + "_min"], miles = o[leg + "_miles"];
    if (mins !== null && miles !== null && mins > 0 && miles / (mins / 60) > 90) {
      o.warnings.push(leg + "_speed_implausible");
      o[leg + "_min"] = null;
      o[leg + "_miles"] = null;
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
