// FairFare engine: offer parser + verdict model.
// JavaScript port of fairfare/parser.py and fairfare/verdict.py, extended with the
// driver settings from the app (optimise for, commission, minimum per mile, shift goal).
// tests/test_js_parity.py checks this file against the Python engine on the eval set.

export const KM_PER_MILE = 1.609344;
export const REQUIRED = ["fare", "pickup_min", "pickup_miles", "trip_min", "trip_miles"];
const NUM = "(\\d+(?:[.,]\\d+)?)";
const f = (s) => parseFloat(String(s).replace(",", "."));
const r2 = (x) => Math.round(x * 100) / 100;

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
  const fareRe = new RegExp("£\\s?" + NUM, "g");
  let m;
  while ((m = fareRe.exec(text))) {
    if (sm && sm.index <= m.index && m.index < sm.index + sm[0].length) continue;
    o.fare = f(m[1]);
    break;
  }

  // [ \t] not \s: a label must be on the same line, or "Trip" on the next line is stolen.
  const legRe = new RegExp(NUM + "[ \\t]*(?:mins?|minutes?)[ \\t]*[(\\[·•,-]?[ \\t]*" + NUM +
                           "[ \\t]*(mi|miles?|km)\\b\\)?[ \\t]*(away|trip|pickup)?", "gi");
  const legs = [];
  while ((m = legRe.exec(text))) {
    let label = (m[4] || "").toLowerCase();
    const before = text.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    if (!label) label = before.includes("pickup") ? "pickup" : before.includes("trip") ? "trip" : "";
    const d = f(m[2]);
    legs.push([label, f(m[1]), m[3].toLowerCase().startsWith("km") ? d / KM_PER_MILE : d]);
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
