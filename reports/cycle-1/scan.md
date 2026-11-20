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
