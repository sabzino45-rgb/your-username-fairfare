// Draw replicas of the real Uber UK offer card layout (map top, card bottom). Fictional values and places only.
const { chromium } = require("playwright");
const OUT = process.argv[2];
const CARDS = {
  r1: { label: "UberX", fare: "£24.60", rating: "4.93", sub: "£2.37 est. holiday entitlement included", l1: "9 min (3.1 mi)", a1: "1 Example Road, Sampleton", l2: "19 mins (8.8 mi)", a2: "Testford, AB1 2CD", btn: "Match", truth: [24.6, 9, 3.1, 19, 8.8] },
  r2: { label: "Comfort", fare: "£13.95", rating: "4.88", sub: "£1.00 Clean Air Zone fee included", l1: "5 min (1.7 mi)", a1: "Mock Lane, Demoville", l2: "16 mins (6.1 mi)", a2: "Placeholder Sq, ZZ9 9ZZ", btn: "Match", truth: [13.95, 5, 1.7, 16, 6.1] },
  r3: { label: "UberX Priority", fare: "£41.20", rating: "5.00", sub: "£3.50 tolls included", l1: "11 min (4.4 mi)", a1: "Fictional Way, Nowhere", l2: "33 mins (18.2 mi)", a2: "Imaginary, QQ1 1QQ", btn: "Accept", truth: [41.2, 11, 4.4, 33, 18.2] },
  r4: { label: "UberXL", fare: "£9.85", rating: "4.79", sub: "£0.95 est. holiday entitlement included", l1: "3 min (0.9 mi)", a1: "Sample St, Testbury", l2: "10 mins (3.2 mi)", a2: "Mockham, XY3 4ZW", btn: "Match", truth: [9.85, 3, 0.9, 10, 3.2] },
  r5: { label: "Uber Green", fare: "£18.40", rating: "4.95", sub: "£1.50 tip included", l1: "7 min (2.6 mi)", a1: "Demo Avenue, Exampleby", l2: "14 mins (5.5 mi)", a2: "Trialton, AA1 1AA", btn: "Match", truth: [18.4, 7, 2.6, 14, 5.5] },
  r6: { label: "UberX", fare: "£31.75", rating: "4.90", sub: "£3.06 est. holiday entitlement included", l1: "14 min (6.0 mi)", a1: "Model Close, Fakeley", l2: "21 mins (9.7 mi)", a2: "Pretendon, BB2 2BB", btn: "Match", truth: [31.75, 14, 6.0, 21, 9.7] },
  // adversarial: an uncaptioned amount as big as the fare inside the card -> must not ACCEPT on a wrong number
  x1: { label: "UberX", fare: "£12.10", extraBig: "£45.00", rating: "4.91", sub: "£1.17 est. holiday entitlement included", l1: "6 min (2.0 mi)", a1: "Example Road, Sampleton", l2: "15 mins (5.9 mi)", a2: "Testford, AB1 2CD", btn: "Match", truth: [null, 6, 2.0, 15, 5.9] },
};
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function html(c, dark) {
  const bg = dark ? "#3b4250" : "#e8eaed", card = dark ? "#1f1f1f" : "#ffffff", fg = dark ? "#ffffff" : "#000000";
  const chip = dark ? "#333333" : "#eeeeee", sub = dark ? "#d0d0d0" : "#333333", btnbg = dark ? "#e2e2e2" : "#000000", btnfg = dark ? "#000" : "#fff";
  const big = (t) => `<div style="font-size:52px;font-weight:700;letter-spacing:-2px;line-height:1.1">${esc(t)} <svg width="16" height="16" viewBox="0 0 16 16" style="margin-left:8px;vertical-align:middle"><path d="M8 1 L14 4.5 L14 11.5 L8 15 L2 11.5 L2 4.5 Z" fill="none" stroke="${fg}" stroke-width="1.4"/><path d="M9 3.5 L5.5 8.5 L8 8.5 L7 12.5 L10.5 7.5 L8 7.5 Z" fill="none" stroke="${fg}" stroke-width="1.1"/></svg></div>`;
  return `<html><body style="margin:0;width:390px;height:844px;background:${bg};font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;color:${fg};position:relative;overflow:hidden">
  <svg width="390" height="460" style="position:absolute;top:0;left:0"><path d="M10 80 Q 120 200 90 460" stroke="${dark ? "#2a3a3a" : "#c9d6c9"}" stroke-width="6" fill="none"/><path d="M250 60 Q 230 300 130 440" stroke="${dark ? "#aaa" : "#888"}" stroke-width="7" fill="none"/><path d="M0 220 L390 260" stroke="${dark ? "#4a5160" : "#ffffff"}" stroke-width="4"/></svg>
  <div style="position:absolute;top:14px;left:28px;font-size:16px;font-weight:600">09:41</div>
  <div style="position:absolute;top:150px;left:60px;font-size:13px;color:${dark ? "#9fb4ff" : "#3355aa"}">Sampleton</div>
  <div style="position:absolute;top:340px;left:40px;font-size:10px;background:#1d7a4c;color:#ffe14d;padding:2px 4px;border-radius:3px">B9999</div>
  <div style="position:absolute;bottom:18px;left:14px;right:14px;background:${card};border-radius:16px;border:2px solid ${dark ? "#fff" : "#ddd"};padding:14px 14px">
   <div style="display:inline-block;background:${chip};border-radius:8px;padding:4px 10px;font-size:17px;font-weight:600">● ${esc(c.label)}</div>
   ${big(c.fare)}
   ${c.extraBig ? big(c.extraBig) : ""}
   <div style="margin:6px 0"><span style="background:${chip};border-radius:8px;padding:4px 10px;font-size:16px">★ ${c.rating}</span> <span style="background:${chip};border-radius:8px;padding:4px 10px;font-size:16px">After fees</span></div>
   <div style="margin:10px 0"><span style="background:${chip};border-radius:8px;padding:4px 8px;font-size:15.5px;color:${sub}">${esc(c.sub)}</span></div>
   <hr style="border:0;border-top:1px solid ${dark ? "#444" : "#ddd"}">
   <div style="padding-left:22px;font-size:17px;line-height:1.35;border-left:2px solid ${fg};margin-left:6px">
    <div style="font-weight:600">${esc(c.l1)}</div><div>${esc(c.a1)}</div><div style="font-weight:600">${esc(c.l2)}</div><div>${esc(c.a2)}</div></div>
   <hr style="border:0;border-top:1px solid ${dark ? "#444" : "#ddd"}">
   <div style="background:${btnbg};color:${btnfg};border-radius:8px;text-align:center;font-size:20px;font-weight:700;padding:14px">${esc(c.btn)}</div>
  </div></body></html>`;
}
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })).newPage();
  const fs = require("fs"); const truth = {};
  for (const [id, c] of Object.entries(CARDS)) for (const dark of [false, true]) {
    await p.setContent(html(c, dark));
    const f = `${OUT}/${id}-${dark ? "dark" : "light"}.png`;
    await p.screenshot({ path: f }); truth[f.split("/").pop()] = c.truth;
  }
  fs.writeFileSync(`${OUT}/truth.json`, JSON.stringify(truth));
  await b.close();
})();
