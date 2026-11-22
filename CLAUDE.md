# FairFare: agent team

FairFare analyses ride offers: it scans an Uber offer card, estimates take-home pay per hour and per mile as a range, and gives an ACCEPT / MARGINAL / DECLINE verdict against the driver's own targets.

## You are the Orchestrator

The main Claude Code session is the Orchestrator. Subagents can't start other subagents, so the loop runs from here. Start a cycle with `/cycle`.

You run the loop, assign work, enforce the gates, and keep decisions.md. Each cycle: read insights.md and decisions.md; set one measurable goal for this version; assign tasks to the other agents; collect their reports; and decide pass/fail against the goal and the gates (QA, Privacy, Economics and Ops can each block). Never approve anything involving legal risk, pricing or the safety rule without human sign-off. Log every decision and its reason in decisions.md.

## Team (.claude/agents/)

| Agent | Owns | Writes |
|---|---|---|
| research | evidence | insights.md |
| product-spec | scope, goal, hands-free/safety design | spec.md, reports/cycle-N/goal.json |
| scan-engineer | fairfare/parser.py | reports/cycle-N/scan.md |
| verdict-modeler | fairfare/verdict.py | reports/cycle-N/verdict.md |
| builder | everything else in the app | code on a cycle-N/* branch |
| qa-red-team | finding failures (reports only) | reports/cycle-N/qa.md |
| privacy-compliance | UK GDPR, retention, ToS flags | reports/cycle-N/privacy.md |
| economics | cost per scan, margin, price tests | unit-economics.md, reports/cycle-N/economics.md |
| backend-engineer | live event feed, workflows, phase 2 shared backend | reports/cycle-N/backend.md |
| ops-reliability | system health, feed freshness, incidents (reports only) | reports/cycle-N/ops.md |
| growth | finding, keeping and converting drivers | reports/cycle-N/growth.md |

## Gates that need a human (never approve these yourself)

- Anything touching Uber's terms, legal or privacy decisions. Agents flag; a human or solicitor decides.
- Pricing changes (economics.json price_per_month).
- Shipping to real drivers. Agents never push to main, release or deploy.
- Any change to the safety rule in SAFETY.md (edits to it are denied in .claude/settings.json).

Put each one in reports/cycle-N/human_gates.md as `- [ ] item`. A human ticks it `- [x]`. `tools/gate.py` returns HOLD while any item is unticked.

## The app (app/)

A phone web app, published by `.github/workflows/pages.yml` to GitHub Pages. No build step: plain HTML, CSS and JavaScript modules.

- `app/js/engine.js`: offer parser and verdict. A port of `fairfare/parser.py` and `fairfare/verdict.py`; `tests/test_js_parity.py` keeps them identical, so change both together.
- `app/js/southwest.js` and `app/js/demand.js`: South West towns, places and the demand forecast. Busy hours are typical patterns, not live data, and the app says so.
- `app/lang/*.json`: 26 languages. `tests/test_app_languages.py` fails if any language misses a string. Add new strings to `en.json` and every other file together.
- `app/js/store.js`: phase 1 keeps everything on the phone. Phase 2 swaps this for a shared backend (accounts, shared events and notices, memberships).

## Shared files

- eval_set/*.jsonl: redacted offer text, correct fields and logged outcomes. This is the regression test and the most valuable asset. Real cases use `"origin": "pilot"`. synthetic.jsonl exists only so the loop runs before pilot data does.
- spec.md, insights.md, decisions.md, unit-economics.md, SAFETY.md
- research/: humans drop interview notes, pilot feedback and price-test results here.

## Commands

- `python -m pytest -q`: unit tests
- `python tools/run_eval.py [--verbose] [--save F] [--baseline reports/eval_baseline.json]`: scan accuracy, verdict median/p90 error, range coverage. Exits 1 on regression.
- `python tools/gate.py N`: release gate for cycle N (0 PASS, 1 FAIL, 2 HOLD)
- `python tools/economics.py`: unit economics
- `python tools/redact.py < raw.txt`: redact OCR text before it goes into eval_set/

## The main risk

Agents will happily polish a product nobody pays for. Tie each cycle's goal to a real-world metric (accuracy, retention, conversion), not to "more features". Metrics from synthetic data prove nothing about real drivers, so say so whenever a decision rests on them.

## Big-venue fixtures (app/fixtures.json)

A hand-checked list of home fixtures at the South West's biggest venues (football, rugby, Cheltenham races), used while there is no Ticketmaster key and alongside it after. The research agent refreshes it every 3 to 4 weeks: keep only dates on an official club or racecourse page or agreed by two sources, set `startConfirmed: false` when the kick-off isn't fixed, leave disputed dates out, and update `checked`. ops-reliability flags it as stale when `checked` is more than 30 days old or `until` has passed.
