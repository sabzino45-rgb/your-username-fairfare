# Scan report, cycle 2 (fare zone)

**All numbers here come from synthetic, made-up text. None comes from a real Uber screenshot.** The fare-zone rule is built on guesses about the real Uber UK offer card's layout (listed at the end). Until 10-20 real, redacted screenshots are checked (human gate in human_gates.md), these numbers only show that the parser handles the patterns we invented.

## Numbers

Before = the cycle-1 parser (git HEAD), run on all 120 eval cases including the 28 new fare-zone cases: `reports/cycle-2/eval_fare_zone_before.json`. A copy is at `eval_before_fix.json`, the name the Orchestrator used. After = the cycle-2 parser: `reports/cycle-2/eval.json`. Judged side: synthetic (there are no pilot cases).

| metric (synthetic, 120 cases) | before | after | goal / limit |
|---|---|---|---|
| **wrong_number_count** (gated) | **11** | **0** | <= 0, **met** |
| false_accept_count | 10 | 0 | = 0, met |
| readable_manual_rate (readable_n = 86) | 0.1163 (10 of 86) | 0.0 | <= 0.02, met |
| scan_accuracy_overall | 0.965 | 1.0 | n/a |
| manual_fallback_rate (all 120) | 0.275 | 0.2833 | n/a (the rise is the 9 cards that should be refused, now refused correctly) |
| verdict median / p90 error | 0.0819 / 0.2214 | 0.0819 / 0.2214 | unchanged |

- On the 92 existing cases before any change: wrong_number_count 0 and readable_manual_rate 0.0 (0 of 73), as spec.md says. The new cases raise both under the cycle-1 rules, so they do test the failure.
- All 92 existing per-case rows are identical to `reports/cycle-2/eval_before.json`, apart from the two new columns. On the original 60, manual_fallback_rate is still 0.15. The three existing eval files are byte-identical (`git diff` is empty).
- `run_eval.py --baseline reports/cycle-2/eval_before.json` and `--baseline reports/eval_baseline.json` both exit 0.
- `pytest -q`: 79 passed. That includes JS parity on all 4 eval files and on 29 adversarial texts (7 of them new).
- Python vs JS on 3000 fuzzed texts (eval texts with lines dropped, swapped or added: non-Latin and emoji pills, badges, garbles): 0 differences in fields or warnings.
- `python tools/gate.py 2` reads `wrong_number_count = 0 <= 0`, goal met. It still returns FAIL because qa.md, privacy.md, economics.md and ops.md don't exist yet.

## What changed

### R2a. Metrics in tools/run_eval.py
- `wrong_number_count`: cases where at least one required field was given a value and it is wrong. A refusal (None) never counts.
- `false_accept_count`: cases where the parsed verdict is ACCEPT but the verdict for the true numbers is not. An expected null makes the true verdict UNKNOWN.
- `readable_manual_rate` and `readable_n`: among cases with all 5 expected fields non-null, the share sent to manual entry.
- These appear on both sides (pilot and synthetic) and in the printed line.
- Per-case rows gain `wrong_fields` and `true_decision`.
- `--baseline` also fails if `wrong_number_count` or `false_accept_count` rises. Older baselines that lack these metrics are skipped for them.
- Tests: `tests/test_eval_metrics.py` covers one wrong fare, one refusal, one false ACCEPT, and one correct null.

### R2b. New cases: `eval_set/synthetic_fare_zone.jsonl` (28 cases, syn-fz-001 to 028, kind `fare_zone`)
The Orchestrator's brief said `synthetic_farezone.jsonl`. I used the name in spec.md, which QA and the gate follow.

Written and evaluated before any parser change. QA's qa_probes files were not used as cases.

| group | n | expected fare |
|---|---|---|
| fare line missing, bare £ above the product label (tier pill, Polish, Romanian, Turkish, German and Lithuanian pills, a Halifax credit, a tip pill, a weekly-goal pill, a card purchase; km and mi) | 10 | null |
| readable card, second £ outside the zone (above the label: tier, standing order, French pill + fare only on Accept, Russian pill + fare on the label line, happy hour, rider total, Monzo balance; below Accept: tip, "yesterday") | 10 | the card's fare |
| no product label (2 with the only amount above a notification header or status bar; 3 readable, one with the fare only on Accept and one with a stray amount above a words line) | 5 | 2 null, 3 filled |
| ambiguous card (two amounts in the zone; zone fare differs from Accept) | 2 | null |
| a second offer cut off below the first | 1 | null (the spec keeps the multi-offer refusal), legs filled |

## The rules, in plain words (parser.py and engine.js, identical)

1. **Product label.** A line is a product label if it holds only ride-type names from one list, separators, and at most the fare amount. The list is: UberX, UberXL, XL, Comfort, Comfort Electric, Green, Exec, Executive, Lux, Black, Pet, Uber Pet, Access, Assist, WAV, Exclusive, Priority, Share, Electric, Taxi, Uber X Share. Examples: "UberX", "UberX · Exclusive", "UberX £12.40".
2. **The anchor** is the last product-label line above the first leg.
   - **Change from spec:** a line made only of badges ("Exclusive" or "Priority" alone) does not count as the anchor. The existing layout "£13.75 / +£2.20 surge / Exclusive / legs" would otherwise lose its fare.
3. **The fare zone** is three places:
   - the anchor line itself;
   - the lines between the anchor and the first leg;
   - the first Accept line below the legs.
4. **Reading the fare from the zone:**
   - Exactly one distinct fare-shaped amount there is the fare. The same amount twice is fine.
   - Two different amounts, or a zone amount that differs from the Accept amount, give None (`fare_ambiguous`).
   - No amount gives None (`fare_missing`). The parser never looks above the label.
   - A garbled money line between the label and the legs (€, $, a letter for £, or no £), with no Accept amount, gives None (`fare_unreadable`).
5. **Outside the zone is ignored.** That covers any amount above the label, and anything after the Accept line. It is neither a fare nor a conflict. This removes the needless refusals.
6. **A second offer below.** Between the legs and the Accept line (or the end of the text, if there is no Accept line), the fare is refused (`fare_ambiguous`) if there is either:
   - another product label, or
   - a fare-shaped amount that differs from the card's.

   This keeps the cycle-1 refusal for "a second card cut off" that spec.md asks for. The legs are still read.
7. **No product label: the cycle-1 rules, with a cut-off.** The parser goes up from the first leg to the nearest line that is not card text. Everything on and above that line is dropped, both as a fare and as a conflict.
   - A line is **not card text** if it is a status bar (a clock like "14:05", or a battery %), or if it still holds a letter once three things are removed: numbers (including OCR's O/o/I/l), card words (ride types, units, away/trip/pickup, Accept, surge/boost/included, per) and lone letters.
   - "Letter" means any letter, in any script, so non-English pills and notification headers ("Monzo", "Barclays · now") count as ordinary words.
   - The rest is unchanged: the window of 4 non-blank lines, card-fare-shaped candidates, conflict-means-None, and the Accept line.
8. Unchanged: leg, surge, rating, multi-offer and plausibility rules, candidate filters (card-fare shape, `_NOT_FARE`, pill-label neighbours, rate and add-on lines), and "when unsure, None".
9. Not done: the optional trailing badge after the fare ("£12.40 Fixed"). It stays a refusal.

**Tried and dropped:** a guard that refused the fare when the zone held ordinary words. It refused normal cards with a rider name or address, or "+£3.50 congestion charge", between the label and the legs (existing tests).

## Spec acceptance criteria

- **R1.1:** g01, g11 and g16 (QA cycle-1 set 3, now seen) give fare None. g02, g18, g19 and g20 give the true fare (9.80, 8.70, 14.20, 19.60). I ran only to check these seven. I did not tune on them or copy them.
- **R1.2:** the gated goal and the "must also hold" list are met (table above). pytest passes, JS parity included.
- **R1.3:** this file.
- **R2.1:** eval.json has the three metrics on both sides, and gate.py reads `wrong_number_count`.
- **R2.2:** the before-eval exists and shows both effects: wrong 11 > 0, and readable_manual 0.1163 > 0.0.
- **R2.3:** pytest passes.
- **Not checkable by me:** the QA acceptance criteria on QA's fourth unseen set, and the real-OCR runs. QA must run these.

## Cases still failing or refused, and why

- **In the eval set:** none. All 120 are correct (1.0).
- **Refusals I know of on readable cards (seen QA cycle-1 cards, not in the eval set):**
  - "Rider pays … You earn …" (g04): out of scope, refused.
  - "£12.40 Fixed" (g09): badge not allowed, refused.
  - "1 .8 mi" (g17): OCR garble, pickup refused.
  - A stray bare amount directly below the legs with **no** Accept line and no product label, followed by ordinary words (g14, "£250.00 / Weekly target"). Rule 6 treats it as a possible second card and refuses the fare.
- **About the g14 fix:** I had a rule that would read g14: an amount below the legs followed by ordinary words is a pill, not a second card. Building it from QA's own case was blocked by the session's safety check, which was right: it would have fitted the rule to QA's cards. I left it out. If QA's unseen set shows this pattern often, the Orchestrator can decide whether to add the rule.
- **Shapes of real cards that may refuse more than these figures show:**
  - No-label cards with a rider name between the fare and the legs.
  - A product label written in a way that isn't in the list (for example "Uber Comfort", or a non-English ride name).
  - A real card that has no Accept line in the OCR text, with any amount below the legs.

## Conclusions that rest on guesses about real Uber layouts

1. The product label (from the list above) sits above the fare, and the fare sits above the pickup and trip lines. The list itself is a guess.
2. An amount on the Accept button is the offer's own fare. Only the first Accept line below the legs counts.
3. "Exclusive" and "Priority" are badges that can appear on their own line under the fare. The other names are ride types.
4. Below the legs, before the Accept line, a card has no other £ amount. If one appears, it is taken as a second card.
5. Real notifications, pills and banners contain at least one ordinary word, or a clock or battery %, on a line between them and the card.
6. Rider names and addresses sit between the label and the legs, or between the legs. They do not affect the labelled zone, but they cut the window on no-label cards (safe: a refusal).
7. The test cases are invented. The 0 wrong numbers and the 0.0 readable-manual rate are on cases I wrote myself, knowing the rule. QA's fourth unseen set and real screenshots are the real check.

---

# Attempt 2 (after the QA BLOCK in reports/cycle-2/qa.md)

**Everything here is synthetic: invented text, and cards I drew myself. None of it is a real Uber screenshot.** I read qa.md for the mechanisms only. I did not open or use any case in `reports/cycle-2/qa_probes/`.

## What changed

### 1. A second, independent signal for screenshots: text height (engine.js and app.js, scan path only)
- **`fareFromLines(lines)`** in app/js/engine.js is a pure function. It takes `[{text, height}]`, with height = the bbox's y1 - y0 from Tesseract's `data.lines`. It returns the fare or null.
  - It takes the tallest line that holds a money-shaped amount. That means a £ amount, or any `d.dd` with 1 to 3 digits before the point, such as "E14.20" or "4.92".
  - That line's £ amount is the fare only if all of these hold:
    - the line is at least **1.5 times the median height** of all text lines;
    - it is at least **1.25 times as tall as every other money-shaped line** (a 25% margin);
    - it holds exactly one distinct £ amount, with the usual OCR repairs (O/I/l, non-ASCII digits). Rates such as "£1.10/mi" and add-ons such as "+£2.00" are skipped.
  - Fewer than 3 text lines gives null.
  - If the tallest money line has no £ (a misread "E14.20", or a rating), the result is null. It is never the next one down.
- **`reconcileScanFare(offer, geoFare)`:** if the text-rule fare and the height fare disagree, or either is null, the fare becomes null. The warning is `fare_height_disagrees`, and the card goes to manual entry. With no geometry (pasted text), the offer is unchanged.
- **app.js `scanImage`:**
  - Both OCR passes now ask Tesseract for `{text, blocks}`. Each pass keeps its own text and line heights.
  - The lines from whichever pass wins are stored with that pass's text (`scanGeo`).
  - `updateCheck` applies the height check only while the text box still holds exactly that scanned text. Editing the box, pasting or the demo clears it, and those are then treated as pasted text.
  - Nothing else in app.js changed. No UI, styles or lang files were touched.
- **Tests:** `tests/test_js_geometry.py` runs 13 of my own line lists and the reconcile cases in Node.

### 2. Stricter text rules (parser.py and engine.js, identical)
- **Label variants count as labels:**
  - "Uber" before any name, with or without a space or hyphen ("Uber X", "Uber-X", "Uber XL", "Uber Comfort", "Uber Exec", "Uber Green");
  - "Uber" alone and "X" alone;
  - chips such as "Uber X · Comfort";
  - a label glued to an unreadable fare ("UberX9.80", "UberXE12.40", "UberX E12.40").

  Treating more lines as labels is the safe direction. An amount above a label is ignored, so a wrong label can only cause a refusal.
- **Window:** the anchor is the label nearest above the first leg. If more than **3** non-blank lines sit between that label and the first leg, the fare is None (`fare_label_too_far`).
  - Rating-only and badge-only lines are not counted. Otherwise the standard "fare / surge line / Exclusive / rating" card (an existing test) would be refused.
- **Accept:** an amount on an Accept line counts only when that line is below the legs.
  - In the zone, an Accept-line amount is not a fare.
  - With no label, an Accept line above the legs (another card's) refuses the fare.
- **Rider price:** an amount is rejected if its line, or the non-blank line just above or below, says "rider(s)", "customer pays", "you paid" or "total paid".
- **No label at all: departure from the instruction.** The instruction was "no label, fare = None". I did **not** apply it literally.
  - 16 of the original 60 cases use the label-free "£fare / Pickup: … / Trip: …" layout. spec.md requires those rows to stay unchanged, and `--baseline` would fail.
  - Instead, with no label the cycle-1 rules plus the attempt-1 cut-off stay, with two new limits:
    - below the cut-off there must be exactly **one** distinct amount;
    - an Accept line above the legs refuses.
  - For **screenshots** the height check now covers this path: k11 below is that exact case, and the app refuses it.
  - For **pasted text** there is a remaining risk. If OCR loses both the label and the fare, a lone stray amount still becomes the fare.
  - If the Orchestrator wants the literal rule, it is a one-line change in each engine. It would cost 16/60 original rows, plus syn-fs-005, syn-fs-009, syn-fz-023/024 and syn-fz2-016, as refusals.
- **Bug found by real OCR:** in dark mode the rating star was read as "%", so "4.90 %" looked like a battery level and cut the window. A battery % now cannot follow a decimal point, and "%" counts as a rating mark. This came from my own k7 card, and a regression test was added.

## New cases: `eval_set/synthetic_fare_zone_2.jsonl` (20 cases, syn-fz2-001 to 020, my own)
- Label variants with the fare line lost and a stray amount above (Uber X, Uber Comfort, Uber Green, Uber-X, glued "UberX9.80").
- Readable variants (Uber XL, Uber Exec, Uber, Uber X with a rider name, the "Uber X · Comfort" chip).
- Rider-price captions (rider pays, customer pays, total paid).
- Accept-line amounts above the legs, and Accept inside the zone.
- A label 4 lines above the legs.
- A cropped card with no label; a surge, badge and rating stack; a "You paid" push.

The before-eval was saved first: `reports/cycle-2/eval_attempt2_before.json` (attempt-1 rules).

## Numbers (synthetic, 140 cases, judged side)

| metric | attempt 1 rules | attempt 2 rules |
|---|---|---|
| **wrong_number_count** (gated) | **10** | **0** |
| false_accept_count | 9 | 0 |
| readable_manual_rate (n = 95) | 0.0316 | 0.0 |
| scan_accuracy_overall | 0.9814 | 1.0 |
| verdict median / p90 | 0.0819 / 0.2214 | unchanged |

- `pytest -q`: 87 passed. That includes JS parity on all 5 eval files, 29 adversarial texts and the Node geometry test.
- Python vs JS on 3000 fuzzed texts: 0 differences in fields and warnings.
- `--baseline reports/eval_baseline.json` and `--baseline reports/cycle-2/eval_before.json` both give no regression. All 92 earlier per-case rows are unchanged.
- **Caveat:** I wrote these cases knowing the rules, so 0 here is not evidence on unseen cards. QA's new unseen set is the real check.

## Real OCR through the app
- **Setup:**
  - The app was served with `python3 -m http.server 8776` from app/ and stopped afterwards.
  - Cards were drawn in Playwright at 390×844, 2× scale, in light and dark, and scanned via `#scan-file`.
  - 0 requests left the origin, and the page logged 0 errors.
  - Scripts and raw results are in `reports/cycle-2/scan_ocr/` (`run.js`, `an.mjs`, `result.json`, `result_veto.json`).
- **Verdicts:** use the app's default settings. "Truth" is the verdict on the card as drawn (CAN'T TELL when the fare isn't on it); "real" is the verdict on the fare the card would really have.

| card (light and dark) | fare read by the app | app verdict | truth / real verdict |
|---|---|---|---|
| k1 plain UberX £12.40 | 12.40 / 12.40 | MARGINAL / MARGINAL | MARGINAL |
| k2 fare white on a green badge, pill "£58.40" above | None / None (OCR lost the badge) | CAN'T TELL / CAN'T TELL | MARGINAL |
| k3 misspelt "Uber X", pill "£63.20" above | 13.80 / 13.80 | MARGINAL / MARGINAL | MARGINAL |
| k4 "£16.00 / Rider pays" caption under the £10.40 fare | 10.40 / 10.40 | MARGINAL / MARGINAL | MARGINAL |
| k5 "Uber Comfort", fare on a green badge, pill above | None / None (badge lost) | CAN'T TELL / CAN'T TELL | ACCEPT |
| k6 another card's "Accept £31.50" above an "Uber X" card | 8.20 / 8.20 | MARGINAL / MARGINAL | MARGINAL |
| k7 no label, £11.60 | 11.60 / 11.60 | ACCEPT / ACCEPT | ACCEPT |
| k8 fare not drawn, pill "£49.30" above | None / None | CAN'T TELL / CAN'T TELL | CAN'T TELL (real MARGINAL) |
| k9 badge fare £9.80, pill above | None / None (badge lost) | CAN'T TELL / CAN'T TELL | ACCEPT |
| k10 chip "UberX · Comfort" at the top, pill amount £47.20 drawn as plain bold text, card fare on a badge (lost by OCR) | None / None. **The text rules read 47.20 in both modes; the height check vetoed it.** | CAN'T TELL / CAN'T TELL | CAN'T TELL (real ACCEPT) |
| k11 no label, pill amount £52.60 as plain bold text, fare line absent | None / None. **The text rules read 52.60; the height check vetoed it.** | CAN'T TELL / CAN'T TELL | CAN'T TELL (real MARGINAL) |

- **False ACCEPTs: 0 of 22 scans.**
- **The height check is doing real work.** In k10 and k11 the text rules are fooled under real OCR, and the app still refuses.
  - In my first k10/k11 drawings the pill was white on black, and OCR never read it. The pills had to be redrawn as plain text to test the check at all.
- **Readable cards sent to manual entry:**
  - 6 of 16 scans (37.5%), all of them badge fares that Tesseract dropped (k2, k5, k9, both modes).
  - Non-badge readable cards: 0 of 10.
  - Over QA's 25% target only if real fares sit on a coloured badge. The badge loss itself is open; see below.
- Scan time: 230-850 ms, headless desktop Chromium.

## Open items and guesses about real layouts
1. **Height check (a guess):** on a real Uber card the fare is the tallest text, at least 1.5 times the median line height and 25% taller than any other amount. If a real earnings pill or rider price is drawn as large as the fare, the check gives null: a refusal, never a wrong number. If the fare is lost and a stray amount is the tallest money line *and* the text rules pick that same amount, both signals agree on the wrong number. I could not produce that with my drawings.
2. **Green-badge fares are lost by Tesseract** (8 of 8 badge scans here). The result is safe (CAN'T TELL) but costs manual entry. A fix would need local inversion of coloured regions before OCR (a third pass). I have not done it; it is image preprocessing, not a reading rule. Whether real Uber fares sit on a badge is unknown.
3. **Pasted text with no label** keeps the lone-amount fallback (departure above). The risk is a double OCR loss (label and fare) plus a lone stray amount, with no geometry to catch it.
4. **The label variants and the 3-line window** are guesses. A real card with more than 3 counted lines between the label and the pickup (rider name, address, notes) would be refused. That is safe, but it may raise the manual-entry rate on real screenshots.
5. **Rider-price words** are English only.
6. All figures are synthetic. Real, redacted screenshots are still the step that matters (human gate).

---

# Attempt 3 (after QA's "Attempt 2 re-test")

**Everything here is synthetic: invented text, and cards I drew. None of it is a real Uber screenshot.** I read qa.md for the mechanisms only. No case in `reports/cycle-2/qa_probes/` was opened or used. All cards and cases below are my own.

## 1. Root cause fixed: OCR now reads text on coloured badges and buttons (engine.js `cleanPixels`, used by app.js `prepareForOcr`)
The clean-up is a pure function on RGBA pixels, so Node can test it.
- **Outside coloured regions it works as before:** greyscale, dark mode flipped, one cut-off at 140.
- **Coloured regions** are cells of 6×6 px where at least half the pixels are saturated (max − min channel ≥ 60). They are joined 4-way and need at least 12 cells.
- **Solid blocks** are a black button or chip in light mode, or a white one in dark mode: cells at least 90% past a cut-off of 70. A block must look like a button:
  - at least 10 × 4 cells;
  - at least 60% of its cell rows must span 80% of its width.

  A big bold glyph never meets that.
- **Inside a region or block, polarity doesn't matter.** Ink is any pixel whose max-channel distance from the region's own background colour is more than 90. White on green, white on blue, black on yellow, and white on a black button all come out as black text on white.
- **The anti-aliased rim** (3 px at each end of a row run, and 3 px at the top and bottom of each column run) is background. Without that, rim specks made Tesseract's word box 60% too tall.
- **Images without colour or solid blocks are unchanged**, pixel for pixel. The two OCR passes and their selection are unchanged.
- **Measured on my own cards with the app's Tesseract pass 1** (`scan_ocr/attempt3/diag.js`, `diag.json`): fare read correctly on **every badge card, light and dark**. Green: c03, c06, c07, c13 and c15. Blue: c04. Yellow: c05. Before this change OCR lost 8 of 8 badge fares (attempt 2).
- The "Accept" button and a dark label chip, both white on black, were never in the OCR text before. They are now read on all 34 scans that have them.

## 2. Screenshot rule: label or Accept (engine.js `cardMarkerFound`, used in `reconcileScanFare`)
- A scanned fare stands only if the OCR text has one of two markers:
  - a ride label (variants included) above the first leg, or
  - an Accept line on or below it.
- Otherwise the fare is None (`fare_no_card_marker`).
- This applies to screenshots only. Pasted text keeps the text rules.

## 3. Promo captions (parser.py and engine.js, identical)
- An amount is rejected if any of these hold:
  - its own line has bonus, promo, reward(s), streak, quest, extra, earn/earns/earned/earning(s) or boost;
  - the next non-blank line is a caption;
  - the previous non-blank line is a caption, unless that caption sits directly under another £ amount (then it belongs to that one).
- **A caption** is a line with one of those words, no £ amount of its own, and not a surge/boost "included" line (`_SURGE`).
- **Why the "no £ of its own" condition:** without it, an existing case (syn-fs-009, "Quest: 5 more trips for £15.00 bonus" above the fare) lost its fare. That line is a self-contained promo, not a caption for the next amount.
- **Why the "belongs to the amount above" condition:** "£62.10 / Earned so far / £10.70" reads the £10.70 fare (syn-fz3-016).

## 4. Height check on word boxes (engine.js `fareFromWords`; app.js now passes `data.lines[].words` with height and previous word)
- **What I measured** (28 scans of 14 cards, light and dark, `diag.json`):
  - Tesseract **word** boxes are proportional to font size. A 34 px fare gives 49 px, 30 px gives 43, 28 px gives 40, 22 px gives 32, 15–17 px body text gives 21–25, and 40 px gives 54. That is about 1.43 px of box per px of font.
  - Same-size amounts measure within 1 px of each other (49 against 49). A "/" adds about 5% ("£1.14/mi" 22 against 21).
  - Line boxes, used in attempt 2, were not proportional. That was QA's finding.
- **The rule:**
  - The tallest money word must hold the fare's £ amount.
  - It must be at least **1.5× the median word height** (unchanged).
  - It must be at least **1.15× every other money word**. The 15% margin covers about 5% measurement noise with room to spare, so the check refuses only when another amount is drawn within about 13% of the fare's size. Attempt 2 refused at about 80%.
  - A lone "£" word followed by "12.40" counts as £12.40.
- **On my cards:**
  - A plain fare is 1.6–1.96× the median word.
  - A pill at 22 px against a 34 px fare is 0.65×, and passes.
  - A pill drawn as large as the fare, or larger, still refuses. That is safe and deliberate.

## Numbers
**Text level** (`eval_set/synthetic_fare_zone_3.jsonl`, 16 new cases of my own: promo, reward, streak, quest and earn captions above or below, surge/boost-included lines, an Accept-line repeat, a bonus after Accept, a no-label cropped card). The before-eval was saved first: `reports/cycle-2/eval_attempt3_before.json`.

| metric (synthetic, 156 cases) | attempt-2 rules | attempt-3 rules |
|---|---|---|
| **wrong_number_count** (gated) | 5 | **0** |
| false_accept_count | 4 | 0 |
| readable_manual_rate (n = 103) | 0.0 | 0.0 |
| scan_accuracy_overall | 0.9936 | 1.0 |

- `pytest -q`: 90 passed. That includes parity on all 6 eval files and 29 adversarial texts, plus the Node tests: `fareFromWords` (13 cases), label/Accept and reconcile, and `cleanPixels` on 9 synthetic pixel images.
- Python vs JS on 3000 fuzzed texts: 0 differences.
- `--baseline reports/eval_baseline.json` and `--baseline reports/cycle-2/eval_before.json`: no regression. The 92 earlier rows are unchanged.
- `tools/gate.py 2` reads the goal as met.

**Real OCR through the app:**
- **Setup:**
  - `python3 -m http.server 8778` from app/, stopped afterwards.
  - Playwright, 390×844 at 2×, `#scan-file`, 17 cards × light and dark = 34 scans.
  - 0 requests left the origin, and the page logged 0 errors.
  - Scan time 265–830 ms.
  - Files are in `reports/cycle-2/scan_ocr/attempt3/` (`cards.js`, `draw.js`, `run.js`, `an.mjs`, `result.json`).
- **Verdicts** use the app's default settings. "Truth verdict" is the verdict on the true fare; CAN'T TELL where the card shows no fare.

| card | fare read (light / dark) | app verdict (light / dark) | truth verdict |
|---|---|---|---|
| c01 plain, fare 34 px | 12.40 / 12.40 | MARGINAL / MARGINAL | MARGINAL |
| c02 small fare (28 px on 16 px body) | 11.80 / 11.80 | ACCEPT / ACCEPT | ACCEPT |
| c03 fare white on green | 14.20 / 14.20 | MARGINAL / MARGINAL | MARGINAL |
| c04 "Uber Comfort", fare white on blue | 15.60 / 15.60 | ACCEPT / ACCEPT | ACCEPT |
| c05 fare black on yellow | 9.80 / 9.80 | ACCEPT / ACCEPT | ACCEPT |
| c09 rider price "£16.00 / Rider pays" under the fare | 10.40 / 10.40 | MARGINAL / MARGINAL | MARGINAL |
| c10 label on a dark chip | 11.40 / 11.40 | ACCEPT / ACCEPT | ACCEPT |
| c11 rate line "£1.14/mi · £0.62/min" | 14.20 / 14.20 | MARGINAL / MARGINAL | MARGINAL |
| c12 "+£2.20 surge included" | 13.75 / 13.75 | ACCEPT / ACCEPT | ACCEPT |
| c13 green badge fare, smaller pill "£71.90" above | 16.40 / 16.40 | MARGINAL / MARGINAL | MARGINAL |
| c14 tip "£2.00" after Accept | 12.80 / 12.80 | ACCEPT / ACCEPT | ACCEPT |
| c06 green badge fare, pill "£58.40" drawn **as big as** the fare | None / None | CAN'T TELL | MARGINAL (refused by the height margin) |
| c07 green badge fare, "£30.00 / Streak reward" drawn **bigger** | None / None | CAN'T TELL | ACCEPT (the height check refuses) |
| c15 green badge fare, "£45.00 / 3 trips to go" drawn bigger, in the zone | None / None | CAN'T TELL | ACCEPT (two amounts in the zone) |
| c16 pill "£64.00" above the label, drawn bigger than the fare | None / None | CAN'T TELL | ACCEPT (the height check refuses) |
| c08 no label and no Accept line | None / None | CAN'T TELL | ACCEPT (the label-or-Accept rule refuses) |
| **c17 residual-risk probe:** fare **not drawn**, "£45.00 / 3 trips to go" at 40 px between the label and the legs | **45.00 / 45.00** | **ACCEPT / ACCEPT** | CAN'T TELL → **false ACCEPT** |

**Summary of the 34 scans:**
- **Wrong fares: 0 on the 32 scans of cards that show their fare.** That includes every badge card.
- **Manual entry on the 11 normal cards (c01–c05, c09–c14): 0 of 22 scans (0%).** Target ≤ 25%.
- **Manual entry on all 16 cards that show a fare: 10 of 32 (31%).** All 10 are the 5 hostile cards (c06, c07, c08, c15, c16). Each is refused by a rule on purpose, because a stray amount is as big as the fare or bigger, or there is no label and no Accept line.
- **c17 (2 scans) is the one false ACCEPT.** It is a deliberate probe of the remaining hole.

## The remaining hole (why c17 still fails), stated plainly
- **What it takes:**
  - the card's fare is missing from the OCR text;
  - **and** a stray amount drawn bigger than everything else sits between the label and the legs;
  - **and** its caption has none of the promo words.
- **Why nothing catches it:** in text, "UberX / £45.00 / 3 trips to go / legs" looks exactly like a real card with a rider note. The height signal agrees, because the stray amount is the tallest text.
- **What changed this attempt:** the way OCR lost the fare in QA's real scans (white on a coloured badge) is fixed on every badge I drew. So this now needs the fare to be lost some other way, or never shown.
- **Ways to close it, all guesses:**
  - a tighter fare-per-mile cap (£45 for 8.8 mi passes today's generous £20 + £6/mi + £1/min bound);
  - refusing any zone amount followed by an ordinary-words line. That would also refuse cards with a rider name under the fare.
- **I recommend not guessing further without real screenshots.** That is a call for the Orchestrator and the owner.

## Assumptions about real layouts added in this attempt
1. A real fare badge or Accept button is a solid coloured (or black or white) shape with text in one contrasting colour. Gradients, photos or transparent badges are not handled.
2. On a real card the fare is drawn at least about 15% bigger than any other amount on screen, and 1.5× the median word. If a real earnings pill is as big as the fare, the card is refused (safe, but manual entry).
3. A real card shows a ride label or an Accept line that OCR can read.
4. Promo captions are in English and use the listed words.
5. All figures are synthetic, including my real-OCR drawings. Real, redacted screenshots remain the step that matters.
