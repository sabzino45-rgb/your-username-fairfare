// Scan images through the app's #scan-file and print verdict + readout. Usage: node scan.js out.json img1 img2 ...
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = "http://localhost:8798/";
(async () => {
  const [out, ...files] = process.argv.slice(2);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + "#check"); await p.waitForSelector("#verdict");
  const rows = [];
  for (const file of files) {
    await p.click("[data-mode=scan]");
    await p.setInputFiles("#scan-file", file);
    await p.waitForFunction(() => document.querySelector("#verdict")?.dataset.d === "READING", null, { timeout: 5000 }).catch(() => {});
    await p.waitForFunction(() => document.querySelector("#verdict")?.dataset.d !== "READING", null, { timeout: 180000 }).catch(() => {});
    const readout = await p.$eval("#verdict", (e) => (e.querySelector(".readout") || {}).textContent || "");
    const text = await p.$eval("#ocr", (e) => e.value);
    const parsed = await p.evaluate(async (t) => { const m = await import("./js/engine.js"); const o = m.parseOfferText(t); return { f: [o.fare, o.pickup_min, o.pickup_miles, o.trip_min, o.trip_miles], w: o.warnings }; }, text);
    rows.push({ file: file.split("/").pop(), word: await p.$eval("#verdict", (e) => e.dataset.d), readout, parsed, text });
  }
  fs.writeFileSync(out, JSON.stringify({ rows, errs }, null, 1));
  for (const r of rows) console.log(r.file, r.word, "|", r.readout, "|", JSON.stringify(r.parsed));
  console.log("errors:", errs);
  await b.close();
})();
