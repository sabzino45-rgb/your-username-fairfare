STATUS: PASS

# Cycle 3 privacy and compliance review

_Privacy/Compliance agent, 2026-11-22. This is advice, not legal clearance. The lawful basis, Uber's terms and the DPIA decision stay with the owner and a solicitor (cycle-1 human_gates.md)._

## Scope (confirmed)

`git diff --stat cycle-2...HEAD`:
- Code: fairfare/parser.py and app/js/engine.js (reader rules) only. No other file in app/ changed. No change to sw.js, app.js, store.js, workflows or tools/redact.py.
- Data: eval_set/pilot.jsonl (new, 1 real case) and eval_set/synthetic_real_layout.jsonl (30 synthetic cases).
- Other: tests/test_parser_real_layout.py, reports/cycle-3/* (incl. dev scripts in scan_ocr/), spec.md, and one .gitignore line, `research/real_pay_*`.

The working tree was clean before this review.

## New this cycle: the first real driver data

| Item | Where | Tracked in git? | Contents | Verdict |
|---|---|---|---|---|
| pilot-0001 OCR text | eval_set/pilot.jsonl | Yes | Redacted OCR text of the owner's own offer card | OK, see the token review below |
| Owner's screenshots | /tmp/claude-0/real/ (r01.png, e02-e05.png) | **No** | Images | OK. `git log --all --name-only` lists no .png/.jpg/.heic file in any commit. `*.png`, `*.jpg`, `*.jpeg` and `*.heic` are git-ignored. scan.md says r01.png was "not copied anywhere". |
| Real pay figures | research/real_pay_2026-11.md | **No** | 7 trips: fare, product, trip minutes and miles. Also 2 cancellation fees. No addresses, rider details or images. | OK. `git ls-files research` gives only README.md, and `git check-ignore` matches `.gitignore:11 research/real_pay_*`. It is the owner's own earnings, kept on this machine only. |

## pilot-0001: token-by-token review

`tools/redact.py` over the committed `ocr_text` changes nothing (only a trailing newline differs). Every remaining token:

| Token | What it is | Identifies a rider? |
|---|---|---|
| `0:00 EXM@U:.`, `0112+`, `2°` | Status bar and map junk (clock, icons, a temperature or bearing) | No |
| `on Aboot` | A garbled **partial map place label** | No. It is a map label near the driver's position, not the pickup or drop-off address. At most it points to a town-sized area. |
| `A380` | A road number from the map (a main A-road) | No. Same as above: a long road, area level only. |
| `oe UberX`, `BE —` | Ride type plus OCR junk | No |
| `£30.27`, `% 5.00 After fees`, `£2.92 est. holiday entitlement included` | Fare and sub-amounts | No (the driver's own pay) |
| `21 min (8.2 mi)`, `12 mins (4.6 mi)` | Pickup and trip legs | No |
| `[ADDRESS]` x2, `\|` | Pickup and drop-off addresses, removed by hand; route connector | No |

No rider name, rating, phone number, street, house number or postcode is left.

**Decision on the partial place names:** they are acceptable in this case. They locate the **driver** (the owner, who supplied the card) to an area at one moment. They don't locate a rider's home or destination, and the parser doesn't need them. For cards from other drivers, I recommend replacing map labels with a token such as `[MAP]`. That goes to the owner as a human gate, because it is a data-handling rule.

## Cycle 1's open item: "fix redact.py before real pilot cases"

**Not done.** tools/redact.py is unchanged since cycle 1 (`git diff cycle-2...HEAD -- tools/redact.py` is empty), and the cycle-1 human gate (R5/R6) is still unticked. The case was redacted by hand instead. The result is clean, so nothing unredacted reached the repo. But a gate was bypassed.

Evidence that the gap matters: I took the app's real OCR text of r01.png from the Ops scan. I ran redact.py over it in memory, then deleted the text without printing it. redact.py removed 1 postcode. It left **2 address lines** that the hand redaction removed, because the addresses there are place words without a street suffix ("Road", "St", ...), so neither STREET nor NAME_LINE matches them. redact.py on its own is **not** safe for real Uber cards. Flagged to the owner (human_gates.md).

The new synthetic cases are clean. redact.py's 29 changes on synthetic_real_layout.jsonl are all false positives: shop names on the map (Tesco Extra, Shell, Lidl, Asda) became `[NAME]`. Pickup and drop-off are already `[ADDRESS]`. The replica texts in reports/cycle-3/scan_ocr/ use invented places ("Sampleton", "Testford") and invented postcodes (AB12CD, QQ11QQ).

## Checks

| Check | Result | Evidence |
|---|---|---|
| New storage, network or logging in app code | None | Grep over the added lines of `git diff cycle-2...HEAD -- fairfare app` for fetch, XMLHttpRequest, sendBeacon, WebSocket, localStorage, sessionStorage, indexedDB, console., print(, logging, open( and http(s)://: **0 hits**. The only such calls are in the dev-only scripts in reports/cycle-3/scan_ocr/ (writeFileSync for replica results, `localhost:8794`), which aren't part of the app. |
| Parser output | Numbers and fixed codes only | The new warnings are fixed codes (`fare_after_fees`, `pickup_inferred_from_order`, `trip_inferred_from_order`). No raw text. |
| Eval output | No OCR text | `grep -c ocr_text reports/cycle-3/*.json`: 0 in all files. `on Aboot` and `A380` appear in no report JSON. They appear in spec.md only, as strings the code must not hard-code. |
| Outside hosts | None | tests/test_ocr_selfhosted.py: 2 passed. Ops' real scan of r01.png (online and offline): **0 requests outside localhost:8797**. The image is read in the browser and never sent anywhere. |
| Images in eval_set/ or git | None | See the table above. |
| Tests | 106 passed | `python3 -m pytest -q` |

## UK GDPR checklist (changes since cycle 2)

| Principle | Cycle 3 effect |
|---|---|
| Lawfulness, fairness, transparency | The first real card is the owner's own, supplied by the owner, so consent for that case is clear. For any other driver's card, the cycle-1 consent item (R6) is still open. |
| Purpose limitation | Kept. The text is used only as a regression case. |
| Data minimisation | Mostly kept. The map labels and status bar aren't needed. The 2 addresses were removed. See the recommendation to replace map labels. |
| Accuracy | The reader now reads the real card correctly (5/5 fields). n = 1. |
| Storage limitation | **Gap.** No deletion date is set for the screenshots in /tmp/claude-0/real/ or for research/real_pay_2026-11.md. Both are outside git. Flagged. |
| Integrity and confidentiality | No new host, storage or logging. The pay file is git-ignored. |
| Accountability | The cycle-1 redaction gate was bypassed by hand-redacting. Flagged so the owner can record the decision. |
| International transfers | None new. OCR is self-hosted and on-device. |
| Riders as data subjects | No rider name, rating or address is kept. The addresses on the screenshot were processed only on this machine and only for redaction. |
| DPIA | No change to cycle 1's advice. Screening is due before other drivers' cards are collected. |

## Human gates added (reports/cycle-3/human_gates.md)

1. The cycle-1 redact.py item was bypassed. redact.py misses real address lines. Fix it, or re-decide the item, before the 10 held-back screenshots.
2. Whether partial map labels may stay in pilot cases, and a deletion date for the screenshots and the pay file kept outside the repo.

## Summary

PASS. pilot-0001 holds no rider name, rating, street, postcode or address. The two remaining partial place names are map labels at area level, about the driver, not a rider. That is acceptable for the owner's own card, and flagged for future cases. No image is stored in git. The pay file is git-ignored. No new storage, logging, network call or outside host. But cycle 1's "fix redact.py first" item was not done: the case was redacted by hand, and redact.py alone would have left 2 real address lines. That must be fixed before more real cards. Advice only, not legal clearance.
