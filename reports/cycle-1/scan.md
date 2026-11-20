# Scan report, cycle 1 (R3: full-phone screenshots)

Owner: scan-engineer. **All numbers below come from synthetic data.** No pilot cases exist yet. They show that the parser handles the screen noise we invented. They say nothing about how it handles real Uber screenshots.

## Result

| | Before fix | After fix |
|---|---|---|
| scan_accuracy_overall, all 80 synthetic cases (judged) | 0.9325 | **1.00** (goal >= 0.99: **met**) |
| fare accuracy, all 80 | 0.8125 | 1.00 |
| pickup_min / pickup_miles / trip_min / trip_miles, all 80 | 0.9625 each | 1.00 each |
| scan accuracy, 20 new full-screen cases only | 0.73 | 1.00 |
| scan accuracy, original 60 cases | 1.00 | 1.00 (every per-case row is unchanged) |
| manual_fallback_rate, original 60 | 0.15 | 0.15 (limit 0.15) |
| manual_fallback_rate, 20 full-screen | 0.05 | 0.25 |
| manual_fallback_rate, all 80 | 0.125 | 0.175 |
| verdict median / p90 error | 0.0819 / 0.2214 | 0.0819 / 0.2214 |

- Before the change, the starting state was 1.00 on the 60 cropped cases. The run with the new cases added and no fix is saved in `reports/cycle-1/eval_fullscreen_before.json`. The run after the fix is saved in `reports/cycle-1/eval.json`.
- The full-screen fallback rate of 0.25 is correct behaviour. In 5 of the 20 cases a careful reader can't get every field either, so the parser refuses as it should:
  - 004 and 015 show several offers at once.
  - 013 is a cropped card with no trip leg.
  - 018 and 020 have an unreadable fare.
- Before the fix the rate was lower only because the parser guessed on these cases. 4 of those 5 cases were wrong before the fix. The fifth (013) already fell back because of its missing trip leg, but its fare was still wrong.
- `run_eval.py --baseline reports/eval_baseline.json` and `--baseline reports/cycle-1/eval_before.json` both print "No regression vs baseline" and exit 0.
  - Both baselines were computed on the 60 cropped cases only. The scan accuracy comparison is therefore 60 cases against 80, but both sides are 1.00.
  - Verdict errors are identical because the new cases have no `outcome`. They test scanning only, so they don't change the verdict metrics.
  - The all-80 fallback rate (0.175) is higher than the baseline (0.15). The baseline check doesn't look at fallback rate, and the extra 0.025 comes entirely from the refusals listed above. On the original 60 cases the rate is still 0.15.
- `python3 -m pytest -q` gives 37 passed.

## New cases: eval_set/synthetic_fullscreen.jsonl (syn-fs-001 to syn-fs-020)

These 20 cases are written by hand in `tools/make_fullscreen.py`, which is deterministic and has no rng. They carry `"origin": "synthetic"` and `"kind": "fullscreen"`, plus a short `note`. No real names or addresses are used. The noise covered:

- status-bar clock, battery and network
- a "Screenshot saved" toast
- a calendar notification that mentions minutes
- stray £ amounts in 13 cases:
  - promo banners ("£5.00 off", "£3.00 off ... today")
  - an unlabelled earnings pill
  - "Today £61.35", "This week £412.80", "Balance £230.40 · Cash out"
  - a tip notification, a quest bonus, and a boost-zone banner with no "+"
  - message previews above and below the card
- navigation lines, including ETA bars that look like legs ("12 min · 4.0 mi · ETA 18:18")
- Trip Radar lists with 1, 2 and 3 offers
- km/mi mixes
- dark-mode noise (stray `|`, `~`, `£ 14.60`, `4.9l ★`, `£1O.80`)
- a card fare garbled to "E12.40" or "fl2.40" while another £ amount is still readable

**Deviation from spec.md:** spec.md R3 asks for these cases to be appended to `synthetic.jsonl` (ids syn-0060 and up). I followed the Orchestrator's task instead: a separate file with syn-fs-NNN ids. This leaves `synthetic.jsonl` byte-identical. The parity test now runs on every `eval_set/*.jsonl` file, so the new cases are covered either way. The Orchestrator should reconcile spec.md.

## What changed (fairfare/parser.py and app/js/engine.js, kept identical)

1. **Fare = nearest £ amount above the first leg.** Before, the parser took the first £ amount on the screen. Now it takes the candidate closest above the first leg line, at most 4 lines above it.
   - If legs were found but no candidate is close enough, the fare is None (warning `fare_not_near_legs`).
   - With no legs, a £ amount is used only if every candidate has the same value. Otherwise the fare is None (warning `fare_ambiguous`).
2. **Non-fare lines are skipped as candidates.** A £ amount on a line containing one of these words is never taken as the fare: off, discount, promo, code, voucher, coupon, save(d), earned, today, week(ly), balance, cash out, tip(s), bonus, quest, reward, refer, cashback, credit, wallet, extra, surge, boost, include(s/d), incl. Surge detection itself (`+£x ... surge/boost/included`) is unchanged.
3. **Navigation lines are not legs.** A min/distance pair is ignored if its line contains arrive/arrival, ETA, remaining, destination, route or "to go".
4. **More than 2 legs on one screen means "can't tell which offer".** Fare, legs and surge are all None (warning `multiple_offers`).
5. **OCR digit confusables inside a £ amount.** After the first digit, O/o is read as 0 and I/l as 1, so `£1O.80` gives 10.80 (before, it gave £1.00, which passed the range check). An amount glued to letters ("£12.40Accept") or with a third decimal ("£12.405") is not trusted at all, so it gives None rather than a partial number.
6. **Parity fix in the shared `r2` rounding (engine.js).** JS `Math.round(x*100)/100` differed from Python `round(x, 2)`: 1.075 gave 1.08 in JS and 1.07 in Python. The new case syn-fs-012 exposed this in `perMile`. JS now rounds the way Python does (exact value, ties to even).
   - This helper is also used by the verdict code in engine.js, so the **verdict-modeler should know about it**.
   - It makes JS match Python. It doesn't change the Python results.
7. **Tests.**
   - `tests/test_parser_fullscreen.py` has 12 regression tests, one per bug above.
   - `tests/test_js_parity.py` now runs on every `eval_set/*.jsonl` file (parametrised per file), and a new test fails if it ever stops picking up the full-screen file.

## Still failing

No case fails on the eval set.

## Guesses about real layouts (check against pilot screenshots)

These rules are guesses. Pilot data could prove any of them wrong. In each of these situations the parser now returns None, so it doesn't guess a number, but each one would raise the fallback rate on real screenshots:

- **The fare sits above the legs and within 4 lines of them.** This holds for every layout we have. If a real card shows the fare *below* the legs, the parser now returns None for the fare (before, it took the first £ amount).
- **Keyword list.** A real card line such as "£12.40 includes expected surge" or "£12.40 incl. tip" now gives fare None. That is safe but costs a manual entry.
- **More than 2 legs means several offers.** A real single card that shows a third min/distance pair (for example a stop on a multi-stop trip) will be refused.
- **Navigation keywords** are English only. ETA bars in other app languages would still be read as legs.
- **The O/l to 0/1 mapping** only applies inside an amount that already starts with a digit after £.

The QA red team's unseen full-screen cases (spec R3) are the right next check. After that, real pilot screenshots, redacted with `tools/redact.py`.

---

# Attempt 2 (after the QA block, reports/cycle-1/qa.md)

**All numbers are still synthetic.** The "holdout" in particular is not a clean holdout any more. I read QA's 12 unseen cases before writing these rules, so its 1.00 below is not evidence that the rules generalise. A truly unseen check needs fresh cases from QA, and then pilot screenshots.

## Numbers

| | Attempt 1 rules (QA holdout added) | Attempt 2 rules |
|---|---|---|
| scan_accuracy_overall, all 92 synthetic (judged) | 0.9609 | **1.00** (goal >= 0.99 met, on synthetic) |
| fare / pickup_min / pickup_miles / trip_min / trip_miles, all 92 | 0.924 / 0.978 / 0.978 / 0.957 / 0.967 | 1.00 each |
| QA holdout (12, eval_set/synthetic_qa_holdout.jsonl) | **0.70** (fare 0.42) | 1.00 (seen while fixing, see above) |
| original 60 | 1.00, fallback 0.15 | 1.00, fallback 0.15 (all 60 per-case rows identical to eval_before.json) |
| my 20 full-screen cases | 1.00, fallback 0.25 | 1.00, fallback 0.25 |
| manual_fallback_rate, all 92 | 0.1957 | 0.2065 |
| verdict median / p90 error | 0.0819 / 0.2214 | unchanged |

- The holdout fallback rate is 0.42 (5 of 12). All 5 are cases where a careful reader can't get the fare either:
  - u01, u02 and u09 have a garbled £ ("E15.75").
  - u03 has a lost decimal point ("£845").
  - u11 is two offers stacked.
- The rise in the all-92 fallback rate comes only from those cases. Before the fix, the parser returned wrong numbers for them instead of None.
- `--baseline reports/eval_baseline.json` and `--baseline reports/cycle-1/eval_before.json` both report no regression.
- `pytest -q`: 53 passed. That includes the JS parity check on all three eval files and on 14 adversarial texts from QA.
- QA's `compare.py` shows Python and JS identical on all 41 of its probes, against 3 differences before.
- QA's 800 KB paste now parses in 29 ms in JS (it took about 4 s before).
- Saved runs: `reports/cycle-1/eval_attempt2_before.json` (old rules with the holdout added) and `reports/cycle-1/eval.json` (after).

## Holdout file

`eval_set/synthetic_qa_holdout.jsonl` holds QA's 12 texts from `qa_probes/unseen_fullscreen.json`, unchanged. Each has `"origin": "synthetic"`, `"kind": "qa_holdout"` and id `syn-qa-uNN_*`.

The expected fields are what a careful reader gets from the OCR text:
- A £ garbled into a letter, or a lost decimal point, is null. This is the same convention as the "garbled" cases in synthetic.jsonl.
- A fare range gives its lower end.
- Two offers on one screen are null.
- u04, u06, u07, u10 and u12 keep QA's expected numbers.
- I chose the expected values for u05 and u08: u05 is 18 minutes ("l8"), u08 is £10.80 (the lower end).

## What changed (parser.py and engine.js, identical rules)

- **H1, fare plausibility.** A fare is dropped (`fare_implausible`) if either bound fails, measured on the known pickup + trip legs:
  - It is above **£20 + £6/mile + £1/minute**.
  - It is below **£0.25/mile**.
  - Reasoning: UK UberX driver rates are about £2.50 base, about £1.00–1.30/mile and about £0.15–0.20/minute. At a 4x surge that is about £10 + £5/mi + £0.80/min. On top of that, about £10 for tolls or airport fees.
  - A lost decimal point multiplies the fare by 100. Any fare of £10 or more then exceeds the existing £1000 cap. Any fare under £10 becomes £100–999, which is above the bound for every trip a sub-£10 fare could pay for. So every ×100 decimal loss is caught.
  - The lower bound catches a decimal moved the other way ("£1.24" for 9 miles).
  - A real 3.6x surge (£45 for 9 mi) and a 52-mile airport run (£48.60) still pass.
- **H2, a stray amount can't stand in for the card's fare.** There are three rules.
  - (a) **A fare must start its line.** Only punctuation or ride-type names (UberX, Comfort, Exclusive, XL, Exec, Green, Pet, Lux, ...) may come before the £. Amounts in the middle of a sentence ("Alex: that's £15", "You spent £32.50", "your £24.99 order") are never fares, whatever the wording. This is the general rule. The keyword list is now only a backstop, extended with spent, spend, paid, pay, payment, received, bank, card, transfer, order, refund and bill.
  - (b) **A garbled card fare blocks substitution.** A line that looks like a card fare whose £ was misread ("E11.10", "fl2.40": one or two letters, then a money-shaped number, alone on its line) may sit between the best candidate and the legs. If it does, the fare is None (`fare_unreadable`).
  - (c) **Rates are not fares.** An amount followed by "/" or "per" ("£1.14/mi") is skipped.
- **H3, hours.** "1 hr 20 mins", "1 h 20 min", "1 hour 20 minutes" and "2 hrs" are all read correctly: 80, 80, 80 and 120 minutes.
- **Fare range.** "£10.80–£13.20" gives the **lower end** (`fare_range_low_end`). The lower end is the amount the offer guarantees, so the verdict errs toward DECLINE or MARGINAL and never over-promises. Returning None would cost a manual entry on a card that is readable.
- **OCR letters in leg numbers.**
  - A token made of digits and O/o/I/l that contains at least one real digit and sits directly before min/mi/km/hr has its letters mapped to digits: "l8 mins" gives 18 and "(l.8 mi)" gives 1.8. Words such as "Bristol" are left alone.
  - Fares may now also start with l/I ("£l2.40").
  - The mapping keeps the text the same length, so positions stay valid.
- **A 0-minute leg with miles** fails the speed check and becomes None.
- **Stacked offers.** A fare candidate *between* the first and last leg means two offers, so everything is None (`multiple_offers`). Two pickup-labelled or two trip-labelled legs also count as `multiple_offers`.
- **Unlabelled legs around a labelled card.** If a labelled pickup and a labelled trip both exist, unlabelled min/distance pairs *outside* them are ignored (`unlabelled_leg_ignored`). This covers navigation bars with no English keyword, such as Spanish "llegada". An unlabelled leg *between* them (a multi-stop trip) gives None for everything (`extra_leg`).
- **Non-ASCII digits.**
  - Arabic-Indic, Extended Arabic-Indic and full-width digits are mapped to ASCII, along with full-width £ and full stop and the Arabic decimal sign.
  - Every regex is now ASCII-only (`[0-9]`, `re.ASCII`), so Python and JS match the same text.
  - Other scripts' digits (Devanagari, for example) are now ignored in both engines. Before, Python read them and JS didn't.
- **Performance.** Line lookups use a precomputed line-start table with binary search, so large pastes no longer take time that grows with the square of their size.
- **Tests.**
  - `tests/test_parser_fullscreen.py` gets 12 more regression tests (H1, H2 x2, H3, range, OCR leg letters, 0-minute leg, stacked offers, Unicode digits, rate line, navigation/multi-stop, large paste).
  - `tests/test_js_parity.py` gets an adversarial-text parity test.

## Still failing

No eval case fails. These known gaps aren't in any eval set:

- **"E12.40" is never read as £12.40.** It is always refused. That is safe, but a real dark-mode screenshot that garbles the £ every time would always need manual entry. Pilot data should show how often this happens.
- **Very slow legs are not refused.** "99999 mins (7.2 mi)" is accepted and gives DECLINE. Only legs that are too fast are checked. This is low risk because the error leads to DECLINE.
- **`manual_offer()` still accepts a 0-minute leg** (QA item 10). Manual entry goes through the app's form and the verdict code, which is outside the parser's text path. Flagged for the builder and verdict-modeler, not changed here.
- **QA items 4–7 and 15** (stale verdict, rapid pastes, numbers visible, word wrap, Details staying open) are UI issues for the builder, not the parser.

## Guesses about real layouts

Each of these could be wrong on real screenshots. Each one fails safe (None), so the cost is a higher manual fallback rate, not wrong numbers.

- **"The fare starts its line, with only a ride-type name before it."** If real OCR merges the fare with other text on one line, for example a badge such as "New £12.40" or two columns read as one line, the fare is refused. The ride-type list is a guess.
- **The plausibility bounds** are from first principles, not data. A very high surge, or a fare with large tolls, above £20 + £6/mi + £1/min would be refused.
- **The garbled-fare-line pattern** (1–2 letters, then a money-shaped number) could also match an unrelated short line, such as a code or an "A1.50" label, between the fare and the legs. That would refuse the fare.
- **The lower end of a fare range** is a policy choice, made because it is the conservative reading. The product owner may prefer refusal.
- **Keywords and labels are English.** Ignoring unlabelled navigation only works when the card's own legs carry the English "away"/"trip"/"Pickup" labels. A fully Spanish card next to a navigation bar would still be refused as `multiple_offers`.

**Recommendation:** have QA write a fresh unseen set before the gate decision, because this holdout is no longer unseen. The real test is redacted pilot screenshots.

---

# Attempt 3 (after the QA "Attempt 2 re-test", reports/cycle-1/qa.md)

**All numbers are synthetic or drawn imitations. None comes from a real Uber screenshot.**

I read QA's 21 fresh cases (`qa_probes/fresh_cases.jsonl`) to find the general rule behind each failure. I did **not** add them to eval_set. Since I have now seen them, they are no longer unseen either. QA's next, unseen set is the real check.

## Numbers

| | Attempt 2 rules | Attempt 3 rules |
|---|---|---|
| scan_accuracy_overall, all 92 eval cases (judged) | 1.00 | **1.00** (goal >= 0.99 met, on synthetic) |
| original 60 (accuracy, fallback) | 1.00, 0.15 | 1.00, 0.15 (all 60 per-case rows identical to eval_before.json) |
| QA fresh text cases (21): fare correct / missed / wrong | 14 / 2 / **5** | 19 / 1 / 1 (see f16 below) |
| QA fresh, cases with any wrong number | 6 | 1 (f16) |
| QA real-OCR scans (26 images, QA's saved OCR text re-parsed): fields correct / missed / wrong | 124 / 2 / 4 | 128 / 0 / 2 (f16 light and dark) |
| Python vs JS differences (41 probes + 21 fresh) | 0 | 0 |
| Fields that change when blank lines are inserted (all 113 eval and fresh texts, with `\n\n`, `\n \n` and `\n\n\n`) | f15 changed | **0** |

**f16 "wrong" is the new Accept-button rule doing what it was asked to do.**
- The screen has an earnings pill "£71.30" above, then "You're online", the legs, and "Accept £10.20".
- QA's expected value is None, but QA's own table gives the true fare as £10.20, which is what we now read.
- Measured against the true fare, it is correct. Before, the parser read £71.30 and gave ACCEPT.

**Manual-entry share on normal, unambiguous fresh cards** (all five fields readable; 13 of the 21):
- 2 of 13 go to manual entry, with or without blank lines between the lines. Both are OCR garbles that the parser refuses rather than reads wrong:
  - f11: "7 rnins", see below.
  - f18: "£ 12 .40" has a space inside the number. The parser now refuses it; before, it read £12.00.
- On the real-OCR images, readable scans going to manual entry went from 2 of 22 (f15, both modes, caused by the blank-line window) to **0**.

**Other checks:**
- `pytest -q`: 66 passed. That includes JS parity on every eval file, 23 adversarial texts and manual-entry decisions.
- `--baseline reports/eval_baseline.json` and `--baseline reports/cycle-1/eval_before.json` both report no regression.
- Verdict median / p90 error is unchanged (0.0819 / 0.2214).

## Rules changed (fairfare/parser.py and app/js/engine.js identical; verdict.py and engine.js `estimate` identical)

**1. Never guess between two fares.**
- **A card's fare line is "card-fare shaped".** Only punctuation, ride-type names or "Accept" may stand before *or after* the £ amount, or a leg on the same line. An amount followed by words ("£25.00 from Sam via PayPal", "£30 for the shopping", "£6.00 for every 3 trips") is a message, promo or notification, never a fare. This replaces word-hunting as the main rule.
- **More rejection words** (backstop only): from, via, paypal, sent, earnings, on top of spent, paid, received, refund, wallet, earned, today and week.
- **Add-ons are not fares.** An amount right after "+" ("+£5.00 airport fee") is skipped.
- **Earnings pill.** A bare amount whose neighbouring non-blank line is a status label (online/offline, "Finding trips", earnings, today, this week) is not a candidate.
- **The Accept button.**
  - An amount on the same line as "Accept" is the card's own fare.
  - If a *different* fare also sits just above the legs, the fare is None (`fare_ambiguous`).
- **Conflict means None.** Otherwise the fare is the nearest card-fare-shaped amount above the legs. If any other plausible candidate with a different value exists anywhere on the screen, the fare is None (`fare_ambiguous`). Plausible means it passes the £20 + £6/mi + £1/min and £0.25/mi bounds.
- **Unreadable card fare.** A money-shaped line with €, $, ¥, ¢, one or two letters, or no symbol at all, where the card's fare line should be, means the card's fare is unreadable (`fare_unreadable`). No other amount may stand in for it.
  - With no symbol, values up to 5.00 are left alone, because that is a rider rating that lost its ★.
- **Ambiguous trip, not ambiguous fare.** Multi-stop (an unlabelled leg between the pickup and the trip) now refuses only the trip. The fare and pickup are kept, since they aren't ambiguous.

**2. Blank lines don't count.** The 4-line window above the legs counts **non-blank** lines only. Blank means only spaces, tabs, CR, FF or VT, the same character set in both engines. The garbled-fare check uses the same window.

**3. Compact hours.** "1h20min", "1h 20m", "1hr20", "1 hr 20", "1h20 mins" and "80 min" all give 80 minutes, and "2h" gives 120. The hour unit now needs "not followed by a letter" instead of a word boundary.

**4. Manual entry.**
- `estimate()` returns UNKNOWN (`zero_minute_leg`) when any leg has 0 minutes and more than 0 miles, or any negative value.
- 0 minutes with 0 miles (already at the rider) is still allowed.
- Same rule in both engines, tested for parity.

## Still wrong or refused, and why

- **f16, Accept-button fare:** read as £10.20, the true fare. It only counts as "wrong" against QA's conservative expected value (None). The owner and QA should confirm this is the wanted policy.
- **f11, "7 rnins (2.6 mi) away":** pickup refused, so manual entry. I didn't map "rn" to "m".
  - The 60 original synthetic "garbled" cases use exactly "rnin" and expect the legs to be **null**.
  - Mapping it would make those 60 fail, and spec.md says to keep them byte-identical.
  - This is a question for the Orchestrator: either change that convention or accept the refusal.
- **f18, "£ 12 .40":** refused (manual entry). Joining digits across a space is a guess I didn't want to make.
- **f10, stop leg:** trip refused (correct). Fare and pickup are now read.
- **Not refused:** very slow legs ("99999 mins") still give DECLINE. This is a known low-risk gap.
- **Not done here:** manual entry still accepts an absurd fare such as £999 for 7 miles. The parser's plausibility bound isn't applied to typed values. That is a product decision for the builder and verdict-modeler.

## Guesses about real layouts (new this attempt)

- **"Card-fare-shaped line"**
  - Assumes the real card's fare line carries no other words. A real badge after the fare ("£12.40 Fixed", "£12.40 incl. fees") gives None.
  - The ride-type list is still a guess.
- **The pill-label list** (online/offline/finding trips/earnings/today/this week) is English only.
- **The Accept-button rule** assumes an amount on the Accept line is the offer's fare. If a real button carried a different number (for example a bonus), the result would be wrong. This is untested on real screenshots.
- **The conflict rule** gives None whenever a second plausible bare amount is on screen. On real screens that could raise manual entry; pilot data will show.
