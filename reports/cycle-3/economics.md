STATUS: PASS

# Economics, cycle 3

_Economics agent, 2026-11-22. All model inputs are still placeholders. The only real figures are the owner's own pay for 7 trips (research/real_pay_2026-11.md, git-ignored). They are used here in aggregate only._

## Verdict

PASS. Cycle 3 adds **no per-scan cost and no fixed cost**. The cycle-1/2 figures stand. No model copy is needed, and unit-economics.md was not changed.

## What changed and its cost effect

`git diff --stat cycle-2...HEAD`: reader rules (fairfare/parser.py, app/js/engine.js), 1 pilot and 30 synthetic eval cases, one test file, dev scripts in reports/cycle-3/scan_ocr/, and reports. No change to the OCR engine (app/vendor), sw.js, workflows, economics.json or decisions.md.

| Change | Per-scan cost | Fixed cost |
|---|---|---|
| Real-layout reader rules | £0. The same on-device text rules, with a few more line checks. No cloud OCR or LLM call (the grep of the diff finds no network call). | none |
| 31 eval cases and the new tests | £0. CI only: the test run goes from 79 tests to 106, and still takes about 1.5 s. | £0 (free Actions) |
| Playwright replica scans | £0. They run locally on a developer machine. | none |

## Figures (unchanged)

Cycle-1 model (`python3 tools/economics.py reports/cycle-1/economics.json`): cost_per_scan 0.0, variable cost 0.0, net revenue 3.5344, gross margin 3.2344 (91.5%), break-even None.

Base economics.json (still assumes 20% cloud OCR): 0.0003 per scan, 0.18 per user per month, margin 3.0544 (86.4%), break-even 10,781.

Change from cycle 2: 0%. price_per_month (4.99) is unchanged.

## Does the real pay data change an input assumption?

Checked each input against the 7 real trips. Aggregate ranges:
- fare £8.23-£39.53 per trip;
- about £1.7-£10 per trip mile;
- about £0.5-£2.8 per trip minute;
- trips of 1-24 miles;
- plus 2 cancellation fees.

| Input | Affected? |
|---|---|
| price_per_month, vat_rate, app_store_fee | No. Pay data doesn't say what a driver would pay for FairFare. |
| ocr_cost_per_scan, on_device_ocr_share, llm and storage costs | No. These are app costs. |
| scans_per_user_month (600) | **Can't be checked.** The data lists completed trips, not offers seen, and each offer is a scan. Even if it were wrong, per-scan cost is £0, so the margin doesn't change. |
| fixed_cost_per_user_month | No. |

So **no input assumption changes**, and I added no line to unit-economics.md.

One context point, not an input: a £4.99/month price is less than the smallest real fare seen (£8.23). Whether it is worth that to a driver is still unknown.

The real card shows its fare **"After fees"**, so the fare is already after Uber's service fee. That is a verdict-model question (spec.md, out of scope this cycle), not a cost one.

## The main risk: loud warning

**There is still no retention, conversion or willingness-to-pay data.**
- Pilot drivers: 1 (the owner).
- Price tests: 0. research/ holds no price_test* file.

Cycle 3 got the reader working on one real card. That is progress on accuracy, not on whether anyone pays. The 91.5% margin is still arithmetic on a placeholder price for users who don't exist. The next valuable step is still real drivers and the 10 held-back screenshots (human gate), followed by a price signal.

## Human gates

None added. Cycle 1's pricing and payment-channel items are still open.
