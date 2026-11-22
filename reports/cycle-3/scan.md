# Scan report, cycle 3 (real Uber UK card layout)

**Only one real card backs any of this: pilot-0001.** Every other figure comes from synthetic text or cards I drew myself. Nothing here shows that the reader handles real cards in general. The owner's unaccepted risk (OCR loses the fare while an equally big amount sits in the card) is **not** closed; see "What is still open".

## Numbers

| | before (cycle-2 rules) | after |
|---|---|---|
| **pilot** scan_accuracy_overall | 0.8 | **1.0** |
| pilot readable_manual_rate | 1.0 (n=1) | **0.0** |
| pilot wrong_number_count / false_accept_count | 0 / 0 | 0 / 0 |
| synthetic, all files: cases | 156 | 186 (+30 R2) |
| synthetic scan_accuracy_overall | 1.0 | 1.0 |
| synthetic wrong numbers / false ACCEPTs | 0 / 0 | 0 / 0 |
| synthetic readable_manual_rate | 0.0 (n=103) | 0.0 (n=125) |
| synthetic manual_fallback_rate | 0.3397 | 0.328 (the new adversarial cases are meant to be refused) |
| verdict median / p90 error, coverage | 0.0819 / 0.2214 / 0.9412 | unchanged |
| R2 file only (`synthetic_real_layout.jsonl`, 30 cases, 22 readable) | acc 0.92, **11/22 readable refused**, **1 wrong number** (syn-rl-026) | acc 1.0, 0/22 refused, 0 wrong, 0 false ACCEPT |

- Files: `reports/cycle-3/eval_before.json` (the Orchestrator's), `eval_real_layout_before.json` (R2 cases under the cycle-2 rules, run from a clean copy of HEAD), `eval_real_layout.json` and `eval.json` (after).
- `run_eval.py --baseline reports/cycle-3/eval_before.json` exits 0.
- All 156 old synthetic per-case rows are identical before and after.
- `pytest -q`: 106 passed. That includes JS parity on every eval file and on 17 new texts, field values and warnings both.
- QA's cycle-2 probe sets (fresh_cases_4/5/6, hole_probes, badge4, set4_redraw; 97 texts): parser output is identical before and after on every case. I ran a count-only comparison and did not read the cases.

## Which rule refused pilot-0001 (found by probing variants)

The fare line itself ("£30.27") was always clean. Three cycle-2 rules stacked up against it:
1. **"oe UberX" was not a label.** "oe" reads as an ordinary word, so the parser took the no-label path.
2. **The no-label cut-off.** That path stops at the nearest line above the legs that is not card text. Here that is "£… est. holiday entitlement included" (ordinary words). With that line removed, the cut moves to the "After fees" chip instead.
   - So the cut-off always fell below the fare, and the fare was dropped.
   - No warning was given, only `needs_manual_entry`.
3. **The label window.** Even with a clean "UberX" label, the junk line, the chip and the sub-amount line made 4 non-blank lines between the label and the legs. The limit is 3, so the result was `fare_label_too_far`.

From the image (viewed, not stored): the "% 5.00" before "After fees" is the **rider-rating chip** ("★ 5.00"), not a chip value. It is not read as a fare, a surge or a rating. Rating reading is unchanged (the star comes before the number there).

## The rules (parser.py and engine.js, identical)

1. **Sub-amounts** (R1.1).
   - A sub-amount line is a line with a £ amount and a caption from one shared list:
     - included, includes, incl, est, estimated, entitlement, holiday;
     - after fees, tip(s), fee(s), toll(s), surcharge(s);
     - Clean Air Zone, CAZ, boost, surge.
   - Such lines were already never fare candidates (their trailing words fail the fare-line shape), and they still aren't.
   - They no longer count towards the 3-line label window, and they count as card text for the no-label cut-off.
   - **Every sub-amount between the zone start and the first leg must be smaller than the fare, or the fare is None** (`sub_amount_not_smaller`).
   - An uncaptioned second amount still gives `fare_ambiguous`.
2. **"After fees"** (R1.2).
   - A chip line holding only "after fees" plus digits and punctuation is card text and is not counted in the window.
   - "after fees" anywhere in the zone adds the warning `fare_after_fees`.
   - No surge value is invented from it. The verdict model is unchanged.
3. **Button words** (R1.3). `_ACCEPT` is now "accept|match" and is used wherever the Accept line was used: the zone, the second-offer check, the fare-line words, card words and `cardMarkerFound`. I found no other button word I could justify.
4. **Label junk** (R1.4).
   - The anchor label may carry at most 2 junk tokens. A junk token is 1–2 characters, has no £, and is not itself a ride-type name ("ae UberX", "© UberX Priority", "4 XL").
   - Words of 3 or more letters still disqualify the line.
   - The relaxed label applies only to the anchor search and `cardMarkerFound`. The "second offer below the legs" check keeps the strict label, so an address such as "Green Rd" does not become a label.
   - A junk line (no digit, no £, at most 4 characters, no run of 3 letters) is not counted in the window. "Goal" still counts as a word; that is an existing test.
   - "UberX Priority" was already a label; a test now covers it.
5. **Bare legs** (R1.5). Two bare legs were already taken as pickup then trip in screen order, and address and connector lines between them never broke that. This is now covered by tests:
   - a third leg-like line refuses everything (`multiple_offers`);
   - one leg leaves the trip missing.

   The `*_inferred_from_order` warnings are kept, so the verdict's confidence is unchanged. Dropping them would be a verdict change, which is out of scope.
6. **Surge icon** (R1.6).
   - After a clean "£d.dd" amount, the fare is still read when it is followed by:
     - a non-alphanumeric icon (as before), or
     - one single digit, optionally followed by a symbol ("£24.60 4").
   - Such a fare line is card text for the cut-off.
   - The garbled-fare check accepts the same trailing digit, so "E21.40 4" is still recognised as a misread fare.
   - "£21 4", "£21.85 44" and "£13.950" (icon glued to the amount) are still refused.
7. **Plausibility** (R1.7).
   - The test grid covers 1–24-mile trips at £1.5–£10 per trip mile (fares floored at £4), with no pickup or a pickup of 0.3–10 mi, at 12–40 mph.
   - It **failed** under the old cap of £6/mile: £10/mile was refused on trips over about 8 miles.
   - **The cap is now £10/mile** (base £20 + £10/mi + £1/min). A lost decimal point (×100) is still refused ("£850" on 9 mi), and no eval row changed.
   - The test uses aggregate ranges only; no real-pay rows were copied.

No engine contains any pilot-0001 string or number. The R2 cases and the tests use other values and other junk tokens.

## R2 cases: `eval_set/synthetic_real_layout.jsonl` (30, origin synthetic)

- **22 readable cards** on the real structure:
  - status-bar and map junk above the card;
  - junk-carrying labels, including Priority, XL, Green, Exec, Pet, Black, Comfort Electric and Uber X Share;
  - junk lines, surge icons (⚡, %, 4) and "After fees" chips;
  - sub-amounts: holiday entitlement, tip, tolls, Clean Air Zone, booking fee, airport surcharge, boost, fees;
  - banner and badge lines, bare legs in mi and km, a 1-hour trip, | and • connectors;
  - Match and Accept buttons.
- **8 adversarial cards:**
  - fare lost with only a captioned sub-amount;
  - fare misread with an uncaptioned amount;
  - fare plus an uncaptioned amount;
  - sub-amount bigger than the fare;
  - fare lost with a stray amount smaller than the sub-amount;
  - a third leg;
  - "Match" with a different amount;
  - a second offer below.

## Real OCR through the app (Playwright, `#scan-file`, app served locally)

- **Owner's real screenshot (r01.png, not copied anywhere):**
  - verdict **ACCEPT**;
  - read: fare £30.27, pickup 21 min / 8.2 mi, trip 12 min / 4.6 mi; all 5 correct;
  - warnings: fare_after_fees, pickup/trip inferred from order;
  - the height check and the label/Match marker both agreed.
- **My replicas** (`reports/cycle-3/scan_ocr/`; real proportions: map on top, card at the bottom; fictional places only):
  - **6 cards × light and dark (12 scans): all 5 fields correct on 12 of 12.**
  - Adversarial x1 (an uncaptioned £45.00 drawn as big as the fare): refused in both modes (`fare_ambiguous`), no ACCEPT.
- **First drawing round, with a large circled surge icon (`replicas_round_icon.json`):**
  - OCR glued the icon to the fare as "0" ("£13.950") on 5 scans. These were refused, which is correct.
  - On r1-dark OCR misread the fare as **£24.64 (true £24.60)**. The verdict was ACCEPT in both cases, so this is Low severity.
  - That misread is an OCR digit error that no text rule can see. With an icon drawn like the real one (small outline), all 12 scans were correct.

## New assumptions about real layouts (all from one card)

1. Sub-amounts carry their caption on the **same line**. A caption on the next line still makes the amount a rival, which is a refusal.
2. The caption list is a guess. A sub-amount with a caption outside the list is never a fare (its trailing words), but it counts in the 3-line window.
3. Junk label tokens are at most 2 characters, and junk lines at most 4 characters.
4. Surge icons are drawn small and apart from the fare, as on pilot-0001.
5. Real "fare_after_fees" cards show the driver's take-home before running costs. The verdict does not use this yet.

## What is still open

- **The owner's risk.** If OCR drops the fare line and a single uncaptioned amount remains in the zone (above or below the chip), the text rules read it. The height check refuses it only if a taller amount is still present.
  - Captioned sub-amounts cannot cause this: they are never candidates, and the smaller-than-fare rule refuses a stray amount below a sub-amount.
  - Only held-back real screenshots can measure how often this happens (human_gates.md).
- No app.js change was needed: the height cross-check already ignored the small sub-amount words.
