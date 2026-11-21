STATUS: PASS

# Cycle 2 privacy and compliance review

_Privacy/Compliance agent, 2026-11-21. This is advice, not legal clearance. Lawful basis, Uber's terms and the DPIA decision remain with the owner and a solicitor (cycle-1 human_gates.md)._

## Scope (confirmed)

`git diff --stat cycle-1...HEAD`: the only code changes are fairfare/parser.py, app/js/engine.js, tools/run_eval.py, three tests (test_eval_metrics.py, test_parser_fare_zone.py, test_js_parity.py) and the new eval_set/synthetic_fare_zone.jsonl. The rest is reports/cycle-2/* and spec.md. Nothing else in app/ changed: no app.js, sw.js, store.js, index.html, manifest or vendor files. No workflow changes. Working tree clean.

## Checks

| Check | Result | Evidence |
|---|---|---|
| New code stores, logs or sends data | None | Grep over the added lines of the diff for `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `localStorage`, `sessionStorage`, `indexedDB`, `console.`, `print(`, `logging`, `open(`, `http(s)://`: no hit in parser.py, engine.js or run_eval.py. The only `ocr_text` hit is a test fixture in tests/test_eval_metrics.py. |
| Parser output holds raw text | No | The new code only adds fixed warning codes to `offer.warnings` (`fare_ambiguous`, `fare_unreadable`, `fare_missing`, `fare_not_near_legs`). The Offer fields are unchanged: numbers, surge, rating, source, warnings. |
| New eval output holds OCR text | No | run_eval.py adds `wrong_fields` (field names) and `true_decision` to each row. `grep -c ocr_text reports/cycle-2/*.json`: 0 in all five files. |
| New eval cases are synthetic, text only | Yes | 28 cases (syn-fz-001 to 028). All `"origin": "synthetic"`. Keys: id, origin, kind, note, ocr_text, expected_fields, profile. No base64, image paths or `data:image`. |
| redact.py over the new `ocr_text` | 5 diffs, all false positives | `Halifax` (fz-003), `Conectat` (fz-005, Romanian "online"), `Exec` (fz-009, a ride type), `Yesterday` (fz-015) and `Monzo` (fz-020) became `[NAME]`. Banks, a status word, a ride type and a date word, not people. Nothing else changed. |
| Manual read of all 28 texts | Clean | No person's name, address, postcode, phone number or email. `Standing order to J` (fz-012) is a single invented initial. `Contactless at Tesco Express` (fz-008) is a shop chain with no location. Ratings and amounts are invented. No phone-number pattern (`0\d{9,10}`, `+44`) or `@`. |
| New outside host anywhere in app/ | None | Grep of app/ for `https?://` outside localhost: the only hits are `cdn.jsdelivr.net` default strings inside the vendored app/vendor/tesseract/*.min.js, unchanged this cycle. app.js sets `workerPath`, `corePath` and `langPath` to `vendor/tesseract/`, so they are not used. tests/test_ocr_selfhosted.py (no outside host in app code outside vendor) passes. In the Ops Playwright run (page load, a real screenshot scan, offline reload, offline scan) there were **0 requests outside localhost:8775**. |
| Tests | 79 passed | `python3 -m pytest -q`. |

## UK GDPR checklist (changes since cycle 1 only)

| Principle | Cycle 2 effect |
|---|---|
| Lawfulness, fairness, transparency | No change. The reader runs on the phone, as before. |
| Purpose limitation | No change. |
| Data minimisation | No change. The new rule ignores more of the screen (amounts above the product label, notification lines), and keeps only the same numbers. |
| Accuracy | Improved on synthetic data (0 wrong numbers, 0 false ACCEPTs on 120 cases). Synthetic only: it proves nothing about real cards. The layout assumption is a human gate already (cycle-2 human_gates.md). |
| Storage limitation | No change. No new storage. |
| Integrity and confidentiality | No change. No new host or script. |
| Accountability | No change. Cycle-1 open items (privacy notice, DPIA screening, lawful basis, ICO fee) still stand. |
| International transfers | None new. Since cycle 1 the OCR engine is self-hosted, so jsDelivr is no longer contacted. Only GitHub Pages hosting remains. |
| Data subject rights / riders | No change. No rider data is kept. |

## Notes (not blocking)

- **redact.py is unchanged**, so cycle-1 recommendation R5 is still open: it misses notification previews such as `Messages · Alex: ...`, and it turns bank and app names into `[NAME]`. The new cases show more such lines (`Barclays · now`, `Santander · now`, `Nationwide · 2m ago`). Real full-screen screenshots will contain real senders and message text. R5 must be done before any pilot case enters eval_set/.
- The new rule depends on the product-label layout of real Uber cards. Checking it needs 10 or more real, redacted screenshots (human gate). Those must be collected under cycle 1's pilot-data gate: driver consent, text only, images deleted.

## Human gates

No new items. Cycle-1 items and the cycle-2 layout item still apply.

## Summary

PASS. Cycle 2 changes only the reading rules, eval metrics, synthetic cases and tests. No new storage, logging or network call. No new outside host, and 0 outside requests during a real scan. The 28 new cases are synthetic text with no personal data. redact.py's 5 changes are all false positives. R5 (redact notification previews) is still required before pilot data. Advice only, not legal clearance.
