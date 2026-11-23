import { parseOfferText, manualOffer, estimate, shiftNeed, DEFAULT_SETTINGS, fareFromWords, reconcileScanFare, cleanPixels,
  orderLegsByPosition, reconcileLegOrder } from "./engine.js";
import { TOWNS, COUNTIES, BANDS, KIND_ICON, nearestTown } from "./southwest.js";
import { weekGrid, currentSlot, nextPeak, placeHotNow, placePatterns, eventEnd, hourlyOutlook, bestWindow, hotTowns, radarEvents, weatherAt } from "./demand.js";
import { buildNews } from "./news.js";
import { todayStats, pace, goalStreak, bestTime } from "./progress.js";
import { LANGUAGES, setLanguage, guessLanguage, t, money, num, weekdayShort, dateTime, dateOnly } from "./i18n.js";
import * as store from "./store.js";

// ---------- icons ----------
const P = {
  check: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/>',
  demand: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  rates: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  feedback: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  owner: '<path d="M3 3v18h18"/><path d="M8 17V11M13 17V7M18 17v-4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  text: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
  keypad: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  rain: '<path d="M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.3"/><path d="M8 19v2M8 13v2M16 19v2M16 13v2M12 21v2M12 15v2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  train: '<rect x="5" y="3" width="14" height="13" rx="3"/><path d="M5 11h14M9 20l-2 2M15 20l2 2M9 16v4M15 16v4"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  hospital: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 7v6M9 10h6M9 21v-4h6v4"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  stadium: '<ellipse cx="12" cy="8" rx="9" ry="4"/><path d="M3 8v8c0 2.2 4 4 9 4s9-1.8 9-4V8"/>',
  bag: '<path d="M6 7h12l1 14H5z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  school: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  ship: '<path d="M3 17l2 4h14l2-4"/><path d="M5 17V9h14v8M12 3v6"/>',
  wave: '<path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M12 3v4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  news: '<path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v10a2 2 0 0 1-2 2"/><path d="M8 9h5M8 13h5M8 17h3"/>',
  snow: '<path d="M12 2v20M4.9 6.5l14.2 11M4.9 17.5l14.2-11"/>',
  ticket: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M13 6v12"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${P[name] || ""}</svg>`;
// Keep numbers, prices and time ranges left-to-right inside right-to-left languages
const ltr = (s) => `<bdi dir="ltr">${s}</bdi>`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $("#view");

const ROUTES = ["check", "demand", "history", "rates", "feedback", "owner"];
const settings = () => ({ ...DEFAULT_SETTINGS, ...store.get("settings", {}) });
const town = () => store.get("town", "exeter");

// ---------- shell ----------
function renderShell() {
  $("#lang").innerHTML = LANGUAGES.map(([c, name]) => `<option value="${c}">${esc(name)}</option>`).join("");
  $("#lang").value = store.get("lang", null) || guessLanguage();
  $$("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
  $("#foot-tr").hidden = document.documentElement.lang === "en";
  const route = currentRoute();
  $("#nav").innerHTML = ROUTES.map((r) =>
    `<a href="#${r}" ${r === route ? 'aria-current="page"' : ""}>${icon(r)}<span>${esc(t("nav." + r))}</span></a>`).join("");
}

function currentRoute() {
  const h = location.hash.slice(1);
  return ROUTES.includes(h) ? h : "check";
}

function render() {
  renderShell();
  const r = currentRoute();
  ({ check: renderCheck, demand: renderDemand, history: renderHistory, rates: renderRates, feedback: renderFeedback, owner: renderOwner })[r]();
  checkAlerts();
}

// ---------- offer check ----------
const DEMO = "UberX\n£12.40\n4.92 ★\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip\nAccept";
let checkMode = "scan";
let currentOffer = null;
let lastText = "";
let verdictSig = "";
// Every new offer (scan, demo, text paste) gets a new generation, so Details closes even if the numbers match.
let offerGen = 0, verdictGen = -1;
// Scan state shown in the verdict card: null, "reading" or "failed". scanSeq drops stale OCR results.
let scanState = null, scanSeq = 0;
// Word heights from the last screenshot's OCR, for the text that pass produced. The height check only
// applies while lastText is still exactly that text (editing the box makes it pasted text again).
let scanGeo = null; // { text, words: [{ text, height, prev }], legsOk }
const MAX_TEXT = 5000; // cap pasted or OCR text before parsing (huge pastes froze the page)
const cancelScan = () => { scanSeq++; scanState = null; scanGeo = null; };

function checkHero(s) {
  const st = todayStats(store.get("history", []));
  const goal = s.shiftGoal || 0;
  const pct = goal ? Math.min(100, Math.round((st.take / goal) * 100)) : 0;
  const tw = TOWNS.find((x) => x.id === town()) || TOWNS[0];
  const top = newsFor(tw).now[0];
  return `<section class="hero hero-check">
    <p class="eyebrow">${esc(t("app.tagline"))}</p>
    <h1>${esc(t("hero.check"))}</h1>
    <p class="hero-desc">${esc(t("hero.checkSub"))}</p>
    <div class="hero-progress">
      <div class="hp-row"><span>${esc(t("shift.today"))}</span><b dir="ltr">${esc(money(st.take, 0))} / ${esc(money(goal, 0))}</b></div>
      <div class="hp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="inline-size:${pct}%"></i></div>
    </div>
    ${top ? `<a class="ticker" href="#demand" data-tone="${top.tone}"><span class="news-tag">${esc(t("news.tag." + top.kind))}</span>
      <span class="ticker-text">${esc(newsText(top))}</span><span class="ticker-more">${esc(t("news.all"))} →</span></a>` : ""}
  </section>`;
}

function renderCheck() {
  const s = settings();
  view.innerHTML = `
    ${checkHero(s)}
    <section class="verdict" id="verdict" aria-live="polite"></section>
    <p class="safety">${icon("alert")}<span>${esc(t("check.safety"))}</span></p>
    <section class="card">
      <div class="seg" role="group">
        <button data-mode="scan">${icon("camera")}${esc(t("check.scan"))}</button>
        <button data-mode="paste">${icon("text")}${esc(t("check.paste"))}</button>
        <button data-mode="type">${icon("keypad")}${esc(t("check.type"))}</button>
      </div>
      <div data-pane="scan">
        <label class="btn primary" style="width:100%">${icon("camera")}<span>${esc(t("check.scan"))}</span>
          <input type="file" id="scan-file" accept="image/*" hidden></label>
        <button class="btn ghost" id="paste-shot" style="width:100%;margin-top:8px" hidden>${icon("text")}<span>${esc(t("check.pasteShot"))}</span></button>
        <p class="note" style="margin-top:8px">${esc(t("check.dropHint"))} ${esc(t("check.scanPrivacy"))}</p>
        <p class="readout" id="scan-status" aria-live="polite"></p>
      </div>
      <div data-pane="paste">
        <textarea id="ocr" spellcheck="false" maxlength="${MAX_TEXT}" aria-label="${esc(t("check.pasteHint"))}" placeholder="${esc(t("check.pasteHint"))}"></textarea>
      </div>
      <div data-pane="type" class="grid2">
        <label class="field full">${esc(t("check.fare"))}<input type="number" id="m-fare" inputmode="decimal" step="0.01" min="0"></label>
        <label class="field">${esc(t("check.pickupMin"))}<input type="number" id="m-pmin" inputmode="decimal" min="0"></label>
        <label class="field">${esc(t("check.pickupMi"))}<input type="number" id="m-pmi" inputmode="decimal" step="0.1" min="0"></label>
        <label class="field">${esc(t("check.tripMin"))}<input type="number" id="m-tmin" inputmode="decimal" min="0"></label>
        <label class="field">${esc(t("check.tripMi"))}<input type="number" id="m-tmi" inputmode="decimal" step="0.1" min="0"></label>
      </div>
      <div class="row">
        <button class="btn ghost small" id="demo">${esc(t("check.demo"))}</button>
        <button class="btn small" id="save" disabled>${esc(t("check.save"))}</button>
        <span class="toast" id="saved" hidden>${esc(t("check.saved"))}</span>
      </div>
    </section>
    <section class="card">
      <h2>${esc(t("shift.title"))}</h2>
      <div class="goal-chips">${[200, 300, 400].map((g) => `<button data-goal="${g}" aria-pressed="${s.shiftGoal === g}">${money(g, 0)}</button>`).join("")}</div>
      <div class="grid2">
        <label class="field">${esc(t("shift.goal"))}<input type="number" id="goal" min="0" value="${s.shiftGoal}"></label>
        <label class="field">${esc(t("shift.hours"))}<input type="number" id="hours" min="1" step="0.5" value="${s.shiftHours}"></label>
      </div>
      <div class="callout" id="shift-msg"></div>
    </section>`;

  $$(".seg button", view).forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("#ocr").value = lastText;
  $("#ocr").addEventListener("paste", () => offerGen++); // a pasted card is a new offer
  $("#ocr").addEventListener("input", () => { cancelScan(); lastText = $("#ocr").value.slice(0, MAX_TEXT); updateCheck(); });
  $$("[data-pane=type] input", view).forEach((el) => el.addEventListener("input", () => { cancelScan(); updateCheck(); }));
  $("#demo").addEventListener("click", () => { cancelScan(); offerGen++; lastText = DEMO; $("#ocr").value = DEMO; setMode("paste"); });
  $("#scan-file").addEventListener("change", (e) => scanImage(e.target.files[0]));
  // Optional "Paste screenshot" button: only where the async clipboard can read images.
  const pasteBtn = $("#paste-shot");
  pasteBtn.hidden = !(navigator.clipboard && typeof navigator.clipboard.read === "function");
  pasteBtn.addEventListener("click", async () => {
    let items;
    try { items = await navigator.clipboard.read(); }
    catch { pasteBtn.hidden = true; return; } // refused or unsupported: hide, nothing else changes
    for (const it of items) {
      const type = it.types.find((x) => x.startsWith("image/"));
      if (type) { try { return scanImage(await it.getType(type)); } catch { break; } }
    }
    scanImage(new Blob([], { type: "application/x-none" })); // no image: same failed state as any bad scan
  });
  $("#save").addEventListener("click", saveOffer);

  const shiftMsg = () => {
    const st = settings();
    const rate = shiftNeed(st);
    $("#shift-msg").innerHTML = rate === null ? "" :
      `<p>${esc(t("shift.need", { goal: money(st.shiftGoal, 0), hours: num(st.shiftHours), rate: money(rate) }))}</p>
       <p class="sub">${esc(t(rate <= st.targetHr ? "shift.below" : "shift.above", { target: money(st.targetHr) }))}</p>`;
    $$("[data-goal]", view).forEach((b) => b.setAttribute("aria-pressed", +b.dataset.goal === st.shiftGoal));
  };
  const saveShift = (patch) => { store.set("settings", { ...store.get("settings", {}), ...patch }); shiftMsg(); updateCheck(); };
  $$("[data-goal]", view).forEach((b) => b.addEventListener("click", () => { $("#goal").value = b.dataset.goal; saveShift({ shiftGoal: +b.dataset.goal }); }));
  $("#goal").addEventListener("input", (e) => saveShift({ shiftGoal: +e.target.value || 0 }));
  $("#hours").addEventListener("input", (e) => saveShift({ shiftHours: +e.target.value || 0 }));
  shiftMsg();
  setMode(checkMode);
}

function setMode(m) {
  if (m !== "scan") cancelScan(); // leaving Scan drops any read in progress and its failed state
  checkMode = m;
  $$(".seg button", view).forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === m));
  $$("[data-pane]", view).forEach((p) => (p.hidden = p.dataset.pane !== m));
  updateCheck();
}

const FIELD = { fare: "check.fare", pickup_min: "check.pickupMin", pickup_miles: "check.pickupMi", trip_min: "check.tripMin", trip_miles: "check.tripMi" };

function updateCheck() {
  const s = settings();
  const el = $("#verdict");
  const wasOpen = !!$("#details", el)?.open;
  $("#saved").hidden = true;
  // While a screenshot is read, or after a failed read, never leave the previous verdict up (QA H4).
  if (scanState) {
    currentOffer = null;
    $("#save").disabled = true;
    verdictSig = "";
    el.dataset.d = scanState === "reading" ? "READING" : "UNKNOWN";
    el.innerHTML = scanState === "reading"
      ? `<div class="word">—</div><p class="sub" style="margin:0;color:var(--fg)">${esc(t("check.scanning"))}</p>`
      : `<div class="word">${esc(t("v.UNKNOWN"))}</div><p class="sub" style="margin:0;color:var(--fg)">${esc(t("check.scanFailed"))}</p>`;
    fitWord();
    return;
  }
  let o, readout = "";
  if (checkMode === "type") {
    const n = (id) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : null; };
    o = manualOffer({ fare: n("#m-fare"), pickup_min: n("#m-pmin"), pickup_miles: n("#m-pmi"), trip_min: n("#m-tmin"), trip_miles: n("#m-tmi") });
  } else {
    o = parseOfferText(lastText);
    // Screenshot: the fare must also be the tallest amount on screen, or it goes to manual entry.
    if (scanGeo && scanGeo.text === lastText) {
      o = reconcileScanFare(o, fareFromWords(scanGeo.words), lastText);
      o = reconcileLegOrder(o, scanGeo.legsOk); // bare legs whose screen order is unknown: manual entry
    }
    // What was read from the card has numbers in it, so it lives inside Details too (SAFETY.md).
    readout = lastText.trim() ? `<p class="readout">${esc(t("check.read"))}: ` + Object.keys(FIELD).map((k) =>
      o[k] === null ? `<span class="miss">${esc(t(FIELD[k]).replace(/\s*\(.*\)/, ""))}: ${esc(t("check.notFound"))}</span>`
                    : `${esc(t(FIELD[k]).replace(/\s*\(.*\)/, ""))} <b>${ltr(k === "fare" ? money(o[k]) : num(o[k]))}</b>`).join(" · ") + "</p>" : "";
  }
  const v = estimate(o, s);
  currentOffer = v.decision === "UNKNOWN" ? null : v;
  $("#save").disabled = !currentOffer;
  el.dataset.d = v.decision;
  // SAFETY.md: the app can't tell if the car is moving, so only the word and colour show at first.
  // Numbers sit behind "Details (parked only)", closed by default and closed again on each new offer.
  const vo = v.offer || {};
  const sig = JSON.stringify([v.decision, vo.fare, vo.pickup_min, vo.pickup_miles, vo.trip_min, vo.trip_miles, s]);
  const keepOpen = wasOpen && sig === verdictSig && verdictGen === offerGen;
  verdictSig = sig;
  verdictGen = offerGen;
  const details = (inner) => `<details class="details" id="details"${keepOpen ? " open" : ""}><summary>${esc(t("v.details"))}</summary>${inner}</details>`;
  if (v.decision === "UNKNOWN") {
    const blank = !(lastText.trim() || checkMode === "type" && $$("[data-pane=type] input", view).some((i) => i.value));
    el.innerHTML = `<div class="word">${blank ? "—" : esc(t("v.UNKNOWN"))}</div>
      <p class="sub" style="margin:0;color:var(--fg)">${esc(blank ? t("check.pasteHint") : t("v.sub.UNKNOWN"))}</p>
      ${readout ? details(readout) : ""}`;
    fitWord();
    return;
  }
  el.innerHTML = `
    <div class="word">${esc(t("v." + v.decision))}</div>
    <p style="margin:0">${esc(t("v.sub." + v.decision))} <span class="sub">${esc(t("v.conf." + v.confidence))}</span></p>
    <details class="details" id="details"${keepOpen ? " open" : ""}><summary>${esc(t("v.details"))}</summary>
    ${readout}
    <div class="range">${ltr(`${money(v.perHr[0], 0)}–${money(v.perHr[2], 0)}<small> / h</small>`)}</div>
    <div class="grid3">
      <div class="stat"><div class="k">${esc(t("v.perMile"))}</div><div class="v">${ltr(money(v.perMile[1]))}</div></div>
      <div class="stat"><div class="k">${esc(t("v.perMin"))}</div><div class="v">${ltr(money(v.perMin))}</div></div>
      <div class="stat"><div class="k">${esc(t("v.totalTrip"))}</div><div class="v">${ltr(num(v.totalMiles) + " mi")}</div><div class="s">${ltr(num(v.totalMin, 0) + " min")}</div></div>
      <div class="stat"><div class="k">${esc(t("v.cost"))}</div><div class="v">${ltr(money(v.cost))}</div></div>
      <div class="stat"><div class="k">${esc(t("v.takeHome"))}</div><div class="v">${ltr(money(v.take))}</div></div>
    </div>
    ${v.decision !== "ACCEPT" ? `<p class="sub" style="margin:0;color:var(--fg)">${esc(t("v.needs", { fare: money(v.fareNeeded) }))}</p>` : ""}
    ${v.reasons.length ? `<ul class="reasons">${v.reasons.map((r) => `<li>${esc(t("v.reason." + r))}</li>`).join("")}</ul>` : ""}
    </details>`;
  fitWord();
}

// The verdict word stays on one line and is scaled down until it fits (long words in some languages).
function fitWord() {
  const w = $("#verdict .word");
  if (!w) return;
  w.style.fontSize = "";
  const avail = w.clientWidth;
  if (!avail) return;
  let size = parseFloat(getComputedStyle(w).fontSize);
  if (w.scrollWidth > avail) size = Math.max(18, Math.floor(size * avail / w.scrollWidth));
  w.style.fontSize = size + "px";
  while (w.scrollWidth > avail && size > 18) w.style.fontSize = (size -= 1) + "px";
}
window.addEventListener("resize", fitWord);

let tesseractLoading = null;
// The OCR engine is served from FairFare's own site (app/vendor/tesseract): no third-party host is contacted.
const OCR_BASE = () => new URL("vendor/tesseract/", location.href).href;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  tesseractLoading ??= new Promise((ok, fail) => {
    const sc = document.createElement("script");
    sc.src = OCR_BASE() + "tesseract.min.js";
    sc.onload = () => ok(window.Tesseract);
    sc.onerror = () => { tesseractLoading = null; fail(new Error("load")); };
    document.head.appendChild(sc);
  });
  return tesseractLoading;
}
let ocrWorker = null;
async function getOcrWorker() {
  const T = await loadTesseract();
  if (!ocrWorker) {
    const base = OCR_BASE();
    ocrWorker = T.createWorker("eng", 1, {
      workerPath: base + "fairfare-worker.js", corePath: base, langPath: base + "lang", workerBlobURL: false,
    }).catch((e) => { ocrWorker = null; throw e; });
  }
  return ocrWorker;
}

// Screenshot is read on the phone; the image is never uploaded or stored.
// file: a File or Blob from the picker, paste, drop or share target.
// Make a screenshot easy to read: greyscale, dark mode flipped to dark-on-light, then pure black and white.
// Stays in memory on the phone; nothing is saved or sent.
function prepareForOcr(bmp, scale) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(bmp, 0, 0, c.width, c.height);
  const img = x.getImageData(0, 0, c.width, c.height);
  // Greyscale, dark mode flipped, black and white; coloured badges read by colour distance (engine.js cleanPixels).
  cleanPixels(img.data, c.width, c.height);
  x.putImageData(img, 0, 0);
  return c;
}

async function scanImage(file) {
  if (!file) return;
  if (checkMode !== "scan") setMode("scan");
  // New screenshot: clear the old verdict at once (QA H4); only the newest read may land (QA rapid pastes).
  const my = ++scanSeq;
  offerGen++;
  lastText = "";
  scanGeo = null;
  const finish = (state, text = "", words = null, legsOk = true) => {
    if (my !== scanSeq) return; // a newer scan (or typed input) has taken over
    scanState = state;
    lastText = text;
    scanGeo = words ? { text, words, legsOk } : null;
    if (!$("#verdict")) return; // Check screen not open: renderCheck shows this state when it is
    $("#ocr").value = text;
    $("#scan-status").textContent = state === "failed" ? t("check.scanFailed") : "";
    updateCheck();
  };
  if (!/^image\//.test(file.type || "")) { finish("failed"); $("#scan-file").value = ""; return; }
  scanState = "reading";
  $("#scan-status").textContent = t("check.scanning");
  updateCheck();
  try {
    const worker = await getOcrWorker();
    const bmp = await createImageBitmap(file);
    // Pass 1: full size, cleaned to black-on-white, read as scattered text (an offer card isn't prose).
    // Each pass keeps its text and its word heights (bbox y1 - y0) for the fare height check.
    const read = async (scale) => {
      const d = (await worker.recognize(prepareForOcr(bmp, scale), {}, { text: true, blocks: true })).data || {};
      const words = [], lines = [];
      for (const l of d.lines || []) {
        (l.words || []).forEach((w, i) => words.push({
          text: w.text || "", height: w.bbox ? w.bbox.y1 - w.bbox.y0 : 0, prev: i ? l.words[i - 1].text || "" : "" }));
        lines.push({ text: l.text || "", y: l.bbox ? l.bbox.y0 : NaN }); // line tops: the legs' screen order
      }
      // Leg lines back in screen order (OCR may emit them out of order); see engine.js orderLegsByPosition.
      const ord = orderLegsByPosition((d.text || "").slice(0, MAX_TEXT), lines);
      return { text: ord.text, words, legsOk: ord.ok };
    };
    await worker.setParameters({ tessedit_pageseg_mode: "11" });
    let pass = await read(1);
    // Pass 2, only if something is missing: half size, read as a page. Keep whichever found more.
    if (parseOfferText(pass.text).missing.length) {
      await worker.setParameters({ tessedit_pageseg_mode: "3" });
      const alt = await read(0.5);
      if (parseOfferText(alt.text).missing.length < parseOfferText(pass.text).missing.length) pass = alt;
    }
    if (bmp.close) bmp.close();
    if (parseOfferText(pass.text).missing.length === 5) finish("failed");
    else finish(null, pass.text, pass.words, pass.legsOk);
  } catch {
    finish("failed");
  } finally {
    if ($("#scan-file")) $("#scan-file").value = "";
  }
}

function saveOffer() {
  if (!currentOffer) return;
  const v = currentOffer, o = v.offer;
  store.push("history", {
    id: store.uid(), at: Date.now(), status: "unmarked", town: town(),
    fare: o.fare, miles: v.totalMiles, minutes: v.totalMin, decision: v.decision,
    perHr: v.perHr[1], take: v.take,
  });
  $("#save").disabled = true;
  $("#saved").hidden = false;
}

// ---------- quick capture: paste, drop and Android share (R1) ----------
const imageFrom = (list) => [...(list || [])].find((f) => f && /^image\//.test(f.type || "")) || null;

// Paste an image anywhere on the Check screen. Plain-text pastes are left alone (they go to the textarea).
document.addEventListener("paste", (e) => {
  if (currentRoute() !== "check") return;
  const dt = e.clipboardData;
  const img = imageFrom(dt?.files) || imageFrom([...(dt?.items || [])].filter((i) => i.kind === "file").map((i) => i.getAsFile()));
  if (!img) return;
  e.preventDefault();
  scanImage(img);
});

// Drag and drop an image file onto the page (desktop).
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
document.addEventListener("dragover", (e) => {
  if (currentRoute() !== "check" || !hasFiles(e)) return;
  e.preventDefault();
  document.body.classList.add("dropping");
});
document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dropping"); });
document.addEventListener("drop", (e) => {
  document.body.classList.remove("dropping");
  if (currentRoute() !== "check" || !hasFiles(e)) return;
  e.preventDefault();
  const files = e.dataTransfer.files;
  const img = imageFrom(files);
  if (img) scanImage(img);
  else if (files.length) scanImage(files[0]); // not an image: shows the failed state
});

// Share target: sw.js parks the shared image in SHARE_CACHE and redirects here (#check).
// Read it once and drop the whole cache straight away, success or failure. Keep names in step with sw.js.
const SHARE_CACHE = "fairfare-share";
const SHARE_KEY = "shared-image";
async function takeSharedImage() {
  if (!("caches" in window)) return null;
  let blob = null, found = false;
  try {
    if (!(await caches.has(SHARE_CACHE))) return null;
    const cache = await caches.open(SHARE_CACHE);
    const res = await cache.match(new URL(SHARE_KEY, location.href.split("#")[0]).href);
    if (res) { found = true; blob = await res.blob(); }
  } catch { /* fall through: the cache is still cleared below */ }
  finally { try { await caches.delete(SHARE_CACHE); } catch { /* nothing else to do */ } }
  return found ? blob : null;
}

async function checkShared() {
  const blob = await takeSharedImage();
  if (!blob) return;
  if (currentRoute() !== "check") { location.hash = "#check"; render(); }
  scanImage(blob); // a non-image or empty share shows "Couldn't read that screenshot"
}

// ---------- live events (official sources, refreshed every 6 hours by GitHub Actions) ----------
let live = { events: [], bankHolidays: [], sources: [], generated: null };
async function loadLive() {
  try {
    const res = await fetch("data/events.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("no feed");
    const d = await res.json();
    live = {
      ...d,
      events: (d.events || []).map((e) => ({ ...e, town: (nearestTown(e.lat, e.lon, 15) || {}).id })).filter((e) => e.town),
    };
  } catch { /* offline or not published yet: own events still work */ }
  try {
    const res = await fetch("fixtures.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("no fixtures");
    const f = await res.json();
    // Skip a fixture when the live feed already has an event at the same venue that day
    const dup = (x) => live.events.some((e) => e.date === x.date && Math.abs(e.lat - x.lat) < 0.01 && Math.abs(e.lon - x.lon) < 0.01);
    const fx = (f.fixtures || []).map((e) => ({ ...e, town: (nearestTown(e.lat, e.lon, 15) || {}).id })).filter((e) => e.town && !dup(e));
    live = { ...live, events: [...live.events, ...fx], fixturesChecked: f.checked, fixturesCount: fx.length };
  } catch { /* fixtures are optional */ }
}
const ownEvents = () => store.get("events", []).map((e) => ({ ...e, own: true }));
const allEvents = () => [...live.events, ...ownEvents()];
const townName = (id) => (TOWNS.find((x) => x.id === id) || {}).name || "";

// ---------- demand ----------
const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
let showEventForm = false;
let showNoticeForm = false;

function hoursText(place) {
  const pats = placePatterns(place);
  if (!pats.length) return [t("demand.eventDays")];
  return pats.map(([days, s, e]) => {
    const d = days.length === 7 ? "" : days.length > 2 && days[days.length - 1] - days[0] === days.length - 1
      ? `${weekdayShort(days[0])}–${weekdayShort(days[days.length - 1])} ` : days.map(weekdayShort).join(", ") + " ";
    const hh = (h) => String(h % 24).padStart(2, "0") + ":00";
    return `${d}${hh(s)}–${hh(e)}`;
  });
}

function eventItem(e, mins, showTown = false) {
  const when = e.start && !e.own ? `${dateTime(new Date(e.start))} → ${e.end}` : dateTime(eventEnd(e));
  return `<div class="item"><div class="body"><div class="t">${esc(e.name)}</div>
    <div class="m">${showTown ? esc(townName(e.town)) + " · " : ""}${esc(e.venue || "")} · ${ltr(esc(when))} · ${esc(t("size." + e.size))}</div>
    <div class="row" style="margin-top:4px">
      <span class="chip">${esc(e.own ? t("ev.byYou") : e.source === "Fixture list" ? t("ev.fixture") : e.source)}</span>${e.startConfirmed === false ? `<span class="chip">${esc(t("ev.koTbc"))}</span>` : ""}
      ${e.endEstimated ? `<span class="chip">${esc(t("ev.estimated"))}</span>` : ""}
      ${mins > 0 && mins <= 180 ? `<span class="chip">${esc(t("ev.finishesIn", { m: num(mins, 0) }))}</span>` : mins <= 0 ? `<span class="chip">${esc(t("ev.finished"))}</span>` : ""}
      ${e.url ? `<a class="help" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(t("ev.check"))}</a>` : ""}
    </div></div>
    ${e.own ? `<button class="iconbtn" data-del-ev="${e.id}" aria-label="${esc(t("common.delete"))}">${icon("trash")}</button>` : ""}</div>`;
}

const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const bandText = (b) => `${String(BANDS[b][0] % 24).padStart(2, "0")}–${String(BANDS[b][1] % 24).padStart(2, "0")}`;

function shiftCard() {
  const s = settings();
  const hist = store.get("history", []);
  const st = todayStats(hist);
  const p = pace(st, s.shiftGoal, s.shiftHours);
  const streak = goalStreak(hist, s.shiftGoal);
  const best = bestTime(hist);
  const msg = !p ? "" : p.state === "done" ? t("shift.done") : p.state === "notStarted" ? t("shift.notStarted")
    : p.state === "onPace" ? t("shift.onPace") : t("shift.behind", { rate: money(p.need), hours: num(p.hoursLeft, 1) });
  return `<section class="card k-go">
    <div class="card-head"><h2>${esc(t("shift.today"))}</h2>${streak >= 2 ? `<span class="pill" style="color:var(--accent)">${esc(t("shift.streak", { n: num(streak, 0) }))}</span>` : ""}</div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((p ? p.pct : 0) * 100)}"><i style="width:${Math.round((p ? p.pct : 0) * 100)}%"></i></div>
    <div class="row" style="justify-content:space-between"><b>${ltr(esc(t("shift.progress", { take: money(st.take), goal: money(s.shiftGoal, 0) })))}</b>
      <span class="sub" data-state="${p ? p.state : ""}">${esc(msg)}</span></div>
    ${best ? `<p class="sub">${esc(t("shift.best", { day: weekdayShort(best.day), band: "" }))}${ltr(bandText(best.band))} · ${ltr(money(best.perHr, 0) + "/h")}</p>` : ""}
  </section>`;
}

function planCard(tw, events) {
  const out = hourlyOutlook(tw.id, events, live.weather);
  const best = bestWindow(out);
  const why = best ? [
    t("plan.why.peak"),
    ...best.events.slice(0, 2).map((e) => t("plan.why.event", { name: e.name })),
    ...(best.rain ? [t("plan.why.rain")] : []),
  ] : [];
  const wxLine = live.weather && live.weather.start ? t("plan.weatherOn", { time: live.generated ? dateTime(new Date(live.generated)) : "" }) : t("plan.weatherOff");
  return `<section class="card k-blue">
    <div><h2>${esc(t("plan.title"))}</h2><p class="sub">${esc(t("plan.sub", { town: tw.name }))}</p></div>
    <p class="callout" style="margin:0">${best ? `<b>${esc(t("plan.best"))} ${ltr(`${hhmm(best.start)}–${hhmm(best.end)}`)}</b><br><span class="sub">${esc(why.join(" · "))}</span>` : esc(t("plan.quiet"))}</p>
    <div class="strip" role="list">${out.map((h) => `<div class="hr" role="listitem" data-l="${h.level}" title="${esc(t("level." + h.level))}">
      <span class="tm" dir="ltr">${String(h.at.getHours()).padStart(2, "0")}</span>
      <span class="bar"></span>
      <span class="ics">${h.events.length ? icon("ticket") : ""}${h.rain ? icon("rain") : ""}</span></div>`).join("")}</div>
    <div class="legend"><span>${icon("ticket")}${esc(t("plan.event"))}</span><span>${icon("rain")}${esc(t("plan.rain"))}</span>
      ${[1, 2, 3].map((l) => `<span><i style="background:var(--heat${l})"></i>${esc(t("level." + l))}</span>`).join("")}</div>
    <p class="note">${esc(wxLine)} ${esc(t("safety.plan"))}</p>
  </section>`;
}

let radar = { period: store.get("radarPeriod", "tonight"), bigOnly: store.get("radarBig", false), near: store.get("radarNear", false) };
function radarCard(tw, events, now) {
  const list = radarEvents(events, { period: radar.period, bigOnly: radar.bigOnly, nearTown: radar.near ? tw : null }, now);
  let lastDay = "";
  const rows = list.slice(0, 30).map((e) => {
    const day = new Intl.DateTimeFormat(document.documentElement.lang || "en", { weekday: "long", day: "numeric", month: "short" }).format(e._end);
    const head = day !== lastDay ? `<div class="dayhead">${esc(day)}</div>` : "";
    lastDay = day;
    return head + `<div class="item"><div class="body"><div class="t">${esc(e.name)}</div>
      <div class="m">${esc(townName(e.town))}${e.venue ? " · " + esc(e.venue) : ""}${e._mi != null ? " · " + esc(t("radar.away", { mi: num(e._mi, 0) })) : ""}</div>
      <div class="row" style="margin-top:4px"><span class="chip strong">${ltr(esc(t("radar.rush", { time: hhmm(e._end) })))}</span>
        <span class="chip size-${e.size}">${esc(t("size." + e.size))}</span>
        <span class="chip">${esc(e.own ? t("ev.byYou") : e.source === "Fixture list" ? t("ev.fixture") : e.source || "")}</span>
        ${e.url ? `<a class="help" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(t("ev.check"))}</a>` : ""}</div></div></div>`;
  }).join("");
  const seg = (k, v, label) => `<button data-radar="${k}" data-v="${v}" aria-pressed="${radar[k] === v}">${esc(t(label))}</button>`;
  return `<section class="card k-violet">
    <div><h2>${esc(t("radar.title"))}</h2><p class="sub">${esc(t("radar.sub"))}</p></div>
    <div class="seg" role="group">${seg("period", "tonight", "radar.tonight")}${seg("period", "weekend", "radar.weekend")}${seg("period", "week", "radar.week")}${seg("period", "month", "radar.month")}</div>
    <div class="row"><label class="check"><input type="checkbox" id="radar-big" ${radar.bigOnly ? "checked" : ""}> ${esc(t("radar.bigOnly"))}</label>
      <label class="check"><input type="checkbox" id="radar-near" ${radar.near ? "checked" : ""}> ${esc(t("radar.near"))}</label></div>
    <div class="list">${rows || `<p class="empty">${esc(t("radar.none"))}</p>`}</div>
  </section>`;
}

// ---------- driver news ----------
const NEWS_ICON = { flood: "wave", weather: "rain", rush: "bolt", event: "ticket", big: "stadium", bank: "demand", note: "bell" };
let newsTab = "now";
function newsFor(tw, now = new Date()) {
  return buildNews({ events: allEvents(), floods: live.floods || [], weather: live.weather, bankHolidays: live.bankHolidays || [],
    notes: store.get("notices", []), town: tw.id, townName: tw.name }, now);
}
function newsText(n) {
  const p = {};
  for (const [k, v] of Object.entries(n.params)) p[k] = v instanceof Date ? (k === "date" ? dateOnly(v) : hhmm(v)) : String(v ?? "");
  return t(n.key, p).replace(/\s+\.\s*$/, ".").trim();
}
function newsItem(n) {
  const icn = n.kind === "weather" && n.key === "news.ice" ? "snow" : NEWS_ICON[n.kind] || "news";
  return `<li class="news-item" data-tone="${n.tone}">
    <span class="news-ic">${icon(icn)}</span>
    <div class="news-body"><span class="news-tag">${esc(t("news.tag." + n.kind))}</span><p>${esc(newsText(n))}</p></div>
    <time dir="ltr">${n.kind === "bank" || n.kind === "big" ? "" : esc(hhmm(n.at))}</time></li>`;
}
function newsCard(tw, now) {
  const news = newsFor(tw, now);
  const list = newsTab === "now" ? news.now : news.earlier;
  return `<section class="card news" id="news">
    <div class="card-head"><div class="title-ic">${icon("news")}<div><h2>${esc(t("news.title"))}${news.now.length ? ` <span class="count">${num(news.now.length, 0)}</span>` : ""}</h2>
      <p class="sub">${esc(t("news.sub"))}</p></div></div></div>
    <div class="seg" role="group">
      <button data-news="now" aria-pressed="${newsTab === "now"}">${esc(t("news.now"))}</button>
      <button data-news="earlier" aria-pressed="${newsTab === "earlier"}">${esc(t("news.earlier"))}</button></div>
    ${list.length ? `<ul class="news-list">${list.slice(0, 12).map(newsItem).join("")}</ul>`
      : `<p class="empty">${esc(t(newsTab === "now" ? "news.none" : "news.noneEarlier"))}</p>`}
    <p class="note">${esc(t("news.sources"))}</p>
  </section>`;
}

function hotCard(events, now) {
  const hot = hotTowns(events, now, new Date(now.getTime() + 48 * 3600e3));
  const max = Math.max(1, ...hot.map((h) => h.score));
  return `<section class="card k-amber">
    <div><h2>${esc(t("hot.title"))}</h2><p class="sub">${esc(t("hot.sub"))}</p></div>
    ${hot.length ? `<div class="bars">${hot.map((h) => `<button class="barrow" data-town="${h.town}">
      <span class="lbl">${esc(townName(h.town))}</span><span class="track"><i style="width:${Math.round(100 * h.score / max)}%"></i></span>
      <span class="val">${num(h.count, 0)}${h.big ? ` · ${esc(t("size.big"))} ${num(h.big, 0)}` : ""}</span></button>`).join("")}</div>`
      : `<p class="empty">${esc(t("hot.none"))}</p>`}
  </section>`;
}

function renderDemand() {
  const tid = town();
  const tw = TOWNS.find((x) => x.id === tid) || TOWNS[0];
  const events = allEvents();
  const now = new Date();
  const grid = weekGrid(tw.id, events);
  const weekAhead = new Date(now.getTime() + 7 * 864e5);
  const bank = (live.bankHolidays || []).find((b) => { const d = new Date(b.date + "T12:00"); return d > new Date(now.getTime() - 864e5) && d < weekAhead; });
  const liveLine = live.sources && live.sources.includes("Ticketmaster")
    ? t("demand.liveOn", { sources: live.sources.join(", "), time: live.generated ? dateTime(new Date(live.generated)) : "" })
    : t("demand.liveOff");
  const fixLine = live.fixturesChecked ? t("demand.fixtures", { date: dateOnly(live.fixturesChecked) }) : "";
  const slot = currentSlot(now);
  const lvl = slot.band >= 0 ? grid[slot.day][slot.band] : 0;
  const peak = nextPeak(grid, now);
  const notices = store.get("notices", []).filter((n) => n.town === tw.id && Date.now() - n.at < 3 * 3600e3);
  const townEvents = events.filter((e) => e.town === tw.id && eventEnd(e) > new Date(Date.now() - 3 * 3600e3))
    .sort((a, b) => eventEnd(a) - eventEnd(b));
  const hot = tw.places.filter((p) => placeHotNow(p, now));
  const hoursToPeak = peak ? Math.max(0, Math.round((peak.start - now) / 3600e3)) : null;
  const perm = "Notification" in window ? Notification.permission : "denied";
  const alertsOn = store.get("alerts", false);
  const wxNow = weatherAt(live.weather, tw.id, now);
  const events24 = events.filter((e) => e.town === tw.id && eventEnd(e) > now && eventEnd(e) - now < 24 * 3600e3).length;

  view.innerHTML = `
    <section class="hero" data-l="${lvl}">
      <p class="eyebrow">${esc(t("demand.eyebrow"))}</p>
      <h1>${esc(t("hero.now", { town: tw.name }))}</h1>
      <div class="hero-level"><span class="pulse" aria-hidden="true"></span>${esc(t("level." + lvl))}</div>
      <p class="hero-desc">${esc(t("level.desc." + lvl))}</p>
      <div class="hero-stats">
        <div><span>${esc(t("demand.nextPeak"))}</span><b>${peak ? `${esc(weekdayShort(peak.day))} ${ltr(`${BANDS[peak.band][0] % 24}–${BANDS[peak.band][1] % 24}`)}` : "—"}</b>
          <small>${peak ? esc(hoursToPeak < 1 ? t("demand.startsSoon") : t("demand.startsIn", { h: num(hoursToPeak, 0) })) : ""}</small></div>
        <div><span>${esc(t("hero.weather"))}</span><b>${wxNow && wxNow.temp != null ? ltr(`${num(wxNow.temp, 0)}°`) : "—"}</b>
          <small>${wxNow ? esc(wxNow.rain ? t("plan.rain") : t("hero.dry")) : ""}</small></div>
        <div><span>${esc(t("hero.events"))}</span><b>${num(events24, 0)}</b><small>${esc(t("hero.next24"))}</small></div>
      </div>
      <div class="hero-town"><select id="town" aria-label="${esc(t("demand.town"))}">${COUNTIES.map((c) => `<optgroup label="${esc(c)}">${TOWNS.filter((x) => x.county === c).map((x) =>
        `<option value="${x.id}" ${x.id === tw.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</optgroup>`).join("")}</select>
        <button class="btn small" id="locate">${icon("pin")}<span>${esc(t("demand.useLocation"))}</span></button></div>
      <span class="help" id="loc-msg"></span>
    </section>
    ${newsCard(tw, now)}
    ${bank ? `<p class="callout">${icon("demand")} ${esc(t("bank.notice", { name: bank.title, date: dateTime(new Date(bank.date + "T00:00")).split(",").slice(0, 2).join(",") }))}</p>` : ""}
    ${shiftCard()}
    ${planCard(tw, events)}
    <section class="card">
      <div><h2>${esc(t("demand.week"))}</h2><p class="sub">${esc(t("demand.weekSub", { town: tw.name }))}</p></div>
      <div class="heat-wrap"><div class="heat">
        <span></span>${BANDS.map(([a, b]) => `<span class="h" dir="ltr">${String(a % 24).padStart(2, "0")}–${String(b % 24).padStart(2, "0")}</span>`).join("")}
        ${grid.map((row, d) => `<span class="d">${esc(weekdayShort(d))}</span>` + row.map((l, b) =>
          `<span class="c ${d === slot.day && b === slot.band ? "now" : ""}" data-l="${l}" title="${esc(t("level." + l))}"></span>`).join("")).join("")}
      </div></div>
      <div class="legend">${[0, 1, 2, 3].map((l) => `<span><i style="background:var(--heat${l})"></i>${esc(t("level." + l))}</span>`).join("")}</div>
    </section>
    <section class="card">
      <div class="card-head"><div><h2>${esc(t("demand.events"))}</h2><p class="sub">${esc(t("demand.eventsSub"))}</p></div>
        <button class="btn small" id="add-ev">${icon("plus")}${esc(t("demand.addEvent"))}</button></div>
      <form id="ev-form" class="grid2" ${showEventForm ? "" : "hidden"}>
        <label class="field full">${esc(t("ev.name"))}<input id="ev-name" required maxlength="80"></label>
        <label class="field full">${esc(t("ev.venue"))}<input id="ev-venue" list="venues" maxlength="80">
          <datalist id="venues">${tw.places.map((p) => `<option value="${esc(p.name)}">`).join("")}</datalist></label>
        <label class="field">${esc(t("ev.date"))}<input type="date" id="ev-date" required value="${localDate(now)}"></label>
        <label class="field">${esc(t("ev.end"))}<input type="time" id="ev-end" required value="22:00"></label>
        <label class="field full">${esc(t("ev.size"))}<select id="ev-size">${["small", "medium", "big"].map((z) => `<option value="${z}" ${z === "medium" ? "selected" : ""}>${esc(t("size." + z))}</option>`).join("")}</select></label>
        <div class="row full"><button class="btn primary small" type="submit">${esc(t("common.save"))}</button>
          <button class="btn ghost small" type="button" id="ev-cancel">${esc(t("common.cancel"))}</button></div>
      </form>
      <div class="list">${townEvents.length ? townEvents.map((e) => {
        const mins = Math.round((eventEnd(e) - now) / 60000);
        return eventItem(e, mins);
      }).join("") : `<p class="empty">${esc(t("demand.noEvents", { town: tw.name }))}</p>`}</div>
      <p class="note">${esc(liveLine)}</p>
      ${fixLine ? `<p class="note">${esc(fixLine)}</p>` : ""}
      <div class="row">${alertsOn
        ? `<span class="toast">${icon("bell")} ${esc(t("alerts.on"))}</span>${perm === "denied" ? `<span class="help">${esc(t("alerts.blocked"))}</span>` : ""}`
        : `<button class="btn small" id="alerts-on">${icon("bell")}${esc(t("alerts.turnOn"))}</button><span class="help">${esc(t("alerts.sub"))}</span>`}</div>
    </section>
    ${hotCard(events, now)}
    ${radarCard(tw, events, now)}
    <section class="card">
      <div class="card-head"><div><h2>${esc(t("notices.title"))}</h2><p class="sub">${esc(t("notices.expires"))}</p></div>
        <button class="btn small" id="add-notice">${icon("alert")}${esc(t("notices.post"))}</button></div>
      <form id="notice-form" class="row" ${showNoticeForm ? "" : "hidden"}>
        <input id="notice-text" maxlength="120" required placeholder="${esc(t("notices.placeholder"))}" style="flex:1 1 220px">
        <button class="btn primary small" type="submit">${esc(t("common.save"))}</button></form>
      <div class="list">${notices.length ? notices.map((n) => `<div class="item"><div class="body"><div class="t">${esc(n.text)}</div>
        <div class="m">${esc(dateTime(new Date(n.at)))}</div></div>
        <button class="iconbtn" data-del-notice="${n.id}" aria-label="${esc(t("common.delete"))}">${icon("trash")}</button></div>`).join("")
        : `<p class="empty">${esc(t("notices.none", { town: tw.name }))}</p>`}</div>
    </section>
    <section class="card">
      <div class="card-head"><div><h2>${esc(t("demand.places"))}</h2><p class="sub">${esc(t("demand.placesSub"))}</p></div>
        <span class="pill" style="color:var(--accent)">${esc(t("demand.hotNow", { n: num(hot.length, 0) }))}</span></div>
      <div class="list">${tw.places.map((p) => `<div class="place ${hot.includes(p) ? "hot" : ""}">
        <span class="ic">${icon(KIND_ICON[p.kind])}</span>
        <div class="body"><span class="name">${esc(p.name)}</span>
          <span class="meta">${esc(t("kind." + p.kind))}${p.area ? " · " + esc(p.area) : ""}${hot.includes(p) ? ` · <b style="color:var(--accent)">${esc(t("demand.busyNow"))}</b>` : ""}</span>
          <div class="row">${hoursText(p).map((h) => `<span class="chip" dir="ltr">${esc(h)}</span>`).join("")}</div></div></div>`).join("")}</div>
    </section>
    <p class="note">${esc(t("demand.phase2"))}</p>`;

  $("#town").addEventListener("change", (e) => { store.set("town", e.target.value); renderDemand(); });
  $$("[data-news]").forEach((b) => b.addEventListener("click", () => { newsTab = b.dataset.news; renderDemand(); }));
  $$("[data-radar]").forEach((b) => b.addEventListener("click", () => { radar[b.dataset.radar] = b.dataset.v; store.set("radarPeriod", radar.period); renderDemand(); }));
  $("#radar-big").addEventListener("change", (e) => { radar.bigOnly = e.target.checked; store.set("radarBig", radar.bigOnly); renderDemand(); });
  $("#radar-near").addEventListener("change", (e) => { radar.near = e.target.checked; store.set("radarNear", radar.near); renderDemand(); });
  $$("[data-town]").forEach((b) => b.addEventListener("click", () => { store.set("town", b.dataset.town); renderDemand(); window.scrollTo({ top: 0, behavior: "smooth" }); }));
  $("#locate").addEventListener("click", () => {
    const msg = $("#loc-msg");
    if (!("geolocation" in navigator)) { msg.textContent = t("demand.locFailed"); return; }
    msg.textContent = t("demand.locating");
    navigator.geolocation.getCurrentPosition((pos) => {
      const near = nearestTown(pos.coords.latitude, pos.coords.longitude, 40);
      if (!near) { msg.textContent = t("demand.locFailed"); return; }
      store.set("town", near.id);
      renderDemand();
    }, () => { msg.textContent = t("demand.locFailed"); }, { maximumAge: 600000, timeout: 15000 });
  });
  $("#add-ev").addEventListener("click", () => { showEventForm = !showEventForm; renderDemand(); if (showEventForm) $("#ev-name").focus(); });
  $("#ev-cancel").addEventListener("click", () => { showEventForm = false; renderDemand(); });
  $("#ev-form").addEventListener("submit", (e) => {
    e.preventDefault();
    store.push("events", { id: store.uid(), town: tw.id, name: $("#ev-name").value.trim(), venue: $("#ev-venue").value.trim(),
      date: $("#ev-date").value, end: $("#ev-end").value, size: $("#ev-size").value });
    showEventForm = false;
    renderDemand();
    checkAlerts();
  });
  $$("[data-del-ev]").forEach((b) => b.addEventListener("click", () => { store.remove("events", b.dataset.delEv); renderDemand(); }));
  $("#add-notice").addEventListener("click", () => { showNoticeForm = !showNoticeForm; renderDemand(); if (showNoticeForm) $("#notice-text").focus(); });
  $("#notice-form").addEventListener("submit", (e) => {
    e.preventDefault();
    store.push("notices", { id: store.uid(), town: tw.id, text: $("#notice-text").value.trim(), at: Date.now() }, 100);
    showNoticeForm = false;
    renderDemand();
  });
  $$("[data-del-notice]").forEach((b) => b.addEventListener("click", () => { store.remove("notices", b.dataset.delNotice); renderDemand(); }));
  const on = $("#alerts-on");
  if (on) on.addEventListener("click", async () => {
    store.set("alerts", true);
    try { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); } catch { /* blocked */ }
    renderDemand();
  });
}

// ---------- alerts ----------
const alerted = new Set();
function checkAlerts() {
  const bar = $("#alert-bar");
  const now = Date.now();
  const here = town();
  const soon = allEvents().filter((e) => {
    const m = (eventEnd(e) - now) / 60000;
    return m > 0 && m <= 30 && (e.own || e.town === here || e.size === "big");
  });
  if (!soon.length) { bar.hidden = true; return; }
  const e = soon[0];
  const m = Math.round((eventEnd(e) - now) / 60000);
  const msg = t("alerts.soon", { name: e.name, venue: e.venue || townName(e.town), m: num(m, 0) });
  bar.innerHTML = `<div>${icon("bell")}<span>${esc(msg)}</span></div>`;
  bar.hidden = false;
  if (store.get("alerts", false) && !alerted.has(e.id) && "Notification" in window && Notification.permission === "granted") {
    alerted.add(e.id);
    try { new Notification("FairFare", { body: msg, icon: "icons/icon-192.png", tag: e.id }); } catch { /* some browsers need the service worker */ }
  }
}
setInterval(checkAlerts, 60000);

// ---------- history ----------
function renderHistory() {
  const list = store.get("history", []);
  const took = list.filter((x) => x.status === "took");
  const totalMin = took.reduce((a, x) => a + x.minutes, 0);
  const take = took.reduce((a, x) => a + x.take, 0);
  view.innerHTML = `
    <div><h1>${esc(t("history.title"))}</h1><p class="lede">${esc(t("history.sub"))}</p></div>
    <div class="grid2">
      <div class="stat"><div class="k">${esc(t("history.checked"))}</div><div class="v">${num(list.length, 0)}</div></div>
      <div class="stat"><div class="k">${esc(t("history.took"))}</div><div class="v">${num(took.length, 0)}</div></div>
      <div class="stat"><div class="k">${esc(t("history.avg"))}</div><div class="v">${totalMin ? money(take / (totalMin / 60)) : "—"}</div></div>
      <div class="stat"><div class="k">${esc(t("history.takeHome"))}</div><div class="v">${money(take)}</div></div>
    </div>
    <div class="list">${list.length ? list.map((x) => `<div class="item"><div class="body">
        <div class="t">${ltr(`${money(x.fare)} · ${num(x.miles)} mi · ${num(x.minutes, 0)} min`)} · ${esc(t("v." + x.decision))}</div>
        <div class="m">${esc(dateTime(new Date(x.at)))} · ~${money(x.perHr)}/h</div>
        <div class="row" style="margin-top:6px">
          <button class="btn small ${x.status === "took" ? "primary" : ""}" data-mark="took" data-id="${x.id}">${esc(t("history.tookBtn"))}</button>
          <button class="btn small ${x.status === "passed" ? "primary" : ""}" data-mark="passed" data-id="${x.id}">${esc(t("history.passedBtn"))}</button>
          ${x.status === "unmarked" ? `<span class="help">${esc(t("history.unmarked"))}</span>` : ""}</div></div>
        <button class="iconbtn" data-del="${x.id}" aria-label="${esc(t("common.delete"))}">${icon("trash")}</button></div>`).join("")
      : `<p class="empty">${esc(t("history.empty"))}</p>`}</div>`;
  $$("[data-mark]").forEach((b) => b.addEventListener("click", () => { store.update("history", b.dataset.id, { status: b.dataset.mark }); renderHistory(); }));
  $$("[data-del]").forEach((b) => b.addEventListener("click", () => { store.remove("history", b.dataset.del); renderHistory(); }));
}

// ---------- rates ----------
function renderRates() {
  const s = settings();
  const field = (key, label, unit, step, help) => `
    <label class="field">${esc(t(label))}<span class="unit"><input type="number" data-k="${key}" inputmode="decimal" min="0" step="${step}" value="${s[key]}"><em>${unit}</em></span>
    ${help ? `<span class="help">${esc(t(help))}</span>` : ""}${key === "costMile" ? `<span class="warn" id="cost-warn" hidden></span>` : ""}</label>`;
  view.innerHTML = `
    <div><h1>${esc(t("rates.title"))}</h1><p class="lede">${esc(t("rates.sub"))}</p></div>
    <section class="card">
      <h2>${esc(t("rates.optimise"))}</h2>
      ${["hour", "mile", "both"].map((o) => `<button class="opt" data-opt="${o}" aria-pressed="${s.optimise === o}"><b>${esc(t("opt." + o))}</b><span>${esc(t("opt." + o + "Sub"))}</span></button>`).join("")}
    </section>
    <section class="card">
      ${field("targetHr", "rates.targetHr", "£/h", "0.5")}
      ${field("minMile", "rates.minMile", "£/mi", "0.05")}
      ${field("costMile", "rates.costMile", "£/mi", "0.01", "rates.costHelp")}
      ${field("commission", "rates.commission", "%", "1", "rates.commissionHelp")}
      ${field("pickupMinPerMile", "rates.pickupMin", "min", "0.5", "rates.pickupHelp")}
      <span class="toast" id="rates-saved" hidden>${esc(t("rates.saved"))}</span>
    </section>`;
  const warn = () => {
    const c = settings().costMile;
    const w = $("#cost-warn");
    w.hidden = !(c >= 1);
    if (c >= 1) w.textContent = t("rates.costWarn", { p: num(c * 10, 0) });
  };
  $$("[data-opt]").forEach((b) => b.addEventListener("click", () => {
    store.set("settings", { ...store.get("settings", {}), optimise: b.dataset.opt });
    $$("[data-opt]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  }));
  $$("[data-k]").forEach((el) => el.addEventListener("input", () => {
    const v = parseFloat(el.value);
    if (!Number.isFinite(v) || v < 0) return;
    store.set("settings", { ...store.get("settings", {}), [el.dataset.k]: v });
    $("#rates-saved").hidden = false;
    warn();
  }));
  warn();
}

// ---------- feedback ----------
const QUESTIONS = [
  ["q1", ["yes", "mostly", "no"]],
  ["q2", ["every", "sometimes", "rarely"]],
  ["q3", ["yes", "maybe", "no"]],
  ["q4", ["Uber", "Bolt", "FREENOW", "Local firm", "other"]],
  ["q5", ["lt1", "1to3", "gt3"]],
  ["q6", ["fuel", "waiting", "pickups", "commission", "other"]],
];
const answerLabel = (a) => (/^[a-z0-9]+$/.test(a) ? t("fb.a." + a) : a);

function renderFeedback() {
  view.innerHTML = `
    <div><p class="eyebrow">${esc(t("fb.eyebrow"))}</p><h1>${esc(t("fb.title"))}</h1><p class="lede">${esc(t("fb.sub"))}</p></div>
    <form class="card" id="fb">
      ${QUESTIONS.map(([q, opts]) => `<label class="field">${esc(t("fb." + q))}
        <select name="${q}"><option value="">${esc(t("fb.choose"))}</option>${opts.map((a) => `<option value="${esc(a)}">${esc(answerLabel(a))}</option>`).join("")}</select></label>`).join("")}
      <label class="field">${esc(t("fb.q7"))}<textarea name="q7" maxlength="2000" placeholder="${esc(t("fb.q7ph"))}" style="font-family:var(--body)"></textarea></label>
      <button class="btn primary" type="submit">${esc(t("fb.send"))}</button>
      <span class="toast" id="fb-thanks" hidden>${esc(t("fb.thanks"))}</span>
    </form>`;
  $("#fb").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    store.push("feedback", { id: store.uid(), at: Date.now(), lang: document.documentElement.lang, ...data });
    e.target.reset();
    $("#fb-thanks").hidden = false;
  });
}

// ---------- owner ----------
function renderOwner() {
  const fb = store.get("feedback", []);
  const pct = (q, vals) => (fb.length ? Math.round(100 * fb.filter((x) => vals.includes(x[q])).length / fb.length) + "%" : "—");
  const comments = fb.filter((x) => (x.q7 || "").trim());
  view.innerHTML = `
    <div><p class="eyebrow">${esc(t("owner.eyebrow"))}</p><h1>${esc(t("owner.title"))}</h1></div>
    <div class="grid2">
      <div class="stat"><div class="k">${esc(t("owner.checks"))}</div><div class="v">${num(store.get("history", []).length, 0)}</div></div>
      <div class="stat"><div class="k">${esc(t("owner.events"))}</div><div class="v">${num(allEvents().length, 0)}</div></div>
      <div class="stat"><div class="k">${esc(t("owner.responses"))}</div><div class="v">${num(fb.length, 0)}</div></div>
      <div class="stat"><div class="k">${esc(t("owner.clear"))}</div><div class="v">${pct("q1", ["yes"])}</div></div>
      <div class="stat"><div class="k">${esc(t("owner.daily"))}</div><div class="v">${pct("q2", ["every"])}</div></div>
      <div class="stat"><div class="k">${esc(t("owner.pay"))}</div><div class="v">${pct("q3", ["yes"])}</div></div>
    </div>
    <section class="card"><h2>${esc(t("owner.comments"))}</h2>
      <div class="list">${comments.length ? comments.map((x) => `<div class="item"><div class="body"><div>${esc(x.q7)}</div>
        <div class="m">${esc(dateTime(new Date(x.at)))} · ${esc(x.lang)}</div></div></div>`).join("") : `<p class="empty">${esc(t("owner.noComments"))}</p>`}</div>
    </section>
    <p class="note">${esc(t("owner.note"))}</p>`;
}

// ---------- start ----------
$("#lang").addEventListener("change", async (e) => {
  store.set("lang", e.target.value);
  await setLanguage(e.target.value);
  render();
});
window.addEventListener("hashchange", render);

(async function start() {
  await setLanguage(store.get("lang", null) || guessLanguage());
  await loadLive();
  render();
  checkShared();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
