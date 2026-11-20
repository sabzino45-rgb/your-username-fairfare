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

---

## Attempt 2 re-test (2026-11-20)

**STATUS stays BLOCK.**
- Every High item from attempt 1 is fixed, along with most Medium items.
- But 2 of the 21 fresh unseen full-screen cases (f08, f16) give a wrong number that turns a MARGINAL offer into **ACCEPT**. A third (f05) does the same under "optimise per hour", or at a higher fare.
- Your rule is to BLOCK on any fresh case that produces a wrong ACCEPT.
- **Caveat:** all three cases are invented, and none has been seen on a real Uber screenshot:
  - f08 is an OCR garble (£ read as €).
  - f16 is a layout (the fare inside the Accept button).
  - f05 is a duration format ("1h20min").
- If the owner judges these unrealistic, every remaining item is Medium or Low.

**Code under test:**
- parser.py and engine.js (12:08–12:10).
- app.js and sw.js `fairfare-v4` (18:18), with self-hosted Tesseract: `vendor/tesseract/fairfare-worker.js`, `lang/eng.traineddata.gz.wasm`, `prepareForOcr`, two OCR passes.
- `pytest -q`: 55 passed.
- `run_eval --baseline reports/cycle-1/eval_before.json`: no regression. Synthetic scan_acc 1.0 on 92 cases (12 of them are my old cases, which are no longer unseen). Fallback 0.2065.

**Mid-test change:** the Orchestrator replaced the OCR path while I was testing (self-hosted engine, image pre-processing, a reused worker, then the `.gz.wasm` model file). I re-ran:
- the UI checks with a stub that has `createWorker`, `setParameters` and `recognize` (`ui_probe3.js`);
- real OCR end to end on the final code (`ui_probe3.js`, `ocr_fresh.js`).

### 1. Attempt 1 High and Medium items

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Fare with a lost decimal point gives ACCEPT on a loss | **fixed** | `£950` with cost £1.50/mi gives fare None, CAN'T TELL (`fare_implausible`). `£850` and `£999` are refused too. |
| 2 | Stray £ amount used in place of a garbled card fare | **fixed for the reported cases** | u01, u02 and u09 give fare None (`fare_unreadable`). See fresh cases f08 and f16 for variants that still get through. |
| 3 | "1 hr 20 mins" read as 20 | **fixed** | 80 min. "1 hour 5 minutes" gives 65 and "1 hr 25 mins" gives 85. **Not fixed** for "1h20min" with no spaces (f05). |
| 4 | Old verdict shown while reading and after a failed read | **fixed** | During the read: "—", "Reading the screenshot…", no Details, no digits. After a failure, or an image with no offer: CAN'T TELL. Checked with a worker stub and with real OCR. |
| 5 | Rapid pastes | **fixed** | 2 and 3 pastes with reversed delays: the newest wins. Typing during a pending read also wins. |
| 6 | Offer numbers above the fold | **fixed** | The readout is now inside Details. With Details closed, no offer £ figure is visible at 390×844. Low remainder: the shift-goal chips (£200/£300/£400) now sit above the fold (`a2-01-demo.png`). They are planning figures, not the verdict. |
| 7 | Verdict word broken mid-word | **fixed** | All 26 languages × 4 words fit on one line at 320, 360, 390 and 412px. The smallest word is 37px (ru at 320px). Low remainder: at 320px, Tamil's tab bar makes the page scroll sideways by 12px. |
| 8 | Fare range | **fixed (policy)** | Uses the lower end (£10.80, MARGINAL). |
| 9 | "l8 mins" | **fixed** | 18. |
| 10 | 0-minute leg | **fixed in the parser** (gives None). **Not fixed in manual entry:** `manualOffer` with fare 21, pickup 5 min / 2 mi, trip 0 min / 12 mi still gives ACCEPT at £116–156/h. That is Medium: the driver typed it while parked. |
| 11 | Stacked offers with one leg each | **fixed** | `multiple_offers`. |
| 12–13, 15 | Parity, huge paste, Details across identical offers | **fixed** | Parity: 0 differences on 41 adversarial texts and 21 fresh cases. Huge paste: 307 ms. A new identical scan closes Details. |

- **New Low item:** `MAX_TEXT = 5000` cuts the text before parsing. A 5,445-character text with the card at the end gives CAN'T TELL. Real screen OCR is about 300–600 characters, so the risk is low.
- **Money-loss sweep repeated:** 300,000 JS offers with correct inputs gave 0 ACCEPTs with a negative worst-case take-home.

### 2. Fresh unseen cases (`qa_probes/fresh_cases.jsonl`, 21 cases, not in eval_set)

The cases cover:
- earnings pill and € / $ / missing-£ garbles
- pence fares and km-only cards
- airport runs over an hour, including "1h20min"
- a "+£5.00 airport fee" line
- UberXL, Comfort and Uber Green cards
- Deliveroo, PayPal, WhatsApp and Uber One lines
- a stop leg and a "2 stops" label
- a Trip Radar list with pickups only
- dark-mode noise ("rnins", "2l.35", "13.O")
- fare in the Accept button, odd spacing, reordered legs

**Text level** (`score_fresh.py`). Python and JS are identical on all 21. A correct refusal counts as correct.

| field | correct | missed (None but readable) | **wrong** |
|---|---|---|---|
| fare | 14 | 2 | **5** |
| pickup_min / pickup_miles | 19 / 19 | 2 / 2 | 0 / 0 |
| trip_min | 20 | 0 | **1** |
| trip_miles | 21 | 0 | 0 |

**6 of 21 cases have a wrong number.**

| case | input (short) | parsed | true | verdict effect |
|---|---|---|---|---|
| **f08** | `£25.00 from Sam via PayPal` / `UberX` / `€9.60` / legs | fare **25.00** | unreadable (£9.60) | **ACCEPT**, where £9.60 gives MARGINAL. "PayPal" isn't caught by `\bpay\b`, and "€" isn't in the garbled-fare pattern (ASCII letters only). |
| **f16** | `£71.30` (earnings pill) / `You're online` / legs / `Accept £10.20` | fare **71.30** | £10.20 | **ACCEPT**, where £10.20 gives MARGINAL. The pill is within 4 lines above the legs and passes the plausibility bound (£20 + £6/mi + £1/min = £93.60). Same result with real OCR, light and dark. |
| **f05** | `1h20min (28.0 mi) trip` | trip_min **20** | 80 | MARGINAL at defaults, but **ACCEPT** with optimise=hour (truth MARGINAL), and ACCEPT at a £44 fare (truth MARGINAL). `h\b` needs a word boundary before the digits. Same result with real OCR. |
| f21 | `£30 for the shopping x` / `Uber Green` / `$12.95` | fare 30 | unreadable (£12.95) | ACCEPT. That happens to match the truth (£12.95 also gives ACCEPT), but the number is wrong. |
| f13 | `£6.00 for every 3 trips until 22:00` / `€13.10` | fare 6.00 | unreadable | DECLINE: a wrong number, but on the safe side. |
| f18 | `£ 12 .40` | fare 12.00 | 12.40 | MARGINAL, the same as the truth. |

**Real OCR, end to end** (`ocr_fresh.js`, `score_ocr.py`; images in `qa_probes/ocr_imgs/`):
- 13 fresh cases, each drawn as a phone-screen PNG in light and dark mode (26 scans).
- Uploaded through `#scan-file` to the self-hosted engine. The parsed fields come from `#ocr`.
- Fields: **124 correct, 2 missed, 4 wrong.**
  - The wrong ones are f05 (trip 20, both modes) and f16 (fare 71.30, **ACCEPT**, both modes).
  - The € and $ garbles (f08, f21) were refused as None when drawn as images.
- Every other case gave the right verdict, including dark mode, a 1 hr 25 min airport run, km-only cards, an earnings pill and a WhatsApp £ line.
- Speed: 194–757 ms per scan in headless Chromium on a desktop. A phone will be slower.
- 0 requests left the origin, and there were no page errors.
- Separately (`ui_probe3.js`): demo light and dark, a full phone screen in dark mode, an earnings pill and a no-offer image all came out right. A scan with the network off also worked after one earlier online scan.

### 3. New problems caused by the fixes

- **Real Tesseract output puts a blank line between text blocks, and the parser counts those lines.**
  - **Severity:** medium. **Area:** scan. Fails safe (refusal), but raises manual entry.
  - The fare must be within 4 lines above the first leg, and the blank lines count towards those 4.
  - **Repro:** f15 as a real OCR image. The text is `"…£16.85\n\n+£4.10 surge\n\n4.89 x\n\n3 mins (0.9 mi) away…"`.
    - Result: fare None (`fare_not_near_legs`).
    - With the blank lines removed: £16.85.
  - So a normal card with both a surge line and a rating line goes to manual entry. The synthetic eval has no blank lines, so it can't see this.
- **Readable cards wrongly sent to manual entry:**
  - Eval-set readable cards: 0 of 66.
  - Fresh text cases: 2 of 15 readable cards.
    - f06: a "+£5.00 airport fee" line is taken as the fare, then dropped as implausible.
    - f11: "rnins" isn't read as "mins".
  - Real OCR: 2 of 22 readable scans (f15 in both modes, from the blank-line issue).
  - Overall, 6 of 21 fresh text cases need manual entry. 4 of those 6 are correct refusals.
- **Ride-type list:** UberXL was read correctly in this test. A badge in front of the fare that isn't in the list ("New £12.40") would be refused. That is the Scan Engineer's guess and is still untested on real screenshots.

### Remaining Medium and Low items
- **Medium:**
  - f08, f16 and f05, above. These are the cause of the BLOCK.
  - The blank-line fare window.
  - Manual entry still accepts a 0-minute leg with miles, and an absurd fare such as £999 for 7 miles.
- **Low:**
  - The f13, f18 and f21 wrong numbers.
  - The airport-fee line (f06) and "rnins" (f11) refusals.
  - The `MAX_TEXT` cut-off.
  - The shift-goal chips above the fold.
  - The 12px sideways scroll at 320px in Tamil.

### Not tested
- The real Android share sheet: the 2-tap and 8-second target.
- Real Uber screenshots: no pilot data exists. My images are drawn imitations, so they are cleaner than real screenshots.
- OCR speed on a real phone.
- iPhone Safari paste.
- The real clipboard permission prompt.
- Upgrading an installed v1–v3 to v4.
- Real phone fonts.
