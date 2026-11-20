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
