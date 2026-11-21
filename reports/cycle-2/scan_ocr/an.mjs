import { parseOfferText, estimate, manualOffer, DEFAULT_SETTINGS } from "file:///home/user/fairfare/app/js/engine.js";
import fs from "fs";
const { rows } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const r of rows) {
  const o = parseOfferText(r.text);
  const m = /£\s?([0-9]+\.[0-9]{2})/.exec(r.readout.split("·")[0]);
  const appFare = m ? Number(m[1]) : null;
  const legs = { pickup_min: o.pickup_min, pickup_miles: o.pickup_miles, trip_min: o.trip_min, trip_miles: o.trip_miles };
  const real = estimate(manualOffer({ fare: r.real, ...legs }), DEFAULT_SETTINGS).decision;
  const truth = r.truth === null ? "UNKNOWN" : real;
  console.log([r.id, r.dark ? "dark" : "light", "textFare=" + o.fare, "appFare=" + appFare, "truthFare=" + r.truth,
    "legs=" + [o.pickup_min, o.pickup_miles, o.trip_min, o.trip_miles].join("/"), "app=" + r.word, "truth=" + truth, "real=" + real,
    r.word === "ACCEPT" && truth !== "ACCEPT" ? "FALSE_ACCEPT" : "", r.ms + "ms"].join("  "));
}
