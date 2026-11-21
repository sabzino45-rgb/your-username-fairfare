// Scan engineer, cycle 2 attempt 2: render my own cards (light + dark), scan via #scan-file, record the result.
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = "http://localhost:8776/";
const OUT = __dirname;
// Each card: top lines (above the card, e.g. status bar and pills) and card lines. [text, style]
const CARDS = {
  k1_plain:        { truth: 12.40, top: [["10:02 4G 61%", "status"]], card: [["UberX", "label"], ["£12.40", "fare"], ["4.92 ★", "small"], ["6 mins (1.8 mi) away", "leg"], ["18 mins (7.2 mi) trip", "leg"], ["Accept", "accept"]] },
  k2_badge_pill:   { truth: 14.20, top: [["09:40 5G 72%", "status"], ["£58.40", "pill"], ["Gold", "small"]], card: [["UberX", "label"], ["£14.20", "badge"], ["4.90 ★", "small"], ["6 mins (2.1 mi) away", "leg"], ["24 mins (9.8 mi) trip", "leg"], ["Accept", "accept"]] },
  k3_misspelt_pill:{ truth: 13.80, top: [["11:15 4G 55%", "status"], ["£63.20", "pill"], ["Today", "small"]], card: [["Uber X", "label"], ["£13.80", "fare"], ["4.88 ★", "small"], ["5 mins (1.7 mi) away", "leg"], ["21 mins (8.9 mi) trip", "leg"], ["Accept", "accept"]] },
  k4_rider_pays:   { truth: 10.40, top: [["12:30 4G 80%", "status"]], card: [["UberX", "label"], ["£10.40", "fare"], ["£16.00", "small"], ["Rider pays", "small"], ["5 mins (1.7 mi) away", "leg"], ["15 mins (5.9 mi) trip", "leg"], ["Accept", "accept"]] },
  k5_badge_misspelt:{ truth: 15.60, top: [["13:05 5G 47%", "status"], ["£71.90", "pill"], ["Online", "small"]], card: [["Uber Comfort", "label"], ["£15.60", "badge"], ["4.93 ★", "small"], ["4 mins (1.6 mi) away", "leg"], ["20 mins (8.5 mi) trip", "leg"], ["Accept", "accept"]] },
  k6_other_accept: { truth: 8.20, top: [["14:20 4G 63%", "status"], ["Accept £31.50", "accept"]], card: [["Uber X", "label"], ["£8.20", "fare"], ["4.92 ★", "small"], ["4 mins (1.2 mi) away", "leg"], ["13 mins (4.6 mi) trip", "leg"], ["Accept", "accept"]] },
  k7_no_label:     { truth: 11.60, top: [["15:45 4G 39%", "status"]], card: [["£11.60", "fare"], ["4.90 ★", "small"], ["4 mins (1.5 mi) away", "leg"], ["14 mins (5.5 mi) trip", "leg"], ["Accept", "accept"]] },
  k8_fare_absent:  { truth: null, real: 12.90, top: [["16:10 5G 58%", "status"], ["£49.30", "pill"], ["Platinum", "small"]], card: [["UberX", "label"], ["4.89 ★", "small"], ["5 mins (1.9 mi) away", "leg"], ["17 mins (7.3 mi) trip", "leg"], ["Accept", "accept"]] },
  k10_chip_badge:  { truth: null, real: 12.70, top: [["18:10 4G 52%", "status"], ["UberX · Comfort", "label"], ["£47.20", "pilltext"]], card: [["£12.70", "badge"], ["4.91 ★", "small"], ["5 mins (1.8 mi) away", "leg"], ["17 mins (7.1 mi) trip", "leg"], ["Accept", "accept"]] },
  k11_pill_no_label:{ truth: null, real: 11.30, top: [["19:25 5G 61%", "status"], ["£52.60", "pilltext"]], card: [["4.88 ★", "small"], ["5 mins (1.7 mi) away", "leg"], ["16 mins (6.2 mi) trip", "leg"], ["Accept", "accept"]] },
  k9_badge_glued:  { truth: 9.80, top: [["17:00 4G 44%", "status"], ["£54.20", "pill"], ["Streak", "small"]], card: [["UberX", "label"], ["£9.80", "badge"], ["4.86 ★", "small"], ["4 mins (1.3 mi) away", "leg"], ["13 mins (5.0 mi) trip", "leg"], ["Accept", "accept"]] },
};
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function style(kind, dark) {
  const fg = dark ? "#fff" : "#000";
  switch (kind) {
    case "status": return `font-size:13px;color:${fg}`;
    case "pill": return `display:inline-block;font-size:16px;font-weight:700;background:${dark ? "#fff" : "#000"};color:${dark ? "#000" : "#fff"};padding:6px 14px;border-radius:18px`;
    case "pilltext": return `font-size:22px;font-weight:700;color:${fg}`;
    case "label": return `font-size:18px;font-weight:700;color:${fg}`;
    case "fare": return `font-size:36px;font-weight:700;color:${fg}`;
    case "badge": return `display:inline-block;font-size:36px;font-weight:700;background:#2e9e5b;color:#fff;padding:2px 12px;border-radius:8px`;
    case "accept": return `display:inline-block;font-size:18px;font-weight:700;background:${dark ? "#fff" : "#000"};color:${dark ? "#000" : "#fff"};padding:8px 28px;border-radius:8px`;
    default: return `font-size:${kind === "leg" ? 17 : 15}px;color:${fg}`;
  }
}
const html = (c, dark) => `<html><body style="margin:0;width:390px;height:844px;background:${dark ? "#000" : "#eef0f2"};font-family:sans-serif">
<div style="padding:10px 18px">${c.top.map(([t, k]) => `<div style="margin:6px 0"><span style="${style(k, dark)}">${esc(t)}</span></div>`).join("")}</div>
<div style="position:absolute;bottom:20px;left:12px;right:12px;background:${dark ? "#1c1c1e" : "#fff"};border-radius:14px;padding:16px 18px">
${c.card.map(([t, k]) => `<div style="margin:6px 0"><span style="${style(k, dark)}">${esc(t)}</span></div>`).join("")}</div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const rp = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const reqs = []; ctx.on("request", (q) => reqs.push(q.url()));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + "#check"); await p.waitForSelector("#verdict");
  const rows = [];
  for (const [id, c] of Object.entries(CARDS).filter(([k]) => !process.env.PICK || process.env.PICK.split(',').includes(k))) for (const dark of [false, true]) {
    await rp.setContent(html(c, dark));
    const file = `${OUT}/${id}-${dark ? "dark" : "light"}.png`;
    await rp.screenshot({ path: file });
    await p.click("[data-mode=scan]");
    const t0 = Date.now();
    await p.setInputFiles("#scan-file", file);
    await p.waitForFunction(() => document.querySelector("#verdict")?.dataset.d === "READING", null, { timeout: 5000 }).catch(() => {});
    await p.waitForFunction(() => document.querySelector("#verdict")?.dataset.d !== "READING", null, { timeout: 120000 }).catch(() => {});
    const readout = await p.$eval("#verdict", (e) => (e.querySelector(".readout") || {}).textContent || "");
    rows.push({ id, dark, truth: c.truth, real: c.real ?? c.truth, ms: Date.now() - t0, word: await p.$eval("#verdict", (e) => e.dataset.d),
                readout, text: await p.$eval("#ocr", (e) => e.value) });
  }
  const ext = [...new Set(reqs.filter((u) => !u.startsWith(BASE) && !u.startsWith("blob:") && !u.startsWith("data:")).map((u) => new URL(u).host))];
  fs.writeFileSync(`${OUT}/${process.env.OUTF || 'result.json'}`, JSON.stringify({ rows, ext, errs }, null, 1));
  console.log("done", rows.length, "external:", ext, "errors:", errs);
  await b.close();
})();
