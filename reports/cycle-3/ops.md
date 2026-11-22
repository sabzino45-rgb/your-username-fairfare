STATUS: PASS

# Ops & Reliability: cycle 3

Checked 2026-11-22, around 03:30 UTC. Report only. No code, settings, eval_set or git state was changed.

## Scope

`git diff --stat cycle-2...HEAD`: code changes are only in fairfare/parser.py and app/js/engine.js, plus eval cases, one test file, dev scripts and reports. engine.js is the only app/ file that changed. sw.js is unchanged and still network-first for same-origin GETs, so installed copies pick up the new engine.js once they are online.

## Status decision

Same as cycles 1 and 2. GitHub Pages is still not enabled, so no driver can reach the app, and feed freshness **cannot be measured**. That isn't a pass, but there is no deployment for it to block. Every check that can run on this cycle's work passed, so the status is PASS.

The release precondition still stands. Once Pages is on, the first "Publish app" must succeed, and the published `data/events.json` must have a `generated` time under 12 h old. Over 24 h is a BLOCK.

## Health table

| Check | Result | Evidence |
|---|---|---|
| "Check FairFare" runs | PASS | `gh run list -L 5`: the 3 latest are `success` on `cycle-3` (2026-11-22T03:02Z, 03:04Z, 03:16Z). The 03:16Z run matches HEAD 6a018d7, committed at 03:16:33Z. |
| "Publish app" runs | FAIL (known owner action, unchanged) | Both runs in the list are `failure` on main (2026-11-21T18:59Z, 2026-11-22T01:22Z). `--log-failed` for run 44971186029: the fetch step worked (`events=0 bank_holidays=8 notes=['ticketmaster_no_key']`), then `actions/configure-pages@v5` failed with `Get Pages site failed ... Not Found`. **It still fails at the Pages step**, every 6 h. |
| Published site / feed freshness | NOT MEASURABLE | Never deployed. |
| Feed notes | `ticketmaster_no_key` | Unchanged. No live events, only 8 bank holidays. The app says live events aren't switched on. |
| Unit tests | PASS | `python3 -m pytest -q`: **106 passed** in 1.5 s (cycle 2: 79). Includes language completeness, JS parity and self-hosted OCR. |
| Eval | PASS | `run_eval.py`: **[pilot]** 1 case, scan_acc 1.0, wrong_numbers 0, false_accepts 0, readable_manual 0.0. **[synthetic]** 186 cases, scan_acc 1.0, wrong_numbers 0, false_accepts 0, readable_manual 0.0 (n = 125), fallback 0.328. `--baseline reports/cycle-3/eval_before.json` and `--baseline reports/eval_baseline.json` both exit 0 ("No regression"). `gate.py 3` says "goal met", and FAILs only because the review reports were missing when I ran it. Pilot n = 1. |
| App loads, console errors | PASS (known 404 only) | Playwright (Chromium, 390x844) against `python3 -m http.server 8797` serving app/ at `#check`. The only errors are the 404 for `/data/events.json` and its matching "Failed to load resource". No `pageerror`. The server log shows 2 404s, both `/data/events.json`. |
| Service worker | PASS | scope `http://localhost:8797/`, state `activated`. The page is controlled after a reload. |
| Real scan of the owner's screenshot (r01.png) | PASS | Uploaded via `#scan-file`. It left "Reading" in **1.8 s**. Verdict: **ACCEPT** (the confidence label was not "High"). The parsed fields match pilot-0001's expected fields on all 5, with warnings `fare_after_fees` and `pickup/trip_inferred_from_order`. The OCR text was checked in memory and then deleted. No addresses were recorded. |
| Works offline after one load | PASS | `setOffline(true)` and reload: the app renders (769 chars, `#scan-file` present), and the only errors are the events.json 404s. An **offline scan of r01.png also completed** with ACCEPT, so the self-hosted OCR is served from the cache. |
| Outside requests | None | 0 requests outside localhost:8797 during the load, the scan, and the offline reload and scan. |
| Slow connection | Not re-measured | No change to app.js, sw.js, index.html or the module graph. Cycle 1's figure (4.8 s) stands. |

The script is at `/tmp/claude-0/-home-user/822f3609-d26f-5d56-bc0b-4c5c4ba5b5fd/scratchpad/c3ops/c3.js`. The server on 8797 was stopped afterwards (`pgrep` finds nothing).

## Incidents

**None affecting drivers.** No driver can reach the app.

- **"Publish app" keeps failing every 6 h** at the Pages step. The cause is that GitHub Pages is not enabled. That is an owner action and already a human gate. There is no impact on drivers yet, but the failure emails are noise that can hide a real failure.

## Reliability findings carried from cycle 1 (unchanged, no action taken)

1. The app never warns when the feed is old.
2. The service worker caches error responses, including the events.json 404.
3. Rendering waits for events.json.
4. The workflows use actions on Node 20, which is deprecated.

## Top reliability risk

For the reader, the risk is n = 1: the real-card figures rest on one screenshot. A real layout the rules don't expect shows up as more manual entry, or in the worst case a wrong fare, not as an error Ops can see. The 10 held-back screenshots (human gate) are the only guard.

For the service, the risk is unchanged: the live feed can go stale unnoticed once it is published.

## Summary

STATUS: PASS.
- CI is green on cycle-3, and 106 of 106 tests pass.
- run_eval shows pilot 1/1 and synthetic 186 cases, with 0 wrong numbers and 0 false ACCEPTs, and no regression.
- The app loads with only the known events.json 404.
- The real r01.png scan gives ACCEPT with all 5 fields correct, both online and offline, with no outside requests.
- "Publish app" still fails at the Pages step (owner action).
- Feed freshness can't be measured until the first publish.
