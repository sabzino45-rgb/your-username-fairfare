STATUS: BLOCK

# QA / Red Team report, cycle 1

Scope: R1 (share, paste and drop), R2 (one verdict word, numbers behind Details) and R3 (full-phone screenshot parser), plus the existing verdict engine.

Code under test: the files as they stood at 12:02 UTC on 2026-11-20. The Builder's Google Fonts removal (sw.js `fairfare-v3`) landed while I was testing, so I re-ran every probe on the final files. Probe scripts, inputs and screenshots are in `reports/cycle-1/qa_probes/`:
- `compare.py`, `probe_py.py`, `probe_js.mjs`, `cases.json`: 41 adversarial OCR texts, Python against JS.
- `unseen_fullscreen.json`, `run_unseen.py`: 12 new full-screen cases the Scan Engineer hasn't seen (spec R3).
- `truth.mjs`: each parsed verdict against the verdict for the true numbers.
- `sweep_loss.mjs`, `sweep_loss.py`: randomised search for an ACCEPT that loses money.
- `ui_probe.js`, `word_wrap.js`: Playwright runs against `python3 -m http.server 8767`. The server was stopped afterwards.

Baseline checks: `pytest -q` gives 37 passed. `run_eval.py --baseline reports/cycle-1/eval_before.json` reports no regression (synthetic scan_acc 1.0, fallback 0.175). All of these figures are **synthetic only**.

**Why BLOCK:**
- 4 high-severity wrong verdicts. In each, the app shows ACCEPT when the true offer is MARGINAL or DECLINE. In one of them the offer loses money.
- 1 high-severity safety and verdict issue: an old verdict stays on screen after a new screenshot.
- 2 medium-severity safety issues: numbers visible on the Check screen without opening Details, and the verdict word broken mid-word.

The verdict engine on its own is sound. Its inputs are the problem: the parser, and a stale UI state.

## Failures

### 1. A fare whose decimal point OCR dropped gives ACCEPT, even on an offer that loses money
- **Severity:** high. **Area:** scan and verdict. **Status:** existed before this cycle; not caused by cycle 1.
- **Repro:**
  - Settings: costMile 1.50, defaults otherwise.
  - Text: `"UberX\n£950\n6 mins (1.8 mi) away\n18 mins (7.2 mi) trip"`.
  - Card fare £9.50. OCR often loses the small "." in a bold fare.
- **Expected:** refuse the fare (CAN'T TELL), or DECLINE. The true take-home is **−£5.62**.
- **Actual:** fare 950, **ACCEPT**.
- **Same at default settings:** `£850` (true £8.50) gives ACCEPT, where the truth is DECLINE. `u03` `£845` gives ACCEPT at about £2,700/h.
- **Cause:** the only sanity check is £1 ≤ fare ≤ £1000. There is no check of fare per mile or per minute, so £850 for 9 miles passes.

### 2. A stray £ amount near the card is taken as the fare when the card's own fare is garbled
- **Severity:** high. **Area:** scan. **Status:** new behaviour from the R3 rule "nearest candidate within 4 lines above the legs".
- **Repro u09:**
  - Text: `"13:10 4G 66%\nUberX\nMonzo · You spent £32.50 at Shell\nE11.10\n5 mins (1.8 mi) away\n16 mins (6.6 mi) trip"`.
  - Expected: fare None (CAN'T TELL). The true £11.10 gives MARGINAL.
  - Actual: fare 32.50, **ACCEPT**.
- **Repro u02:**
  - The text is syn-fs-008 with the card fare garbled to `E8.45`.
  - Actual: fare 15.00, taken from "Alex: that's £15 for the tickets".
- The `_NOT_FARE` keyword list can't cover every notification ("spent", "for the tickets", "order", ...). "E for £" is the most common garble, and the parser then falls through to whichever £ amount is next.

### 3. Trips of an hour or more are read as minutes only
- **Severity:** high. **Area:** scan. **Status:** existed before this cycle.
- **Repro:** `"UberX\n£30.00\n5 mins (1.5 mi) away\n1 hr 20 mins (25 mi) trip"`.
- **Expected:** trip_min 80, or refuse.
- **Actual:** trip_min 20.
  - With optimise=hour: **ACCEPT** (£37/h worst case). The truth for 80 minutes is **DECLINE** (£11–17/h).
  - With default settings and a £40 fare: ACCEPT, where the truth is MARGINAL.
- The speed check only catches this when the miles are high enough (`u04`, 52 mi, was refused). Long airport runs in the South West are exactly this case.

### 4. An old verdict stays up while a new screenshot is read, and after the read fails
- **Severity:** high. **Area:** safety and verdict.
- **Repro (`ui_probe.js` step 3):**
  1. Paste text for a £30 offer. The card shows ACCEPT.
  2. Paste an image (Ctrl+V) on the Check screen.
- **Expected:** the verdict card clears to "—" or "Reading…" straight away, and shows CAN'T TELL if the read fails.
- **Actual:**
  - During "Reading the screenshot…" the green **ACCEPT** for the previous offer stays.
  - After "Couldn't read that screenshot" it still stays. That message sits below the fold, while the old word fills the top of the screen. If Details was open, it stays open with the old numbers (screenshot `02-stale-after-failed-paste.png`).
- **Cause:** `scanImage()` changes `lastText` and calls `updateCheck()` only on success. The catch path leaves the old offer in place.
- The paste, drop, picker and "Paste screenshot" paths are affected. A share starts a fresh page, so it isn't.
- A driver glancing at the screen sees a confident word for the wrong offer.

### 5. Rapid pastes: an earlier screenshot can overwrite a later one
- **Severity:** medium. **Area:** verdict.
- **Repro (`ui_probe.js` step 4, stubbed Tesseract):**
  - Paste #1 shows a £40 offer and its read takes 800 ms.
  - Paste #2, the latest, shows a £6 offer and its read takes 100 ms.
- **Expected:** DECLINE, the verdict for the last screenshot.
- **Actual:** **ACCEPT**. The slower, older read lands last and wins.
- **Cause:** `scanImage` has no request token or cancellation.

### 6. Parsed numbers are visible on the Check screen without opening Details
- **Severity:** medium. **Area:** safety (SAFETY.md: "No numbers to read").
- **Repro:** at 390×844, tap the demo, or finish any scan or text paste.
- **Expected:** no £ figures until Details is opened. That is the intent of R2 and SAFETY.md.
- **Actual:**
  - The `#readout` line "Read from the card: Fare shown **£12.40** · Pickup minutes 6 · … Trip miles 7.2" shows above the fold, at y≈708 of 844 (`01-demo-closed.png`).
  - The builder's check only looked inside `#verdict`.
- The shift-goal card's £/h sentence below it is also always visible. That one existed before this cycle and is low severity.

### 7. The verdict word breaks mid-word at common phone widths
- **Severity:** medium. **Area:** safety (glanceability).
- **Cause:** after the font change, the word falls back to system fonts. `.word` (58px) has `overflow-wrap: anywhere`.
- **Repro (`word_wrap.js`):**
  - At 390px, en **"MARGINA / L"** (`01-demo-closed.png`), plus es RECHAZAR, pt DUVIDOSO, bg ГРАНИЧНО, lt, ru and uk.
  - At 412px, lt, ru and uk still break.
  - At 360px the font is smaller (48px) and only ru and uk break.
- **Expected:** the whole word on one line, scaled to fit.
- **Caveat:** the sandbox has no narrow or condensed fonts. Android's Roboto with `font-stretch` might fit, so this needs checking on a real phone. It is most likely on iPhone and desktop.

### 8. A fare range ("£10.80–£13.20") takes the upper bound
- **Severity:** medium. **Area:** scan.
- **Repro:** `u08`.
- **Actual:** fare 13.20, ACCEPT. With the lower bound (10.80) the verdict is MARGINAL.
- **Expected:** refuse, or use the lower bound.

### 9. A leading digit lost to OCR ("l8 mins") gives a shorter trip
- **Severity:** medium. **Area:** scan.
- **Repro:** `"UberX\n£10.50\n6 mins (1.8 mi) away\nl8 mins (7.2 mi) trip"` with optimise=hour.
- **Expected:** refuse, or 18 minutes.
- **Actual:** trip_min 8, **ACCEPT**. The truth (18 min) is MARGINAL.
- The fare regex already maps l and I to 1. The leg regex doesn't.

### 10. A 0-minute leg with miles is accepted
- **Severity:** medium. **Area:** scan and verdict.
- **Repro:** `"UberX\n£21.00\n5 mins (2 mi) away\n0 mins (12 mi) trip"`.
- **Actual:** ACCEPT at £116–156/h, a nonsense range shown in Details.
- **Cause:** the speed check skips legs with `mins > 0` false, so a 0-minute leg is never checked. Manual entry has the same gap.
- **Expected:** treat 12 miles in 0 minutes as implausible and refuse.

### 11. Two stacked offers that show one leg each are merged into one offer
- **Severity:** medium. **Area:** scan.
- **Repro:** `u11`: `"08:01 4G 80%\n£7.20 · 3 min (1.0 mi)\n£21.40 · 12 min (6.0 mi)"`.
- **Actual:** fare 7.20 from offer A, trip 12 min and 6 mi from offer B. Verdict DECLINE (low confidence).
- **Expected:** `multiple_offers` and refuse. The multiple-offers rule only fires with more than 2 legs.

### 12. Python and JS disagree on non-ASCII digits
- **Severity:** low. **Area:** scan (parity).
- **Repro:** `"UberX\n£12.40\n٦ mins (١.٨ mi) away\n١٨ mins (٧.٢ mi) trip"`.
  - Python: legs parsed, MARGINAL.
  - JS: legs None, CAN'T TELL.
- Full-width digits behave the same way.
- **Cause:** Python's `\d` in `_LEG`, `_SURGE` and `_RATING` matches Unicode digits. The eval, which runs in Python, can therefore pass cases the app (JS) fails. The parity test doesn't cover this.

### 13. A very large text paste freezes the page
- **Severity:** low. **Area:** scan (performance).
- **Repro:** 800 KB of text with 20,000 £ amounts.
- **Actual:** 3.5–3.8 s per input event in Chromium.
- **Cause:** `lineAt` slices and splits the whole text for each match, so the cost grows with the square of the text size.

### 14. Refusals that will raise the fallback rate on real screenshots
- **Severity:** low. **Area:** scan.
- All of these give CAN'T TELL, so they are safe but each costs a manual entry:
  - A navigation line without an English keyword (`"12 min · 5.1 mi"`, or Spanish "llegada") is read as a third leg, so `multiple_offers` (`u12`, `nav_bar_non_english`).
  - A per-mile price line (`"£1.14/mi · £0.62/min"`) is taken as the fare, then dropped as out of range (`u10`).
  - A multi-stop trip (3 legs) is refused.
  - `"E12.40"` with nothing else readable, and `"rnins"`, are refused.
- **Unseen full-screen set:** 3 of 12 read correctly (u01, u06, u07). 3 refused when they should have read (u04, u10, u12). **6 gave wrong numbers** (u02, u03, u05, u08, u09, u11), against 1.00 on the Scan Engineer's own synthetic set. This is a sign the R3 fix is fitted to its own cases.

### 15. Details can stay open across two different offers with identical numbers
- **Severity:** low. **Area:** safety.
- The keep-open check compares the numbers, not the scan event. If a new screenshot has the same fields, Details stays open.

## Passed
- **Money-loss sweep:** 300,000 JS and 200,000 Python random offers, with cost per mile £0–3, all optimise modes and targets of 0 included. There was **no ACCEPT with a negative worst-case take-home** when the inputs were correct.
- **Verdict card:** when Details is closed it shows only the word, the sub-line, confidence and "Details (parked only)", with no £ and no digits. Details opens, closes on a new verdict, and stays open while the same offer is re-rendered.
- **RTL and long scripts:** ar, fa, ur, ps and ckb render `dir=rtl` with 7 LTR number wrappers. Those five, plus bn and ta, show no horizontal scroll at 360px, and Details closes on a new verdict.
- **Share target (real service worker, form POST):**
  - A non-image share, a fake PNG and an SVG all give "Couldn't read that screenshot", even while the app was on #demand.
  - An empty POST returns a 303 with no crash.
  - Afterwards Cache Storage holds only `fairfare-v3`, with no `fairfare-share`.
- **Paste and route handling:** a plain-text paste isn't intercepted. An image paste on another route is ignored.
- **Network (on the final code):** apart from same-origin requests, only cdn.jsdelivr.net, which is blocked here. The error path is graceful and the page logs no errors. The only non-GET requests were same-origin share POSTs, and no request carried image data off the device. My first run, before the Builder's fix, also saw fonts.googleapis.com and fonts.gstatic.com.
- **Note on the OCR host:** Tesseract.js v5 loads its language data from tessdata.projectnaptha.com by default. That is a second third-party host. Privacy should note it.
- **Parser parity:** Python and JS agree on 38 of the 41 adversarial texts. The 3 differences are item 12.
- **Adversarial texts handled correctly:** a £ amount in the surge line, comma decimals, km, a missing pickup, emoji, RTL marks, a fare below the legs (refused), and "£12.40 £5.00 off" (refused).
- **Safety review of the new strings:**
  - "Paste screenshot", the drop hint, "Details (parked only)" and the new verdict words don't prompt action while moving.
  - The share flow needs no tap inside the app.
  - Capture itself is parked-only by rule; the app can't detect motion. That is already a human gate.

## Not tested
- The real Android share sheet: PWA install, 2 taps and the 8-second target (R1 acceptance criteria 2 and 3).
- Real Tesseract OCR end to end. The CDN is blocked here, so the whole pixels-to-verdict path is untested.
- iPhone Safari paste, the real `navigator.clipboard.read()` permission prompt, and real OS drag and drop.
- Upgrading an installed v1 or v2 to v3.
- Real Android and iOS font rendering of the verdict word (item 7).
- Real Uber screenshots: no pilot data exists.

## Summary
BLOCK.
- The engine never ACCEPTs a loss when its inputs are correct.
- The parser feeds it wrong inputs:
  - a fare whose decimal point OCR dropped (£950 gives ACCEPT on a −£5.62 offer)
  - a stray £ amount next to a garbled card fare
  - "1 hr 20 mins" read as 20 minutes
  - "l8" read as 8 minutes.
- On 12 unseen full-screen cases, 6 gave wrong numbers. The synthetic 1.00 doesn't carry over.
- UI:
  - An old ACCEPT stays on screen while a new screenshot is read, and after the read fails.
  - Rapid pastes can show the older offer.
  - Parsed £ figures are visible without opening Details.
  - The verdict word breaks mid-word ("MARGINA/L" at 390px).
- R1 hand-off, cache deletion, the non-image path, RTL rendering and the network all passed.
- The real share sheet and real OCR were not tested.
