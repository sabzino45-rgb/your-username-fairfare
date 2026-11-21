STATUS: BLOCK

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
