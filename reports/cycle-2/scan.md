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
