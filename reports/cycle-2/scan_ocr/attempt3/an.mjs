import { parseOfferText, estimate, manualOffer, DEFAULT_SETTINGS } from "file:///home/user/fairfare/app/js/engine.js";
import fs from "fs";
const { rows } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let fa = 0, readable = 0, manual = 0, normal = 0, normalManual = 0, wrong = 0;
for (const r of rows) {
  const o = parseOfferText(r.text);
  const m = /£\s?([0-9]+\.[0-9]{2})/.exec(r.readout.split("·")[0]);
  const appFare = m ? Number(m[1]) : null;
  const legs = { pickup_min: o.pickup_min, pickup_miles: o.pickup_miles, trip_min: o.trip_min, trip_miles: o.trip_miles };
  const truth = r.truth === null ? "UNKNOWN" : estimate(manualOffer({ fare: r.truth, ...legs }), DEFAULT_SETTINGS).decision;
  const falseAccept = r.word === "ACCEPT" && truth !== "ACCEPT";
  fa += falseAccept;
  if (appFare !== null && Math.abs(appFare - r.truth) > 0.005) wrong++;
  if (r.truth !== null) { readable++; manual += r.word === "UNKNOWN"; }
  if (r.appExpected !== null) { normal++; normalManual += r.word === "UNKNOWN"; }
  console.log([r.id.padEnd(19), r.dark ? "dark " : "light", "textFare=" + o.fare, "appFare=" + appFare, "truth=" + r.truth,
    "app=" + r.word, "truthVerdict=" + truth, falseAccept ? "FALSE_ACCEPT" : "", r.ms + "ms"].join("  "));
}
console.log({ scans: rows.length, falseAccepts: fa, wrongFares: wrong, readableManual: `${manual}/${readable}`, normalCardsManual: `${normalManual}/${normal}` });
