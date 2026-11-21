STATUS: PASS

# Economics, cycle 2

_Economics agent, 2026-11-21. All inputs are placeholders. Nothing is based on real users, payments or conversion data, because none exist._

## Verdict

PASS. Cycle 2 adds **no per-scan cost and no fixed cost**. The cycle-1 figures stand unchanged. No new model copy is needed.

## What changed and its cost effect

`git diff --stat cycle-1...HEAD`: only fairfare/parser.py, app/js/engine.js (reader rules), tools/run_eval.py (metrics), eval_set/synthetic_fare_zone.jsonl, tests and reports. No change to app.js, the OCR engine (app/vendor/tesseract), sw.js, workflows, economics.json or decisions.md.

| Change | Per-scan cost | Fixed cost |
|---|---|---|
| Fare-zone rule in parser.py / engine.js | £0. Same text rules on the same on-device output. A few more string checks per line. No new call. | none |
| New eval metrics and 28 synthetic cases | £0. Developer and CI only. A few hundred ms more in "Check FairFare". | £0 (free Actions) |

The OCR stays on the phone (Tesseract, self-hosted under app/vendor). There is no cloud OCR or LLM path. Grep of the diff: no new network calls.

## Figures (unchanged from cycle 1)

`python3 tools/economics.py reports/cycle-1/economics.json` (cycle-1 model: `on_device_ocr_share` 1.0):

```
cost_per_scan                  0.0
variable_cost_per_user_month   0.0
net_revenue_per_user_month     3.5344
gross_margin_per_user_month    3.2344
gross_margin_pct               0.9151
break_even_scans_per_month     None (no per-scan cost)
```

The base economics.json (`python3 tools/economics.py`) still gives 0.0003 per scan, 0.18 per user per month, margin 3.0544 (86.4%) and break-even 10,781. That is because the base still assumes 20% cloud OCR, which the app doesn't have. Change from cycle 1: 0%. No fall, so no decisions.md entry is needed. price_per_month (4.99) is unchanged.

unit-economics.md: figures still correct. It still says Tesseract loads from cdn.jsdelivr.net. Since cycle 1, it is self-hosted under app/vendor (about 11 MB, still £0 on GitHub Pages). I added a one-line cycle-2 note there.

## Cost-related note

Cycle 2 sends 9 more synthetic cards to manual entry (manual_fallback_rate 0.275 to 0.283, all cards that should be refused). Manual entry costs the driver time, not FairFare money. It has no cost effect.

## The main risk: loud warning

**There is still no retention, conversion or willingness-to-pay data.** Pilot drivers: 0. Price tests: 0 (research/ holds only README.md). Cycle 2's 0 wrong numbers are on synthetic cases the Scan Engineer wrote. The 91.5% margin is arithmetic on a made-up price for users who don't exist. The next spend of effort should go to getting real drivers and real screenshots (the cycle-2 human gate), not more parser polish.

## Human gates

None added. Cycle-1 pricing and payment-channel items remain open.
