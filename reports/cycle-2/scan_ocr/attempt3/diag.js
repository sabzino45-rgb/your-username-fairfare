const { chromium } = require("playwright");
const fs = require("fs");
const CARDS = require("./cards.js"), draw = require("./draw.js");
(async () => {
  const b = await chromium.launch();
  const rp = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const p = await (await b.newContext()).newPage();
  await p.goto("http://localhost:8778/diag.html"); await p.waitForFunction(() => window.ready);
  const out = [];
  for (const [id, c] of Object.entries(CARDS)) for (const dark of [false, true]) {
    await rp.setContent(draw(c, dark));
    const png = (await rp.screenshot()).toString("base64");
    fs.writeFileSync(`${__dirname}/${id}-${dark ? "dark" : "light"}.png`, Buffer.from(png, "base64"));
    for (const clean of (process.env.BOTH ? [false, true] : [true])) {
      const r = await p.evaluate(([u, cl]) => window.diag(u, cl), ["data:image/png;base64," + png, clean]);
      out.push({ id, dark, clean, ...r });
    }
  }
  fs.writeFileSync(`${__dirname}/diag.json`, JSON.stringify(out, null, 1));
  await b.close();
})();
