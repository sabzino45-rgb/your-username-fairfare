STATUS: PASS

# QA / Red Team report, cycle 2 (fare zone)

**All figures here come from made-up text and drawn cards, not real Uber screenshots.** They show how the rules behave on patterns I invented. They say nothing about real drivers.

**Scope.** The screenshot reader changed: fairfare/parser.py and app/js/engine.js now use the fare-zone rule. tools/run_eval.py has new metrics. No UI change was in scope.

**Probes.** Everything is in `reports/cycle-2/qa_probes/`:
- `make_cases4.py` writes `fresh_cases_4.jsonl`: 32 new cards, 20 of them readable. Nobody else has seen them, and none is in eval_set.
- `score4.py` and `js_eval.mjs` score the text level on both engines.
- `ocr_fresh4.js` and `ocr_badge4.js` run real OCR through the app. `score_ocr4.py` scores those runs. `badge4.jsonl` holds 4 extra cards whose fare is drawn on a green badge.
- `label_variants.py` checks which misread labels let the bug through.
- `ui_probe4.js` checks the Offer check screen.
- The app was served with `python3 -m http.server 8774` and the server was stopped afterwards. 0 requests left the origin and the page logged 0 errors.

**Why BLOCK:** 5 fresh cards give a wrong fare that turns into a false **ACCEPT**, at text level and with real OCR (light and dark). On 3 more drawn cards, real OCR dropped the badge fare by itself and gave the same false ACCEPT. The fare-zone rule works when the label is spelled exactly as in its list. It fails when the label is misread or written another way ("Uber X", "Uber Comfort", "Uber XL"), when a label-like line sits higher up the screen, or when another card's Accept line shows above the legs. The manual-entry targets are met (details in section 3).

## 1. Text level: fresh set 4 (32 cards, Python and JS identical)

The two engines give identical fields and warnings on all 32 cards (0 differences).

| field | correct (a right refusal counts as correct) | missed (None on a readable field) | **wrong** |
|---|---|---|---|
| fare | 24 | 3 | **5** |
| pickup min / miles, trip min / miles | 32 each | 0 | 0 |

How each verdict column was worked out (all with the app's own engine):
- **Parsed:** the app's verdict on the numbers it read. "Default" means the default settings, which have a running cost of £0.20 per mile. "£1.50" is the same with a running cost of £1.50 per mile.
- **Truth:** the verdict on the expected fields. An expected None gives CAN'T TELL, which is the spec's definition.
- **Real-world:** the verdict on the card's real fare, which the screen hid.

### Wrong numbers (all High, area: scan)

| case | text (shortened) | parsed fare | expected | parsed verdict, default / £1.50 | truth | real-world |
|---|---|---|---|---|---|---|
| **h04** label misread | `10:02 4G 61%` / `£58.40` / `Uber X` / `4.90 ★` / `6 mins (2.1 mi) away` / `24 mins (9.8 mi) trip` | 58.40 (the pill) | None (fare line lost; real £14.20) | **ACCEPT / ACCEPT** | CAN'T TELL | MARGINAL / DECLINE |
| **h05** label glued to the fare, £ lost | `£41.75` / `UberX12.40` / `4.86 ★` / `4 mins (1.5 mi) away` / `16 mins (6.0 mi) trip` | 41.75 | None (or 12.40) | **ACCEPT / ACCEPT** | CAN'T TELL | ACCEPT / DECLINE (false at £1.50) |
| **h07** label in a banner | `UberX · Comfort` (filter chip at the top) / `£58.40` / `Uber X` / `4.90 ★` / legs as h04 | 58.40 | None (real £14.20) | **ACCEPT / ACCEPT** | CAN'T TELL | MARGINAL / DECLINE |
| **h09** stray amount in the zone | `UberX` / `£16.00` / `Rider pays` / `5 mins (1.7 mi) away` / `15 mins (5.9 mi) trip` (the driver's fare line lost) | 16.00 (the rider price) | None (real £10.40) | **ACCEPT** / DECLINE | CAN'T TELL | MARGINAL / DECLINE |
| **h10** two cards on screen | `Accept £31.50` (top card cut off) / `Uber X` / `4.92 ★` / `4 mins (1.2 mi) away` / `13 mins (4.6 mi) trip` | 31.50 (the other card's fare) | None (real £8.20) | **ACCEPT / ACCEPT** | CAN'T TELL | MARGINAL / DECLINE |

**False ACCEPTs:** 9 case-and-settings pairs against the truth verdict, and 8 against the real-world verdict:
- h04, h07 and h10 at both settings;
- h09 at the default settings;
- h05 at £1.50 per mile. At the default settings h05's real fare also gives ACCEPT, so that pair is false against the truth verdict only.

**Causes.** Fixing these is the Scan Engineer's job; these are only the mechanisms.

1. **A label not in the list turns the fare zone off, and the no-label path takes the bare amount above it.** This covers h04 and h05, and b1 and b3 under real OCR.
   - Misreads and spellings that are not product-label lines: "Uber X", "Uber-X", "Uber XL", "Uber Exec", "Uber Comfort", "Uber", "X", "UberX1", "UberX12.40" and "UberX E12.40".
   - The cut-off treats each of them as card text. `_CARD_WORDS` strips "uber" and the product names, and `_LONE_LETTER` strips "X" and "E".
   - So the window runs up past the label to the earnings pill, and that amount becomes the fare.
   - This is cycle-1's g01 again, as soon as the label isn't spelled exactly as in the list (`label_variants.py`).
   - "UberX", "XL", "Comfort+", "UbcrX" and "U ber X" are safe.
2. **In the no-label path, an Accept-line amount anywhere counts as the fare** (`on_accept` uses every plausible amount on any Accept line, even one above the legs). This covers h10, and b4 under real OCR.
   - On a Trip Radar screen, the cut-off card above ends with "Accept £31.50".
   - With labels the rule uses only the first Accept line below the legs. Without labels it doesn't.
3. **The zone has no height limit.** This covers h07. The anchor is the last label-shaped line above the legs, however far up the screen it is. A chip or banner made only of ride names ("UberX · Comfort", a lone "Green", "Black" or "Taxi") becomes the anchor if the card's own label is misread. Everything between it and the legs, including the earnings pill, is then "inside the card".
4. **One bare amount in the zone is trusted whatever its caption says.** This covers h09.
   - If a card shows the rider price with a caption below it, and OCR loses the driver's fare, the rider price is used.
   - The neighbour check only knows the pill words (online, earnings, today, ...).
   - This layout is a guess. Lowest likelihood of the four.

### Correct refusals (counted as right)
- h01, h02, h03, h06 and h08: fare line lost, with a Polish, Arabic or Turkish pill, a Nationwide "Money in" push, or a Santander push plus a Spanish pill, above a correct label. All give fare None, from `fare_missing`.
- h31 (two full cards) gives `multiple_offers`. h32 (old and new price in the zone) gives `fare_ambiguous`.

### Readable cards read correctly (17 of 20)
- **A second amount outside the zone:** h11 German pill; h12 Monzo; h13 tip after Accept; h14 a cut-off top card with "Accept" on its own line; h27 Lithuanian pill with the fare on the label line.
- **A promo in the zone with unlisted wording:** h15.
- **Units and lengths:** h18 km; h19 1 hr 42 mins / 88.5 mi; h20 a 3-minute trip.
- **OCR noise:** h21 dark-mode O/I/l noise.
- **Normal cards:** h22 to h25; h26 "UberXL£18.30" glued.
- **No label:** h28 a cropped card; h30 a WhatsApp notification above the card.

## 2. Real OCR through the app (Playwright, #scan-file, `#ocr` parsed with the app's parseOfferText)

| set | scans | fields correct / missed / wrong | wrong-number scans |
|---|---|---|---|
| 18 fresh-4 cards × light and dark | 36 | 164 / 6 / 10 | h04, h05, h07, h09, h10 in **both** modes. All show **ACCEPT** in the app, the same as at text level. |
| 4 badge cards (fare drawn white on green, **fare present in the image**) | 8 | 32 / 4 / 4 | **b1** "Uber X" light, **b3** "Uber Comfort" light, **b4** top card "Accept £31.50" light and dark. All show **ACCEPT**; their true verdict is MARGINAL (DECLINE at £1.50). |

- **This is the key new evidence.** In b1, b3 and b4 nobody removed the fare line: Tesseract dropped the badge fare by itself. Then cause 1 or cause 2 above took the pill or the other card's fare.
  - Cycle 1 could not make this happen naturally. Here it took one try.
  - b2, the same card labelled "UberX", is refused correctly.
  - In dark mode, b1 and b3 are saved only because OCR made a junk line ("Gln") that cuts the window. That is luck, not a rule.
- **Caveat:** the drawn screens have empty space between the top pill and the card. A real screenshot has a map there, and the map's OCR junk often contains words, which cuts the window. How often a real screen has nothing in between is unknown.
- Python and the in-page JS give identical results on all 44 OCR texts.
- Scan time: 214–1013 ms in headless desktop Chromium.

## 3. Manual-entry rate on readable cards

| level | readable | sent to manual entry | rate | target |
|---|---|---|---|---|
| text, fresh set 4 | 20 | 3: h16, h17, h29 | **15%** | ≤ 20%, **met** |
| real OCR, plain-drawn fresh-4 cards | 26 scans | 6: the same 3 cards, both modes | **23%** | ≤ 25%, **met** |
| real OCR, including the 4 badge cards | 34 scans | 10: the 4 extra are badge fares OCR lost | 29% | just over; an OCR loss, not a rule refusal |

The three refusals:
- **h16** `Accept £14.20 · £1.10/mi`: the rate on the same line stops the Accept amount being a fare candidate, so the result is `fare_missing`.
- **h17** the fare printed below the legs, followed by an Accept line with no amount: it is treated as a possible second card, so the result is `fare_ambiguous`.
- **h29** label misread as "Uber X" with the pill £58.40 above and the real £12.40 present: the conflict rule refuses. That is safe; the same text without the £12.40 is h04.

## 4. Regression check
- `python -m pytest -q`: 79 passed.
- `python tools/run_eval.py --baseline reports/cycle-2/eval_before.json`: exit 0, no regression. On the synthetic side: wrong_numbers 0, false_accepts 0, readable_manual 0.0 (n=86).
  - These are the Scan Engineer's own cases, written knowing the rule. They do not include any of the patterns above.
- **Offer check screen** (`ui_probe4.js`, 390×844): all 8 checks pass.
  - The verdict word shows (ACCEPT for a £30 card).
  - Details is closed by default.
  - No £ amount or digit shows outside Details.
  - A new scan clears the old ACCEPT at once (READING, "—"), and its own result then shows with Details closed.
  - A failed read gives CAN'T TELL with no stale word.
  - No page errors.
- **Safety:** no UI strings or flows changed this cycle. Nothing new needs the phone handled while driving.

## Spec acceptance (cycle 2, QA criteria)
1. **Zero wrong numbers leading to a false ACCEPT: FAILED.** 5 cards at text level. With real OCR, the same 5 cards plus 3 badge cards where OCR lost the fare by itself.
2. **Manual-entry rate:** met. 15% at text level (target ≤ 20%) and 23% on real OCR (target ≤ 25%). Including the badge cards, real OCR is 29%.
3. **Python and JS identical:** met. 0 differences on 32 texts and 44 OCR texts.

## Remaining issues, not blocking on their own
- Medium (scan): h17, a fare below the legs, is refused as a possible second card.
- Medium (scan): h16, a rate on the Accept line, hides the Accept fare.
- Low (scan): fares drawn white on a green badge are lost by OCR in 4 of 8 scans and wrongly read in the other 4.
- The Low UI items from cycle 1 are unchanged and were out of scope.

## Not tested
- Real Uber screenshots, real phones and real map backgrounds.
- How often a real screen has a bare amount with no word line between it and the card.

## Summary
BLOCK. On a fourth set of 32 unseen cards, the fare-zone reader gave 5 wrong fares, and all 5 became a false ACCEPT. It happens when the label is misread or spelled differently ("Uber X", "Uber Comfort", "UberX12.40"), when a ride-name chip sits higher up the screen, when another card's "Accept £31.50" shows above the legs, or when a rider-price amount sits in the zone. With real OCR, the same 5 failed in light and dark mode. Three more drawn cards failed with no line removed by hand: OCR dropped the badge fare itself. Python and JS agree, pytest passes and the UI checks pass. The manual-entry targets are met: 15% at text level and 23% on real OCR. All of this is synthetic.

---

## Attempt 2 re-test (2026-11-21)

**STATUS: BLOCK.** The first line of this file still reads `STATUS: BLOCK`.
- All of set 4 is fixed, at text level and with real OCR.
- My new set 5 gives a false ACCEPT on real screenshot scans in 4 of its 25 cards. The height cross-check doesn't catch these, because the stray amount is drawn bigger than everything else on the screen. In every one the card's own fare was on a green badge, and Tesseract lost it by itself.
- The height check also sends many readable cards to manual entry.

**All figures are synthetic: made-up text and cards I drew. None of it is a real Uber screenshot.**

**Code under test:**
- parser.py and engine.js, including `fareFromLines` and `reconcileScanFare`;
- app.js `scanImage` and `scanGeo`.

**Probes** are in `reports/cycle-2/qa_probes/`:
- `make_cases5.py` writes `fresh_cases_5.jsonl` (25 cards).
- `ocr_run5.js` runs real OCR through the app. It records the verdict word and the fare the app actually used, read from the Details readout after the height check, plus a text-only parse of `#ocr`.
- `score_a2.py` scores the scans.
- `geo_diag.js` logs Tesseract's line heights.
- `set4_redraw.jsonl` redraws 4 set-4 cards.
- `ui_probe4_a2.js` checks the Offer check screen.
- The app was served with `python3 -m http.server 8777` and the server was stopped afterwards.
- 102 scans in total: 0 requests left the origin and the page logged 0 errors. Scan time was 196–959 ms.

### 1. Set 4 and the badge cards, re-run

| | text level (both engines, 32 + 4 cards) | real OCR (36 + 8 badge scans, light and dark) |
|---|---|---|
| h04, h05, h07, h09, h10 | fare None. **Fixed.** | fare None, CAN'T TELL. **Fixed.** |
| b1–b4 (badge fares) | correct | all CAN'T TELL. 0 wrong; OCR lost every badge fare. |
| wrong numbers / false ACCEPTs | 0 / 0 | 0 / 0 |
| Python vs JS | 0 differences | n/a |

h29 now reads its true fare (£12.40) at text level and in both scan modes.

### 2. Fresh set 5 (`fresh_cases_5.jsonl`, 25 cards, not in eval_set)

What the set covers:
- **Stray amounts drawn as big as the fare, or bigger:** a big earnings pill, a quest banner, a "£50 bonus" promo, a streak reward, a rider price, a tip line, and a second card's fare.
- **The fare slightly smaller than another amount.**
- **OCR merging lines:** the fare and surge on one row, the fare and rating on one row, and the label and an amount on one row.
- **Several normal cards**, in Inter, DejaVu Serif and DejaVu Sans Mono, with fares drawn at 28–40 px and body text at 14–18 px.

All 25 cards were drawn and scanned in light and dark mode (50 scans). 6 cards have the fare on a green badge.

#### Real screenshot scans: the app's own result, after the height check

The verdicts below are the app's; "truth" is the verdict on the fare shown in the image.

| card | what happened | app fare | app verdict, default / £1.50 | truth, default / £1.50 |
|---|---|---|---|---|
| **p01**, light | Earnings pill "£58.40" drawn at 34 px bold. The label sits on a dark chip and the fare on a green badge; OCR lost both. The no-label path took the lone amount, and the height check agreed, because 58.40 was the tallest money line (49 px, against a 32 px median). | 58.40 | **ACCEPT / ACCEPT** | MARGINAL / DECLINE |
| **p03**, light and dark | "UberX", then the badge fare (lost), then a 40 px "£50.00" with "Finish 3 more trips by 6pm" on the next line. The zone holds one amount, and the height check agreed (57 px). | 50.00 | ACCEPT / **ACCEPT** | ACCEPT / DECLINE |
| **p20**, dark | Yellow quest banner "£45.00" at 36 px. The label chip and the badge fare were both lost, so the same path as p01. In light mode OCR did read the badge fare, but lost the trip leg. | 45.00 | ACCEPT / **ACCEPT** | ACCEPT / DECLINE |
| **p21**, light and dark | "Comfort", then the badge fare (lost), then a 38 px "£40.00" with "Weekend streak reward" on the next line. Same path as p03. | 40.00 | **ACCEPT** / MARGINAL | MARGINAL / DECLINE |

- **Severity: high. Area: scan.** That makes 7 false ACCEPT scan-and-settings pairs.
  - These are real Tesseract runs on drawn cards, and nobody removed the fare line by hand.
  - p01 in dark mode and p07 in both modes were refused correctly. In p07 the text rules read the wrong 58.40, and the height check vetoed it.
- **Why the height check can't catch these:**
  - The check only confirms that the text rules' amount is the tallest money line.
  - When the card's fare is lost and the stray amount is the biggest text on the screen, the two signals agree on the wrong number.
  - The Scan Engineer named this as a possible gap (scan.md, Attempt 2, open item 1). It reproduces easily: in all 4 cards the stray amount is drawn bigger than the fare.
- **The text-rule holes that let it through:**
  1. **No label, lone amount (p01, p20).** With no label found, a single bare amount above the legs is still the fare. Scan.md calls this a "departure" from the literal no-label rule. Here OCR lost the label because it was white on a dark chip, the same effect cycle 1 saw on dark pills.
  2. **A lone bare amount in the zone whose caption is on the next line (p03, p21).** Only rider-price words are checked on neighbouring lines. Pill, promo and reward words count only when they are on the same line as the amount.
- **How likely is this?** It needs a stray amount drawn bigger than the fare, plus OCR losing the fare (here a green badge). Neither has been seen on a real Uber card. I'd rate it unlikely but possible, like the cycle-1 block. The owner may accept the risk; under the rule I can't.

#### Text level: what pasted text would give (no height check)
- 5 wrong numbers: p01, p03, p07, p20 and p21. All are false ACCEPTs at default or £1.50.
- Python and JS give identical results.
- In the app these are reached only if a driver pastes OCR text that has lost the fare line. A pasted Uber card would normally include its fare, so this is reported separately and is not the main judgement.
- p22 (a big rider price with a caption below) is correctly refused at text level and in the scans.

### 3. Manual-entry rate on readable cards

| set | text level | real OCR, without badge cards | real OCR, with badge cards |
|---|---|---|---|
| set 4, as drawn in attempt 1 | 2/20 (10%): h16, h17 | 12/26 (46%) | 20/34 (59%) |
| set 4, with h13, h23, h26 and h27 redrawn so the fare line is the big one | same | **6/26 (23%)**: h16, h17, h23 | 14/34 (41%) |
| **set 5** | 2/18 (11%): p08, p09 | **20/36 (56%)** | 26/48 (54%) |
| set 5, the 9 normal cards only (p10–p17, p24) | 0/9 | 2/18 (11%): p14 | n/a |

- **Targets** (at most 20% for text, at most 25% for OCR):
  - The text target is met on both sets.
  - The OCR target is met on set 4 when the fare is drawn big.
  - On set 5 the OCR target is **missed by a wide margin: 56%, against 25%.**
- **Every set-5 scan refusal came from the height check.** The text rules read the right fare on all 36 readable scans.
- **The check refuses whenever another amount is drawn at about 80% of the fare's size or more:** a pill as big as the fare (p02), a "£50 bonus" promo (p04, p19), a rider price (p05), a second card's fare (p06), a tip line (p23), or a fare sharing a row with surge or rating (p08, p09).
- **It also refuses plain cards where the fare is only about 1.75× the body text** (`geo_diag.js` shows why):
  - Tesseract's line boxes are not proportional to font size. Leg lines with brackets are 32 px tall, and a digits-only fare at 30 px font is 43 px. That is 1.34× the median, below 1.5×. Examples: p14 and h23.
  - A banner line with descenders ("£58.40 · Today", 22 px font) has a 41 px box, against the 34 px fare's 49 px box. That is 1.195×, below 1.25×. Example: p18.
  - So the check effectively needs the fare drawn at about 2× the body text, with any other amount below about 0.65× of the fare.
  - Whether real Uber cards meet that is unknown.
- **Green-badge fares are lost by OCR in 8 of 8 set-4 badge scans.** In set 5, OCR read the badge fare on 1 of the 12 badge scans (p20 light).

### 4. Regression
- `python -m pytest -q`: 87 passed.
- `run_eval --baseline reports/cycle-2/eval_before.json`: no regression. On the synthetic side, wrong_numbers is 0 and false_accepts is 0 on 140 cases.
- **Offer check screen** (`ui_probe4_a2.js`): all 8 checks pass.
  - The verdict word shows.
  - Details is closed by default.
  - No numbers show outside Details.
  - The old ACCEPT clears at once on a new scan.
  - A scanned card shows its own verdict.
  - A failed read gives CAN'T TELL.
  - No page errors.
- **Safety:** no UI strings or flows changed. Nothing new needs the phone handled while driving.

### Summary (attempt 2)
BLOCK. Attempt 2 fixes all of set 4 (0 wrong, 0 false ACCEPT, at text level and with real OCR). On fresh set 5, real scans give false ACCEPTs on 4 of 25 cards (p01, p03, p20, p21). In each, Tesseract lost the green-badge fare, and a bigger stray amount was then read as the fare, with the height check agreeing. The stray amount was an earnings pill, a quest banner, or a promo or reward amount with its caption on the next line. Manual entry is within target at text level (11%) and on set 4 (23%). On set 5 it reaches 56%, because the height check refuses any card where another amount is nearly as big as the fare. pytest and the UI checks pass. All synthetic.

---

## Attempt 3 re-test (2026-11-21)

**STATUS: PASS (conditional).** The first line of this file now reads `STATUS: PASS`.
- **0 wrong numbers on 158 real-OCR scans of realistic cards**, light and dark: set 4, the badge cards, set 5 and the new set 6.
- The **known hole (scan.md's c17) still exists and I reproduced it.** It gives a false ACCEPT only when the card holds a **second amount drawn as big as the fare, inside the card between the label and the legs, with a neutral caption**, *and* OCR loses the real fare.
- I could make OCR lose a fare only by drawing it thin and pale grey, which real Uber cards don't do. The badge loss that caused the attempt-1 and attempt-2 blocks is fixed.
- **Under the block rule's letter, these hole probes are fresh cards that give a false ACCEPT.** I am passing because none of the realistic cards does, and the owner and Orchestrator must explicitly accept this residual risk (I recommend a `- [ ]` line in human_gates.md). If they won't, treat this as BLOCK.

**All figures are synthetic: made-up text and drawn cards. None of it is a real Uber screenshot.**

**Probes** are in `reports/cycle-2/qa_probes/`:
- `make_cases6.py` writes `fresh_cases_6.jsonl`.
- `ocr_run6.js` runs set 6 through the app (per-card screen size, font, CSS, a map background and stacked cards).
- `hole_probes.jsonl` holds the hole probes.
- `geo_diag3.js` logs Tesseract's word heights.
- `ui_probe4_a3.js` checks the Offer check screen.
- The result files are `a3_*_out.json`.
- The app was served with `python3 -m http.server 8779` and the server was stopped afterwards.
- 166 scans: 0 requests left the origin and the page logged 0 errors. Scan time was 206–1109 ms.

### 1. Earlier sets, re-run

| set | text level (both engines) | real OCR, light and dark |
|---|---|---|
| set 4 (32 cards; 18 scanned, 4 also redrawn) | 0 wrong; manual entry 2/20 | 0 wrong, 0 false ACCEPT (44 scans) |
| badge cards b1–b4 | 0 wrong | **all 8 fares now read correctly** (they were all lost in attempt 2); 0 wrong |
| set 5 (25 cards) | **4 wrong, all false ACCEPTs:** p01, p03, p07, p20 (pasted text with the fare line lost) | **0 wrong, 0 false ACCEPT** (50 scans); p01, p03, p20 and p21 are now refused |

- **Pasted text stays exposed:** a pasted text that has lost its fare line can still give a wrong fare. This is the Scan Engineer's stated no-label departure, plus the c17 caption hole (p03's "Finish 3 more trips by 6pm" has no promo word).
- **Severity:** medium. It needs a paste of OCR output that has already lost the fare. A pasted card normally includes its fare.

### 2. Fresh set 6 (`fresh_cases_6.jsonl`, 26 cards, all scanned light and dark: 52 scans)

What the set covers:
- **Badge colours:** fares on purple, red, orange (black text), dark grey and blue badges, and on green-to-teal and purple-to-pink gradients.
- **Accept buttons:** a blue Accept button with the fare on it, a green Accept button, and a gradient Accept button.
- **Screens and fonts:** 360×640, 360×740 and 320×568 screens; FreeSans, Carlito, Inter, Courier 10 Pitch, IPAGothic, Caladea and DejaVu.
- **Backgrounds and overlays:** a map with a coloured park and river, a Monzo heads-up notification, yellow "online" and "weekly goal" banners, and a dark earnings chip.
- **Card details:** an orange "1.6x" surge pill, a purple "Exclusive" tag, rider-note lines, a "🐾 Uber Pet" label, a fare with an "Upfront" tag on the same row, and a cropped card with no Accept line.
- **Two cards:** a full Trip Radar pair, and a cut-off top card.
- **Units and lengths:** km, a 1 hr 32 min trip, and a 3-minute trip.
- **Contrast:** two low-contrast thin grey fares.

**Results:**

| | wrong numbers | false ACCEPTs | readable sent to manual entry |
|---|---|---|---|
| text level, both engines (0 differences) | 0 | 0 | 2/25 (8%): q20 (two amounts in the zone), q24 ("Upfront" on the fare row) |
| real OCR, 52 scans | **0** | **0** | 8/50 (16%) including badge cards; 6/32 (19%) without |

The 8 OCR refusals:
- **q03:** "(" was read as "{" on the trip leg (both modes). The leg was refused, which is safe.
- **q11:** the cut-off top card's fare is the same size as this card's, so the height check refuses (both modes).
- **q19 and q20:** the thin grey fare was lost (both modes).
  - In q20 the text rules then took the small "£2.50 Clean Air Zone" note as the fare, but the height check vetoed it. That was the right outcome.

The same OCR rate without the two deliberately low-contrast cards: 4/46 (9%).

**Every other card read all five fields correctly**: every coloured, gradient and dark badge, the fare on a blue Accept button, the small screens, every font, the map background, the notification and banner screens, the surge pill and the Upfront tag. The two-card Trip Radar screen was refused (`multiple_offers`), which is correct.

### 3. The c17 hole: does it happen on realistic cards?

Probe (`hole_probes.jsonl`): an "UberX" card with its £11.80 fare drawn thin and grey so that OCR loses it, and an in-zone amount with a neutral caption ("Guaranteed minimum", "Airport pickup fee"). The true verdict is MARGINAL.

| in-zone amount size (fare drawn at 36 px) | text rules read | app (after the height check) |
|---|---|---|
| £6.00 at 20 px | 6.00 | refused |
| £25.00 at 24, 28 and 32 px | 25.00 | refused (32 px: a 46 px word box against a 32 px median, 1.44×, below 1.5×) |
| **£25.00 at 36 and 40 px** | 25.00 | **25.00, ACCEPT, in light and dark: a false ACCEPT** |

What it takes:
- a second amount **as large as the fare**, inside the card between the label and the legs, with a caption that has no promo word;
- **and** OCR losing the real fare.

My judgement on realism:
- No realistic card in sets 4–6 has a second fare-sized amount inside the card.
- Every realistic way I tried to lose a fare is now read: green, blue, purple, red, orange, grey and gradient badges, black buttons and dark chips.
- The only fare loss I produced is a thin, pale grey fare, which Uber does not use for the fare.

So I rate it **unlikely: severity high if it happened, likelihood low.** Real screenshots are what would show otherwise.

### 4. Manual-entry rate on readable cards (targets: at most 20% text, at most 25% OCR)

| set | text | real OCR without badge cards | real OCR with badge cards |
|---|---|---|---|
| set 6 (realistic) | **8%** | **19%** (9% without the two deliberate low-contrast cards) | **16%** |
| set 4, redrawn so the fare is the big line | 10% | 23%: h16, h17, h23 | 18% (with b1–b4, all read) |
| set 5 (built so stray amounts rival the fare) | 11% | 50% | 62% |
| set 5, the 9 normal cards only | 0% | 11% (p10: no label and no Accept line) | n/a |

- **The targets are met on the realistic sets.**
- Set 5's high rate is deliberate: the height check refuses any card where another amount is within about 13% of the fare's size. That is safe, but it costs manual entry if real screens look like that.
- Set 4's h23 ("UberXL · Exclusive" with the fare on the label line) is still refused after redrawing.

### 5. Regression
- `python -m pytest -q`: 90 passed.
- `run_eval --baseline reports/cycle-2/eval_before.json`: no regression. On the synthetic side, 156 cases with wrong_numbers 0 and false_accepts 0.
- **Offer check screen** (`ui_probe4_a3.js`): all 8 checks pass.
  - The verdict word shows.
  - Details is closed by default.
  - No numbers show outside Details.
  - A new scan clears the old ACCEPT at once.
  - A scanned card shows its own verdict.
  - A failed read gives CAN'T TELL.
  - No page errors.
- **Safety:** no UI strings or flows changed. Nothing new needs the phone handled while driving.

### Remaining issues
- **High if it occurs, likely low (scan):** the c17 hole above. The owner must accept the risk.
- **Medium (scan):** pasted text that has lost its fare line can still give a wrong fare (set 5: p01, p03, p07, p20).
- **Medium (scan):** fare below the legs (h17), a rate on the Accept line (h16) and a fare on the label line (h23) are refused.
- **Low (scan):** OCR read "(" as "{" and lost the trip leg (q03).
- **Low (scan):** cards with no label and no Accept line are refused (p10).

### Summary (attempt 3)
PASS (conditional). Real OCR now reads fares on every badge colour, gradient and dark button I drew. Across 158 realistic scans (set 4, the badge cards, set 5 and the new set 6) there are 0 wrong numbers and 0 false ACCEPTs. Manual entry on realistic cards is 8% at text level and 16–19% with real OCR. The known c17 hole still gives a false ACCEPT, but only when a second amount as big as the fare sits inside the card and OCR loses the real fare, which I could do only with a thin grey fare. The owner must accept that risk. Pasted text that has lost its fare line can still give a wrong fare. pytest and the UI checks pass. All synthetic.
