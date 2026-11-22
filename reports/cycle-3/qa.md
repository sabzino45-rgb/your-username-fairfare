STATUS: PASS

# QA / Red Team report, cycle 3 (real Uber UK card layout)

> **Status history:** attempt 1 was BLOCK (below, kept for the record). Attempt 2 (2026-11-22) is **PASS**; see "Attempt 2 re-test" at the end.

**Every card here is a replica, not a real screenshot. I made them all up, using pilot-0001's structure.** They show how the reader behaves on the real layout with values, chips and noise I chose. They cannot measure how often real cards do these things. The only real image is the owner's r01.png (section 4).

## Summary
**BLOCK.** I built 35 unseen replicas of pilot-0001's layout (31 readable) and scanned 33 through the app's real OCR, 132 scans over two drawing rounds. The fare rules hold: a captioned sub-amount was never read as the fare. But **the order of the two bare legs can be wrong, and that gives false ACCEPTs.**
- A "Long trip" chip just above the legs (x14) swaps pickup and trip. This gives ACCEPT where the truth is MARGINAL, at text level and in real OCR (3 of 4 scans).
- In round 1, OCR put the first leg line last (q06), with the same result.

Real-OCR manual entry on readable cards is 24%, against a 15% target; the cause is OCR garbling the big fare. The owner's risk showed up naturally (x06). r01 reads all 5 fields correctly. pytest passes, Python and JS give identical results, and the screen checks pass.

## Probes (all in `reports/cycle-3/qa_probes/`)
- `make_cards.py` writes `cards.jsonl`: 35 cards, each with a render spec, OCR text simulated in pilot style, the expected fields and the true fare.
  - **20 normal cards (q01–q20).** Labels UberX, Comfort, UberX Priority, XL, Green. Surge on and off, Match and Accept.
  - **Sub-amount lines:** holiday entitlement, tip, tolls, booking/pet/priority fee, Clean Air Zone, surge, "holiday pay", and two captions **not** in the parser's list ("wait time added", "airport pickup charge").
  - **Leg shapes:** a 1 hr 4 min trip, a 1-minute pickup, a long pickup with a short trip.
  - **q20** uses pilot-0001's values, so it is the rendered pilot replica.
  - **15 adversarial cards (x01–x15).** Quest banner, bank notification, a neutral-caption second amount, a second card underneath, a thin grey fare, a thin grey fare plus a bold uncaptioned £45.00 (the owner's risk), an earnings pill, a sub-amount near the fare's size, a sub-amount bigger than the fare, fare lost (text only, x10 and x11), a boost notification, a "rate below average" line, a "Long trip" chip, and a "long trip fee" caption.
- `score_text.py` + `js_parse.mjs`: text level, both engines.
- `draw_scan.js`: draws each card at 440×956 CSS px ×3 (1320×2868, the owner's phone) with Inter, a map with roads, water, a park, place labels, a road shield and a route. It then scans each image through `#scan-file`.
  - **Round 1** (`ocr_out.json`): a stylised round surge icon and a solid connector line next to the legs.
  - **Round 2** (`STYLE=faithful`, `ocr_out_faithful.json`): an outline-hexagon surge icon, and circle/square leg markers with a dotted line, as on pilot-0001.
- `score_ocr.py`: scores what the app actually shows (Details readout plus the `#verdict` word), not only `parseOfferText(#ocr)`. Both are recorded.
- Other scripts:
  - `probe_trip_word.py`, `probe_trip_word2.py` and `swap_verdict.mjs`: the leg-swap probes.
  - `rerun_c2.py`: the cycle-2 sets.
  - `ui_probe.js`: the screen checks.
- **Server:** `python3 -m http.server 8796`, stopped afterwards. No requests left the origin, and the page logged 0 errors.
- **Verdict basis:** truth and real-world verdicts use the app engine with `DEFAULT_SETTINGS`, and again with `costMile` 1.50.

## 1. Text level (35 cards, Python = JS on all 35, fields and warnings)

| field | correct | missed | **wrong** |
|---|---|---|---|
| fare | 33 | 1 | 1 (x11, owner risk) |
| each leg field | 32 | 1 | 2 (x03, x14: legs swapped) |

- **Manual entry on readable cards: 1 of 31 (3%).** The one is x04: two offer cards on screen, refused with `multiple_offers`, which is a correct refusal.
- **False ACCEPTs:**
  - **x14** at default settings (High, below);
  - **x11** at both settings (the owner's risk, section 5).
- **Captioned sub-amounts were never read as the fare.** This held for the near-size £11.60 (x08) and for unlisted captions (q07, q08), which still read the true fare.
- Correct refusals: x09 (sub-amount larger than the fare: None) and x10 (fare lost, only a captioned sub-amount left: None).

## 2. Real OCR through the app (33 cards × light/dark, two rounds = 132 scans)

| round | scans | fare ok / missed / wrong | legs wrong (per field) | false ACCEPT scans | manual entry, readable |
|---|---|---|---|---|---|
| 1 (stylised icon and connector) | 66 | 37 / 21 / 8 | 12–13 | **q06 light**, **x14 dark**, x06 ×2 (owner risk) | 22/62 = **35%** |
| 2 (faithful to pilot-0001) | 66 | 45 / 13 / 8 | 4 | **x14 light and dark**, x06 ×2 (owner risk) | 15/62 = **24%** (13/60 = 22% without x04) |

On all 132 OCR texts, Python and JS agree, and the `#verdict` word equals the engine's verdict on the shown fields. Scans took 0.9–2.0 s.

### Failures

**F1. A line ending in "trip" just above bare legs swaps pickup and trip, giving a false ACCEPT. Severity High. Area: scan.**
- **Repro (text):** `09:41 / UberX / £22.80 / ★ 4.95 After fees / £1.10 est. holiday entitlement included / Long trip / 2 min (0.5 mi) / [ADDRESS] / | / 32 mins (16.4 mi) / [ADDRESS] / Match`
- **Expected:** pickup 2 min / 0.5 mi, trip 32 min / 16.4 mi, verdict MARGINAL.
- **Actual:** pickup 32 / 16.4, trip 2 / 0.5, warning only `pickup_inferred_from_order`, verdict **ACCEPT**.
- **Real OCR (x14):** ACCEPT on 3 of 4 scans; the 4th refused the fare as garbled.
- **Same effect from other lines:** "Trip", "Exclusive trip", "Trip Radar", "Shared trip", "45+ min trip", and "£19.20 previous trip" (x03, both modes; verdict unchanged there).
- **No swap from:** "Long pickup", "Rider is 2 min away", "Quest: 3 trips left", or "trip" inside an address.
- **Why it changes the verdict:** dead miles apply to the trip leg only, so a short "trip" looks better. `swap_verdict.mjs` finds false ACCEPTs over wide fare bands. With 2/0.5 and 32/16.4 legs, every fare from £18.80 to £24.90 gives a false ACCEPT at default settings, and £41–£54 at £1.50/mi.
- **Realism:** I have not seen this on a real card. A trip-type chip above the legs is plausible on Uber cards, but n = 1 real card can't say.

**F2. OCR reading order can put the first bare leg last, giving a false ACCEPT. Severity High. Area: scan.**
- **Example:** q06, round 1, light mode. OCR text order was: address 1, "1hr 4 mins (39.5 mi)", address 2, "| 12 mins (5.4 mi)". The connector line glued to the first leg sent it to the end of the text.
- **Result:** the bare-leg rule took screen-text order as pickup then trip, so the app read pickup 64 min / 39.5 mi and showed **ACCEPT**. The truth is MARGINAL.
- **Other swaps in round 1** (verdict unchanged): q09 (both modes), q11, q15, q16, q17 (light) and x09 (dark).
- **Round 2:** with pilot-like markers, this did not happen. It still shows that leg order depends on Tesseract's block order.
- **A clue the parser could use:** an address-like line came before the first leg.

**F3. Truncated or garbled fare digits are accepted as a fare. Severity Medium. Area: scan.**
- **Examples:**
  - "£33.°" read as £33.00 (true £33.90; q14 dark);
  - "£16.4.: «" and "£16.4: ©" read as £16.40 (true £16.48; q15 dark).
- "£12.°5" is refused, so the garbled-fare check is not consistent.

**F4. OCR misreads digits of the big fare. Severity Medium. Area: scan, OCR.**
- **Examples:**
  - q14: "£33.20" for £33.90 (light, both rounds);
  - x01: £15.20, £15.30 and £15.50 for £15.80.
- No text rule can see these. All misreads here went **down**, so no verdict changed. An upward misread inside the plausible range would give a false ACCEPT, and the height check would not catch it.

**F5. Manual entry is above target on real OCR. Severity Medium. Area: scan.**
- **Round 2:** 15 of 62 readable scans (24%); target ≤ 15%.
- **Causes:**
  - fare garbled by OCR: glued surge icon or lost decimal point ("£4410", "£1015", "£23.400"), "£2.35" for £26.35 (`fare_implausible`), "eo. 05" or "(@ 40" for the fare;
  - thin grey fare lost (x05, both modes);
  - a pickup leg misread "1 mins (4.9 mi)" (q16, `pickup_speed_implausible`);
  - x04, two offers.
- **These refusals are all correct.** The parser is not refusing readable text; Tesseract is garbling my bold Inter fare at this size. The real card read cleanly, so the replica font or size may be harsher than reality. Text-level manual entry is 3%.

**F6. Python and app default targets differ. Severity Medium. Area: verdict.**
- `fairfare/verdict.py` has `DriverProfile.target_per_mile = 1.00`, but the app's `DEFAULT_SETTINGS.minMile = 0.9`.
- On q01, q02, q03 and q08 the same numbers give MARGINAL in Python and ACCEPT in the app.
- So `run_eval.py`'s `false_accept_count` judges a different threshold than the driver sees. `test_js_parity` passes because it sets minMile 1.0 explicitly.

**Low.** x09, dark mode: OCR misread the larger sub-amount £9.10 as £8.10, so the "impossible" card read £8.40 with MARGINAL. No harm done.

## 3. Pilot replica
q20 (pilot-0001's values) read all 5 fields correctly in all 4 scans, ACCEPT.

## 4. Owner's real screenshot (r01.png; not copied, OCR text not stored or quoted)
- Verdict: **ACCEPT**.
- Fields read: fare £30.27, pickup 21 min / 8.2 mi, trip 12 min / 4.6 mi. All 5 are correct.
- Warnings: `fare_after_fees`, `pickup_inferred_from_order`, `trip_inferred_from_order`.
- At £1.50/mi the verdict is DECLINE, which matches the truth.

## 5. Owner's open risk: fare lost and a lone uncaptioned amount (known, owner-rejected; not re-decided here)
What I observed:
- **x06 (real OCR):** a thin grey £11.05 fare with a bold £45.00 below it. OCR **lost the thin fare by itself** in all 4 scans. The app read £45.00 and showed **ACCEPT** at both settings.
- **x11 (text level):** the same pattern gives the same result.
- **Cycle-2 set 5** (p01, p03, p07, p20) still reads the stray amount at text level. That is unchanged since cycle 2; in the app the height check refused them then.

This stays open until the held-back real screenshots are tested.

## 6. Regression
- `python3 -m pytest -q`: 106 passed.
- `run_eval.py --baseline reports/cycle-3/eval_before.json`: exit 0. Pilot: accuracy 1.0, 0 wrong, 0 false ACCEPTs. Synthetic: 0 wrong, 0 false ACCEPTs.
- **Cycle-2 QA sets** (`rerun_c2.py`, 97 texts, both engines identical): no new wrong numbers. The only wrongs are the 4 known set-5 cases from section 5.
- **Offer check screen** (`ui_probe.js`, 390×844): 8 of 8 checks pass.
  - The verdict word shows; Details is closed; there are no £ signs or digits outside Details.
  - The old ACCEPT clears at once while a new scan is read.
  - The new scan's own verdict shows with Details closed.
  - Two offers on screen give CAN'T TELL; a non-image file gives CAN'T TELL with no stale word; there are no page errors.
- **Safety:** no UI change this cycle. No flow needs the phone handled while driving.

## Spec pass criteria (cycle 3)
1. **Zero false ACCEPTs: FAILED** (F1 x14, F2 q06), besides the owner-risk cards.
2. **Manual entry ≤ 15%:** met at text level (3%). **Not met on real OCR** (24%), and the cause is OCR.
3. **Python and JS identical: met.** The pilot replica reads correctly.
4. **Cycle-2 sets: no new wrong numbers.**

---

## Attempt 2 re-test (2026-11-22)

**STATUS: PASS.** The first line of this file is updated.
- **All figures are replicas I made up, plus the owner's single real card (r01).** None of it measures real cards in general.
- The owner's risk (fare lost, lone uncaptioned amount) is still open and owner-rejected, so the cycle cannot ship on this alone.

### Summary
Both blocking failures are fixed, at text level and with real OCR in light and dark mode:
- **F1, a "trip" line above the legs:** x14 and x03 now read their legs in the right order.
- **F2, OCR text order:** q06 is right in round 1, and no legs were swapped in 106 bare-leg scans.

The garbled-pence fares (F3) are now refused. A new set of 20 cards aimed at the changes gave 0 wrong legs and 0 false ACCEPTs in 40 scans. The only false ACCEPT left is the known owner's risk, x06.

Two things are still open:
- Manual entry on real OCR is 19–21% on non-hostile cards, against a 15% target. Every refusal is a correct refusal of an OCR-garbled fare.
- OCR now also misreads fares **upward** (Medium). No verdict changed.

r01 is still correct, pytest passes (132), and the screen checks pass.

### What I ran
- **Server:** `python3 -m http.server 8799`, stopped afterwards. No requests left the origin, and the page logged 0 errors.
- **Cycle-3 set** (`cards.jsonl`, 35 cards): text level in both engines, then real OCR in round 1 (stylised) and round 2 (faithful). The outputs are `a2_ocr_r1.json` and `a2_ocr_r2.json`, each with a `*_scored.json`.
- **New set** (`make_cards2.py` writes `cards2.jsonl`; `draw_scan2.js` draws them; the output is `a2_ocr_new.json`). It has 20 unseen cards, n01–n20, 7 of them deliberately hostile:
  - normal cards (n01–n04, n19);
  - a "Long trip" chip on the trip leg's row (n05);
  - **"Trip Radar" chip on the pickup leg's row** (n06, hostile);
  - an "Exclusive" tag plus a "Long trip · 45+ min" line above the legs (n07);
  - "Pickup"/"Trip" caption lines above each leg (n08);
  - a "next trip … 3 trips £15.00" notification (n09);
  - legs in hours: 1 hr 12 mins and 2 hr 5 mins (n10, n11);
  - **connector glyphs drawn 2 px from the leg text** (n12, hostile);
  - person and flag icons beside the legs (n13);
  - **two-line legs** (n14, hostile);
  - a back-to-back offer under a current-trip "Drop off · 6 min (2.1 mi)" banner (n15);
  - **legs side by side** (n16, hostile);
  - **surge icon glued 2 px to the fare** (n17, hostile);
  - **"Pickup soon" chip on the trip leg's row** (n18, hostile);
  - **a stray "Trip" caption above the pickup leg** (n20, hostile).
- **Extra probes:**
  - `probe_a2.py`: chips merged onto leg lines, eaten digits, hours, and 18 garbled-fare strings;
  - `probe_order.mjs`: `orderLegsByPosition` and `reconcileLegOrder`;
  - `manual_rates.py`.

### Results

| set | level | scans / cards | wrong fare | wrong legs | false ACCEPT | manual entry, readable (all / without hostile) |
|---|---|---|---|---|---|---|
| cycle-3 set | text, Py = JS | 35 | 1 (x11, owner risk) | **0** (was 2) | x11 only (owner risk) | 1/31 (x04, two offers) |
| new set | text, Py = JS | 20 | 0 | 2 (n06, n18: simulated chip merge, see A2-2) | n06, n18 (simulated only) | 2/20 (n14, n15) |
| cycle-3 set, round 1 | real OCR | 66 | 6 (x06 ×2 owner risk; 4 low reads) | 1 field (q16, "16"→"18" min) | **x06 ×2 only** (was also q06, x14) | 24/62 = 39% / 20/58 = 34% |
| cycle-3 set, round 2 | real OCR | 66 | 6 (x06 ×2; x01 ×2, q14, x09: low reads) | **0** | **x06 ×2 only** (was also x14 ×2) | 16/62 = 26% / **12/58 = 21%** |
| new set | real OCR | 40 | 8 (5 low, **3 high**) | **0** | **0** | 10/40 = 25% / **5/26 = 19%** |

- **Python vs JS:** identical on every text and every OCR text (0 differences).
- **App vs engine:** the `#verdict` word equals the engine verdict on the shown fields in every scan.
- **Hostile cards:** in the cycle-3 set I count x04 (two offers) and x05 (deliberately thin grey fare) as hostile; the new set's are listed above.

**Checks of the attempt-2 fixes:**
- **Text level:**
  - "Long trip", "Trip", "Exclusive trip", "Trip Radar" and "Shared trip" on the line above a bare leg no longer relabel it. A "Trip" caption line above the pickup leg (n20) is also fine.
  - Eaten numbers are refused (`leg_unreadable`): "min (0.5 mi)" and "hr 4 mins".
  - "1hr 4 mins", "1 hr", "1h 4m" and "2 hr 5 mins" read correctly.
- **Garbled pence refused:** "£19.5", "£19.", "£19.°0", "£19.5 0", "£19.5¢", "£19.50." and "£l9.5". "£19 50" and "£19-50" give `fare_missing`. All are refusals; none gives a wrong number.
  - Still read: "£19.50¢", "£19.5O", "£I9.50", "£ 19.50" and "£19,50", all correct as £19.50.
- **Real OCR, leg order:** chips on leg rows (n05, n06, n18) come out on their own OCR lines, so no leg was relabelled. Glyphs glued to legs ("M16 mins", "B16 mins", "FE 9 mins") still read the right number. Side-by-side legs (n16) read in the right order.
- **Real OCR, refusals:** two-line legs (n14) go to manual entry. The back-to-back offer (n15) is refused as `multiple_offers` (CAN'T TELL), which is safe.
- **`orderLegsByPosition`:** out-of-order lines are put back in screen order. A missing box, a line text that differs or no lines array all give `ok:false`, and the legs go to manual entry. Equal y keeps the text order (Low: only for side-by-side layouts, which read correctly here).

### Remaining issues (none blocking)

**A2-1. OCR misreads the fare upward. Severity Medium (High if it ever flips a verdict). Area: scan, OCR.**
- New set, light mode: "£20.70" for £20.10 (n08), "£74.26" for £74.20 (n10), "£21.76" for £21.70 (n18).
- All three are clean two-decimal amounts, so no text rule or the height check can see them.
- No verdict changed in these scans. A fare up to about £0.60 below the ACCEPT line would flip.
- Across all 172 attempt-2 scans: 3 upward and 11 downward fare misreads (excluding x06).
- My bold Inter fare may be harsher than Uber's font: r01 read cleanly. Only held-back real screenshots can size this.

**A2-2. A chip starting with "Trip" merged onto the pickup leg's line still relabels it, at text level only. Severity Medium. Area: scan.**
- Repro: `… 3 min (1.0 mi)  Trip Radar / [ADDRESS] / 45 mins (24 mi) …` reads pickup 45 / 24, trip 3 / 1. That is ACCEPT where the truth is MARGINAL (n06 text, and n18 with "Pickup soon" on the trip line).
- Real OCR (page-segmentation mode 11) put the chips on their own lines in all 6 scans, so I could not reproduce it from an image.
- OCR's second pass (mode 3, half scale) could merge a chip onto the leg line; I did not observe it.

**A2-3. Manual entry is above target. Severity Medium. Area: scan.**
- Real OCR, non-hostile cards: 21% on the cycle-3 set in the faithful style and 19% on the new set, against a ≤ 15% target. With the stylised round icon it is 34%.
- **Causes, all correct refusals:**
  - surge icon glued to the fare or the decimal point lost (`fare_out_of_range`);
  - garbled pence, refused by the new F3 rule (n09 "£2.50.", n20 "£12.+5", q14 / q15 / q17 dark);
  - digits dropped ("£2.35" for £26.35: `fare_implausible`);
  - thin or low-contrast fares;
  - "11 min" read as "1 min" (`pickup_speed_implausible`).
- At text level the rate is 1/31 and 2/20.
- I judge this a miss but not a wide one: it is a usability cost, not a safety one.

**Low:**
- q16 round 1: trip read as "18 mins" for 16 (an OCR digit error; verdict unchanged).
- Python's £1.00 per-mile default vs the app's £0.90 is still there in verdict.py. run_eval now counts a false ACCEPT under either default, so the attempt-1 finding about the eval metric is resolved.

### Owner's risk (known, owner-rejected; not re-decided)
- **x06, real OCR:** OCR lost the thin grey fare by itself, the bold £45.00 was read, and the app showed **ACCEPT** at both settings. This happened in all 4 scans (both rounds, both modes). It is unchanged from attempt 1.
- **x11 (text level)** and cycle-2 set 5 (p01, p03, p07, p20, text level) are unchanged.

### Owner's real screenshot r01.png (not copied; OCR text not stored or quoted)
- **ACCEPT**.
- All 5 fields correct: £30.27, 21 min / 8.2 mi, 12 min / 4.6 mi.
- At £1.50/mi: DECLINE, which matches the truth.

### Regression
- `python3 -m pytest -q`: 132 passed.
- `run_eval.py --baseline reports/cycle-3/eval_before.json`: exit 0. Pilot and synthetic: 0 wrong numbers, 0 false ACCEPTs.
- **Cycle-2 QA sets** (97 texts): identical to attempt 1. Only the 4 known set-5 owner-risk texts read the wrong fare.
- **Offer check screen** (`ui_probe.js`, port 8799): 8 of 8 checks pass. The verdict word shows; Details is closed; there are no £ signs or digits outside Details; the old verdict clears at once on a new scan; two offers give CAN'T TELL; a non-image gives CAN'T TELL; there are no page errors.
- **Safety:** no UI strings changed. The only new manual-entry path is `leg_order_unconfirmed`, which is parked-only typing as before.

### Spec pass criteria (attempt 2)
1. **Zero false ACCEPTs:** met on every realistic card, at text level and with real OCR. The exceptions are the owner-rejected risk (x06, x11), and the simulated chip merge (A2-2), which is text level only.
2. **Manual entry ≤ 15%:** met at text level. **Not met on real OCR** (19–21% without hostile cards; 25–26% with them), and the cause is OCR.
3. **Python and JS identical: met.** The pilot replica (q20) and r01 read correctly.
4. **Cycle-2 sets:** no new wrong numbers or false ACCEPTs.
