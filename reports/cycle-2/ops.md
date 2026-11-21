STATUS: PASS

# Ops & Reliability: cycle 2

Checked 2026-11-21, around 00:07 UTC. Report only. No code, settings or git state was changed.

## Scope

`git diff --stat cycle-1...HEAD`: code changes only in fairfare/parser.py, app/js/engine.js, tools/run_eval.py, tests and eval_set/synthetic_fare_zone.jsonl. The only app/ file changed is engine.js. sw.js is unchanged (cache `fairfare-v4`). It fetches network-first for same-origin GETs, so installed copies pick up the new engine.js online without a cache bump.

## Status decision

Same reasoning as cycle 1. There is still no published site or feed: GitHub Pages is not enabled, and no driver can reach the app. So feed freshness **cannot be measured**. It has not passed, but there is no deployment for it to block. Shipping is a human gate. Every check that can run on this cycle's work passed, so the status is PASS. The cycle-1 release precondition still stands: after Pages is on, the first "Publish app" must succeed and the published `data/events.json` must have `generated` under 12 h old. Over 24 h makes this a BLOCK.

## Health table

| Check | Result | Evidence |
|---|---|---|
| "Check FairFare" runs | PASS | `gh run list -L 5`: the 3 latest are `success` on `cycle-2` (2026-11-20T23:52Z, 23:53Z, 2026-11-21T00:04Z). The one before is `success` on `cycle-1` (18:33Z). |
| "Publish app" runs | FAIL (known owner action, unchanged) | 4 runs, all `failure`: 2 push (05:43Z, 10:48Z) and now 2 **schedule** runs on main (13:26Z, 19:14Z). `--log-failed` for 44800318578: `Get Pages site failed ... Not Found` (Pages not enabled). The fetch step worked: `events=0 bank_holidays=8 notes=['ticketmaster_no_key']`. The cron does run. It fails at deploy every 6 h. |
| Published site / feed freshness | NOT MEASURABLE | Never deployed (see above). |
| Feed notes | `ticketmaster_no_key` | Same as cycle 1. No live events, only 8 bank holidays. The app says live events aren't switched on. No `bank_holidays_failed`. |
| Unit tests | PASS | `python3 -m pytest -q`: **79 passed** in 0.56 s (cycle 1: 37). Includes language completeness, JS parity on all 4 eval files and self-hosted OCR. |
| Eval regression | PASS | `run_eval.py --baseline reports/eval_baseline.json`: "No regression vs baseline", exit 0. 120 synthetic cases, scan_acc 1.0, wrong_numbers 0, false_accepts 0. Synthetic only. |
| Check screen loads, console errors | PASS (known 404 only) | Playwright (Chromium, 390x844) against `python3 -m http.server 8775` serving app/ at `#check`. The only console error is the 404 for `/data/events.json` (server log confirms it is the only 404). No `pageerror`. |
| Service worker registers | PASS | `navigator.serviceWorker.ready`: scope `http://localhost:8775/`, state `activated`. The page is controlled after a reload. |
| Real screenshot scan | PASS | A dark offer card (UberX, £12.40, 4.92 ★, 5 mins (1.8 mi) away, 18 mins (7.2 mi) trip, Accept) was rendered to PNG and uploaded via `#scan-file`. `#verdict` left "Reading" in **about 1.0 s**. Result: "MARGINAL ... High confidence". OCR text `UberX / £12.40 / 4.92 * / 5 mins (1.8 mi) away / 18 mins (7.2 mi) trip`. This goes through the new labelled fare zone. 5 requests went to vendor/tesseract, 0 to any outside host. |
| Works offline after one load | PASS | `setOffline(true)` and reload: the app renders (769 chars, `#scan-file` present). The only errors are the events.json 404s. An **offline scan of the same PNG also completed** (MARGINAL, High confidence), so the self-hosted OCR is served from cache. |
| Slow connection | Not re-measured | No change to app.js, sw.js, index.html or the module graph. engine.js grew by 64 lines. Cycle 1's 4.8 s figure stands. |

Script: `/tmp/claude-0/-home-user/822f3609-d26f-5d56-bc0b-4c5c4ba5b5fd/scratchpad/c2ops/c2.js`. The server on port 8775 was stopped afterwards (`pgrep` finds nothing).

## Incidents

**None affecting drivers.** No driver can reach the app.

- **"Publish app" scheduled runs fail every 6 h** (13:26Z and 19:14Z on 2026-11-20). Cause: GitHub Pages is not enabled (owner action, already a human gate). Impact: none yet. Each failure sends the repo owner a failure email, and the noise will grow until Pages is on. That makes a real failure easier to miss.

## Reliability findings carried from cycle 1 (unchanged, no action taken)

1. The app never warns when the feed is old.
2. The SW caches error responses, including the events.json 404.
3. Render waits for events.json.
4. The workflows use actions on Node 20 (deprecated).

## Top reliability risk

Unchanged: **the live feed can go stale unnoticed.** The cron now runs but fails every time, and the app has no age warning. New in cycle 2, for the reader: every accuracy figure is synthetic. A real Uber layout the fare-zone rule doesn't expect would show up as more manual entry, not as an error Ops can see. The real-screenshot human gate is the only guard.

## Summary

STATUS: PASS. CI is green on cycle-2. 79/79 tests pass. Eval shows no regression. The Check screen loads with only the known events.json 404. The SW activates. The app and a real screenshot scan both work offline, and a scan completes in about 1 s with no outside request. "Publish app" still fails at the Pages step, now on its 6-hourly schedule (owner action). Feed freshness can't be measured until the first publish. That becomes a BLOCK if `generated` is over 24 h old when drivers get the link.
