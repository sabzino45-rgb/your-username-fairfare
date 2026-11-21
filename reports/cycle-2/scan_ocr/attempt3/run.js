// Real OCR through the app: draw my own cards (light + dark), scan via #scan-file, record the app's fare and verdict.
const { chromium } = require("playwright");
const fs = require("fs");
const CARDS = require("./cards.js"), draw = require("./draw.js");
const BASE = "http://localhost:8778/";
(async () => {
  const b = await chromium.launch();
  const rp = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const reqs = []; ctx.on("request", (q) => reqs.push(q.url()));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + "#check"); await p.waitForSelector("#verdict");
  const rows = [];
  for (const [id, c] of Object.entries(CARDS)) for (const dark of [false, true]) {
    await rp.setContent(draw(c, dark));
    const file = `${__dirname}/${id}-${dark ? "dark" : "light"}.png`;
    await rp.screenshot({ path: file });
    await p.click("[data-mode=scan]");
    const t0 = Date.now();
    await p.setInputFiles("#scan-file", file);
    await p.waitForFunction(() => document.querySelector("#verdict")?.dataset.d === "READING", null, { timeout: 5000 }).catch(() => {});
    await p.waitForFunction(() => document.querySelector("#verdict")?.dataset.d !== "READING", null, { timeout: 120000 }).catch(() => {});
    const readout = await p.$eval("#verdict", (e) => (e.querySelector(".readout") || {}).textContent || "");
    rows.push({ id, dark, truth: c.truth, appExpected: "app" in c ? c.app : c.truth, ms: Date.now() - t0,
                word: await p.$eval("#verdict", (e) => e.dataset.d), readout, text: await p.$eval("#ocr", (e) => e.value) });
  }
  const ext = [...new Set(reqs.filter((u) => !u.startsWith(BASE) && !u.startsWith("blob:") && !u.startsWith("data:")).map((u) => new URL(u).host))];
  fs.writeFileSync(`${__dirname}/result.json`, JSON.stringify({ rows, ext, errs }, null, 1));
  console.log("done", rows.length, "external:", ext, "errors:", errs);
  await b.close();
})();
