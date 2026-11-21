# Decision log

_Owned by the Orchestrator. Append only. Each entry has the date, the decision, the reason and the evidence._

## 2026-11-20 - Baseline (v0)
- Decision: set up the agent team, v0 parser and verdict model, synthetic seed eval set.
- Baseline (synthetic only): scan_accuracy 1.00, manual_fallback 0.15, verdict median error 0.082, p90 0.221, range coverage 0.94.
- Caveat: the synthetic data comes from the same assumptions as the model, so these numbers say nothing about real drivers. Pilot data is needed.

## 2026-11-20 - Cycle 1: FAIL after 3 attempts, stopped for the owner
- Goal: scan_accuracy_overall >= 0.99. Met on synthetic data (1.00 on 92 cases). Synthetic only: says nothing about real Uber screenshots.
- Owner input: "split screen and live recorded scan". Research: continuous capture is impossible from the web app; a native Android app is possible but Uber's UK terms ban scraping the Driver app, so that path is the owner's and a solicitor's decision. Built instead: Share-to-FairFare, paste and drop.
- Built: share target, paste/drop, verdict card with ACCEPT/MARGINAL/DECLINE and numbers behind "Details (parked only)", 26 languages; parser hardened over 3 attempts; OCR engine self-hosted with image clean-up (fixes scanning in the owner's preview).
- Reviews: Economics PASS, Ops PASS (conditional on the first publish), Privacy PASS after the Google Fonts fix, QA BLOCK.
- Why FAIL: on QA's third set of unseen made-up cards, if OCR drops the card's own fare line, a stray amount above the product label (an earnings pill or bank balance) is taken as the fare and can give a false ACCEPT. Not reproduced with real OCR dropping a fare naturally, but possible. Manual-entry rate on readable cards is 47%, a usability cost.
- Rule applied: /cycle stops after 3 failed attempts and asks the human. Work stays on branch cycle-1; nothing merged to main or shipped.
- Lesson: hand-written rules tuned on invented cards keep meeting new invented cards. The next step that matters is 10-20 real, redacted Uber offer screenshots.
- Open human gates: 21 in reports/cycle-1/human_gates.md.

## 2026-11-21 - Cycle 2: HOLD (all reviews PASS), waiting on the owner
- Goal: wrong_number_count <= 0. Met on synthetic data (0 on 156 cases; false ACCEPTs 0). Synthetic only.
- Scope: the screenshot reader only. Research and Growth skipped (no new owner input or question).
- Built over 3 attempts: "fare zone" (fare read only between the ride label and the legs, the label line, or a below-legs Accept line); a size cross-check (a scanned fare must also be the tallest amount word on screen, margin 1.15, at least 1.5x median word height); a scanned fare needs a ride label or Accept line; promo-caption amounts rejected; colour-aware OCR passes so fares on coloured badges are read.
- Reviews: QA PASS (conditional, attempt 3), Privacy PASS, Economics PASS, Ops PASS.
- QA evidence: 0 wrong numbers and 0 false ACCEPTs across 158 real-OCR scans of realistic made-up cards; manual entry on readable cards 8% (text), 16-19% (real OCR), down from 47% at the end of cycle 1.
- Gate: HOLD on 3 owner items in reports/cycle-2/human_gates.md: check the assumed card layout on 10+ real screenshots; accept or reject the remaining "fare missed + equally big amount in the card" risk (only triggered with a deliberately thin grey fare); accept or reject the pasted-text risk (or turn off pasting offer text).
- Nothing merged to main or shipped to drivers. Work is on branch cycle-2 (contains cycle 1's work).

## 2026-11-21 - Owner decisions on cycle 2
- Layout check: owner has looked at real Uber screenshots and will send them (redacted). They become FairFare's first real (pilot) test cases.
- Rare reader risk (fare missed + equally big amount in the card): NOT accepted by the owner. Cycle 2 stays blocked for release.
- Pasted text risk: accepted; pasting offer text stays.
- Go live: owner approved going live, but it cannot happen yet: the reader risk is not accepted, and GitHub shows Pages still off (latest Publish app run, 2026-11-20 19:14, "Get Pages site failed... Not Found") and no Ticketmaster key ("ticketmaster_no_key").
- Next: cycle 3 tests and fixes the reader on the owner's real screenshots to close the risk; then release, once Pages is on.
