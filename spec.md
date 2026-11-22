# Spec

_Owned by product-spec. Rewritten each cycle. Newest cycle first; cycle 2, cycle 1 and v0 are kept below for history._

# Cycle 3

## Goal for cycle 3 (v1.2): read the real Uber UK offer card

**Why this cycle:** cycle 2's reader passed every review, but the owner did NOT accept the remaining risk (OCR loses the fare while an equally big amount sits inside the card, giving a false ACCEPT), so it cannot ship (decisions.md, "Owner decisions on cycle 2"). The owner then sent FairFare's first real offer card (eval_set/pilot.jsonl, pilot-0001). The app's real OCR read every number on it correctly, but the cycle-2 text rules refuse its fare: pilot `readable_manual_rate` = 1.0 and `scan_accuracy_overall` = 0.8 (reports/cycle-3/eval_before.json). The real card breaks several cycle-2 assumptions:

| cycle-2 assumption | real card (pilot-0001) |
|---|---|
| the only £ amount in the fare zone is the fare | a second £ amount sits between the fare and the legs: "£… est. holiday entitlement included", a part of the fare, not a rival fare |
| (none) | an "After fees" chip next to the fare: the fare is already the driver's take-home before running costs |
| clean ride label | the label carries OCR junk ("oe UberX"), and a junk line ("BE —") sits between label and fare |
| legs carry "away" / "trip" words | legs are bare "21 min (8.2 mi)" / "12 mins (4.6 mi)", each followed by an address line (redacted to [ADDRESS]) and a "|" connector line |
| the button says "Accept" | the button says "Match" (OCR did not keep it in this capture) |
| (none) | a surge icon follows the fare; map and status-bar junk sit above the card |

**Scope:** the screenshot reader only: fairfare/parser.py and app/js/engine.js, kept identical (tests/test_js_parity.py), plus eval cases and tests that measure it. Owner: scan-engineer. No UI, verdict-model or app changes.

**Gated metric (tools/gate.py, reports/cycle-3/goal.json):**

```
scan_accuracy_overall >= 1.0
```

judged on the **pilot** side of `python tools/run_eval.py --save reports/cycle-3/eval.json` (run_eval judges pilot whenever pilot cases exist; today that is pilot-0001 only).

Why this metric: it is the one number that says "the real card's fare is read **and read right**". `readable_manual_rate <= 0` would also pass if the parser returned a wrong fare (a wrong fare is not "missing"), and `wrong_number_count <= 0` already passes today (0, the fare is refused). `scan_accuracy_overall` = 1.0 needs all 5 fields present and within tolerance. It rests on one real card, so it proves the reader handles this layout, not real cards in general (see "What cycle 3 can claim").

**Acceptance criteria the Orchestrator verifies (not in gate.py; each one blocks):**
1. Pilot side: `wrong_number_count` = 0, `false_accept_count` = 0, `readable_manual_rate` = 0.
2. Synthetic side: `wrong_number_count` = 0 and `false_accept_count` = 0 (as in cycle 2), and `readable_manual_rate` not above cycle 2's 0.0 (reports/cycle-3/eval_before.json, 103 readable cases).
3. `python tools/run_eval.py --baseline reports/cycle-3/eval_before.json` exits 0, and `python -m pytest -q` passes, JS parity included.
4. No hard-coding: neither engine contains any string or number specific to pilot-0001 (e.g. "30.27", "2.92", "8.2", "BE —", "oe UberX", "on Aboot", "A380"). The scan-engineer adds a test that reads at least 3 re-valued variants of pilot-0001 (different fare, sub-amount, legs, labels, junk lines) correctly; caption vocabulary (R1) is a general list, not this card's line.

## Requirements (cycle 3, priority order)

### R1. Read real Uber UK card layouts (owner: scan-engineer)

General rules, in fairfare/parser.py and app/js/engine.js together. Every rule must keep the cycle-2 protections: amounts above the label or outside the card are never fares; two rival fares give None; a garbled fare gives None; the height check stays.

1. **Sub-amount lines describe the fare, they don't rival it.** A £ amount on a line whose caption says it is a part of, or a note on, the fare (one shared caption list, e.g. "included", "incl.", "est.", "estimated", "entitlement", "holiday", "after fees", "tip", "tips", "fee(s)", "toll(s)", "surcharge", "Clean Air Zone", "boost", "surge") is a **sub-amount**. Sub-amounts never count as a second fare (no `fare_ambiguous`) **and are never a fare candidate themselves**: if the fare line is lost and only a captioned sub-amount remains, the answer is None (`fare_missing`). A sub-amount must be smaller than the fare it sits with; if it is not, give None. This rule must not widen the owner's unaccepted risk: an uncaptioned second amount in the zone still gives `fare_ambiguous`, as in cycle 2.
2. **"After fees" chip.** A chip such as "After fees" next to or below the fare (with or without an OCR-junk icon and a number, like "% 5.00 After fees") marks the fare as take-home before running costs. It is not a fare and not a rival. The parser does not invent a surge value from it unless the line is clearly a surge line under the existing surge rule. Record a flag (e.g. `fare_after_fees`) in warnings or a field for later; the verdict model is unchanged this cycle.
3. **"Match" counts like "Accept".** One shared list of button words (Accept, Match, and any others the scan-engineer can justify) wherever the cycle-2 rules use the Accept line.
4. **Label OCR junk.** A product-label line still counts as the anchor if, besides ride-type names, it holds only short OCR junk tokens (at most 2 characters each, at most 2 tokens, e.g. a mis-read icon). Ordinary words still disqualify it. Add ride-type combinations seen in real pay data ("UberX Priority") to the shared list. Short junk lines between the label and the fare (no digits, no £, at most ~4 characters of letters and punctuation) don't break the fare zone.
5. **Bare legs followed by address lines.** Two bare leg lines ("21 min (8.2 mi)", "12 mins (4.6 mi)") with no away/trip words are pickup then trip, in screen order, when each is followed by an address line (an [ADDRESS] token, or a line of words with no £ and no leg pattern) and/or a connector line ("|", "·", "•"). Address and connector lines between legs don't break leg pairing. More than two bare legs, or one, stays a refusal for the missing leg.
6. **Surge icon after the fare.** An OCR-junk icon token on or after the fare line (e.g. "⚡", "%", "4") does not make the fare line unreadable, as long as the amount itself is a clean "£d+.dd".
7. **Fare plausibility bounds checked against real pay.** The owner's real completed trips (research/real_pay_2026-11.md) pay roughly **£1.5-£10 per trip mile** (short minimum-fare trips are the high end), trips of about 1-24 miles. The current bounds (fare between £0.25 per total mile and £20 + £6/mile + £1/minute over pickup plus trip) would accept all of them; the scan-engineer adds a test with real-pay-shaped values (aggregate ranges only, no row-by-row copy) proving that no fare in that range, with or without a pickup leg, is refused as `fare_implausible`, and loosens the bounds only if that test fails.

Acceptance criteria:
1. pilot-0001 reads all 5 fields (the gated goal) and the Orchestrator criteria above hold.
2. Text-level tests cover each of rules 1-7, including the safety cases: fare line lost with only a captioned sub-amount present gives fare None; fare line lost with an uncaptioned equal-size amount in the zone gives None (as cycle 2); a sub-amount larger than the fare gives None.
3. reports/cycle-3/scan.md lists every rule, every new assumption about real layouts, before/after numbers on both sides, and says plainly that only one real card backs them.

### R2. Real-layout regression cases (owner: scan-engineer)

Add `eval_set/synthetic_real_layout.jsonl` (origin "synthetic"): at least 20 cards modelled on pilot-0001's **structure** (status-bar and map junk above, junk-carrying label, fare, surge icon, "After fees" chip, captioned sub-amounts, bare legs with address and connector lines, Match/Accept button) with varied values, ride types, captions (holiday entitlement, tip, tolls, Clean Air Zone, fee included), banners, km legs, and at least 5 adversarial cards: fare lost with a captioned sub-amount left; fare lost with an uncaptioned amount in the zone; sub-amount bigger than the fare; two bare legs plus a third leg-like line; "Match" with a different amount. Save `reports/cycle-3/eval_real_layout_before.json` under the cycle-2 rules first: it must show readable cards refused (otherwise the cases don't test the change). After the fix: 0 wrong numbers, 0 false ACCEPTs on these cases, all readable ones read.

These cases are synthetic and judged on the synthetic side; they guard against regressions, they don't prove real-world accuracy.

## QA acceptance (cycle 3; QA can block)

QA builds its own unseen replicas of the **real** card layout, from pilot-0001's structure (not from R2's file), with varied values, labels (incl. OCR-junk labels and combinations), banners, map backgrounds, sub-amount captions (incl. ones not in the parser's caption list), Match and Accept buttons, surge icons and "After fees" chips:
- at least 25 cards, at least 18 readable (all 5 fields readable by a person);
- at least 6 adversarial cards: fare lost or drawn thin with a captioned sub-amount, with an uncaptioned amount as big as the fare (the owner's risk), sub-amount near the fare's size, two offers;
- at least 15 rendered as phone images (real Uber proportions: map top, white card bottom) and scanned through the app's real OCR in light and dark mode.

Pass criteria:
1. **Zero false ACCEPTs**, text level and real OCR, on every card. Any wrong number is reported with severity; one that changes the verdict word is High and blocks.
2. **Readable cards needing manual entry <= 15%** on the real-OCR scans (and at text level). Refusing a genuinely garbled line is correct; QA reports each refusal with its cause.
3. Python and JS identical on every card. pilot-0001 also scans correctly as a rendered replica.
4. Existing cycle-2 QA sets (sets 4-6, hole probes) re-run: no new wrong numbers or false ACCEPTs.

qa.md must say all of this is replicas, not real screenshots.

## What cycle 3 can claim, and what it cannot

- **Can claim:** the reader reads the one real Uber UK offer card the owner sent, and replicas of its layout, without loosening any cycle-2 protection against stray amounts, and with 0 false ACCEPTs on the cards tested.
- **Cannot claim:** that it reads real cards in general (n = 1), or that the owner's unaccepted risk is closed. That risk (OCR loses the fare while an equally big amount sits inside the card) is about how often real OCR loses a real fare and what else real cards show. Replicas cannot measure that; only real cards can.
- **How the risk can be closed:** the owner sends at least 10 more real, redacted offer screenshots (varied ride types, times, surge/no surge, light/dark, different phones), **held back from the scan-engineer**: the Orchestrator or QA adds them as pilot cases only after the parser is frozen, scans the real images with the app's real OCR, and reports wrong numbers, false ACCEPTs and manual-entry rate on them. Only 0 false ACCEPTs there, plus the owner's own decision, can move the risk to accepted. Until then cycle 3 can at best end HOLD, never ship.

## Out of scope (cycle 3)

- Any UI, verdict-model, language or app change. Using the "After fees" flag or holiday entitlement in the verdict is a later verdict-modeler question.
- Changing how the fare is defined (gross vs after fees), pricing, backend, growth.
- Native capture, live scan, overlays: still behind cycle 1's legal gate.
- Fixing the pasted-text risk (owner accepted it).
- Tuning to pilot-0001's exact text (forbidden, see criterion 4).

## Safety and hands-free review (cycle 3)

| Req | Rule (SAFETY.md) | How it complies |
|---|---|---|
| R1 sub-amounts, Match, labels, bare legs | One glanceable word and colour while moving; no numbers to read. | No UI change; the driver still sees one word. Reading the real card correctly means fewer CAN'T TELLs and fewer stops to type. Sub-amounts are never promoted to the fare, so the rule adds no new way to a false ACCEPT; when unsure the answer stays CAN'T TELL. |
| R1 | Manual entry only when parked. | Unchanged; fewer refusals mean less parked typing. |
| R1 "Match" button | FairFare never accepts or declines offers. | "Match" is only read as a layout landmark; FairFare never presses it or any other button. |
| R2 cases | (none directly) | Eval data only. |

No requirement changes SAFETY.md, and none needs a change to it.

## Human gates triggered (cycle 3)

Added to reports/cycle-3/human_gates.md (cycle 1's and cycle 2's open items still apply):
- Owner supplies at least 10 more real, redacted offer screenshots, held back from the scan-engineer, as the only test that can close the reader risk.
- Owner re-decides the reader risk after that held-back test; cycle 3 passing does not close it on its own.

---

# Cycle 2 (history)

## Goal for cycle 2 (v1.1): never take a stray amount as the fare, and stop refusing readable cards

**Why this cycle:** cycle 1 failed (decisions.md, 2026-11-20). On QA's third set of unseen made-up cards, when OCR dropped the card's own fare line, a bare £ amount above the product label (an Uber Pro earnings pill g01, a Starling balance g11, a pill in Spanish g16) was taken as the fare and gave a false ACCEPT. The cautious "conflict means None" rule that protects other screens sent 7 of 15 readable unseen cards (47%) to manual entry. Both come from the same weakness: the reader looks for the fare by distance from the legs, not by where it sits on the card. The owner chose to run cycle 2 now, with a tighter reading rule and no real Uber screenshots yet.

**Scope:** the screenshot reader only: fairfare/parser.py and app/js/engine.js, kept identical (tests/test_js_parity.py), plus the eval metrics and cases that measure it. No UI, verdict-model or app changes.

**Gated metric (tools/gate.py, reports/cycle-2/goal.json):**

```
wrong_number_count <= 0
```

measured by `python tools/run_eval.py --save reports/cycle-2/eval.json` on the judged side (synthetic today), on all eval files **including the new fare-zone cases from R2**. `wrong_number_count` is new (R2 defines it). Today it is 0 on the 92 existing cases, so R2's new cases must be written first and an eval saved that shows it above 0 under the cycle-1 rules (`reports/cycle-2/eval_fare_zone_before.json`). If that before-eval shows 0, the cases don't test the failure and must be fixed before any parser change.

Why this metric and not scan_accuracy_overall: accuracy counts a refusal (None) and a wrong number the same, and averages them over 5 fields and ~100 cases, so 3 false ACCEPTs barely move it (1.00 to about 0.994, still past cycle 1's 0.99 goal). A wrong number is the harm that matters; a refusal is a usability cost. The gate is a count, so one wrong number fails it.

**Must also hold (QA checks; scan-engineer reports in scan.md):**
- `readable_manual_rate <= 0.02` on the judged side (new metric, R2). Today 0 of the 73 readable eval cards go to manual entry; R2 adds readable cards with stray amounts that the cycle-1 rules refuse, so the before-eval should show a rise and the fix must bring it back down.
- `false_accept_count` = 0 (new metric, R2; implied by the goal, reported separately because it is the safety-relevant subset).
- `run_eval.py --baseline reports/cycle-2/eval_before.json` exits 0. All per-case rows of the original 60 cases are unchanged; manual_fallback_rate on them stays 0.15. verdict median/p90 error unchanged.

**Acceptance criteria on QA's own brand-new unseen cards (the real check; QA can block):**
QA writes a fourth fresh set the scan-engineer has not seen: at least 20 cards, at least 15 of them readable (all 5 fields readable by a person). It must include at least 6 cards whose fare line is missing with a bare £ amount above the product label (with labels and pill wording not in any list the parser uses, e.g. other bank apps, non-English pills), at least 3 cards with no product label at all, at least 4 readable cards with a second £ amount outside the fare zone (bank push, tip, earnings, promo, rider-price line above the card), and at least 2 cards that mix both. At least 10 are also drawn as images and run through the app's real OCR in light and dark mode.
1. **Zero wrong numbers that lead to a false ACCEPT**, text level and real OCR: no card where the app shows ACCEPT and the verdict for the card's true numbers is MARGINAL, DECLINE or CAN'T TELL. Any other wrong number is reported with its severity; a wrong fare that changes the verdict word is High.
2. **Manual-entry rate on readable cards <= 20%** at text level (at most 3 of 15), and <= 25% on the real-OCR scans of readable cards (OCR loses lines on its own). Justification: of cycle 1's 7 refusals on 15 readable cards, 4 (g02, g18, g19, g20) were caused only by a second amount outside the card, which the fare zone ignores; that leaves 3 of 15 (20%): one OCR garble ("1 .8 mi"), one ambiguous layout ("Rider pays … You earn …") and one badge ("£12.40 Fixed"). Refusing a real OCR garble is correct, so 0% is not the target; 20% is what the rule should reach without guessing. Going lower than that means guessing, which this cycle does not ask for.
3. Python and JS give identical results on every QA card.

All figures are synthetic or drawn imitations and say nothing about real Uber screenshots; scan.md and qa.md must say so.

## Requirements (cycle 2, priority order)

### R1. Read the fare only from the card's fare zone (owner: scan-engineer)

Replace "nearest bare amount above the legs, with conflict-means-None" with a structural rule, in fairfare/parser.py and app/js/engine.js together.

- **Product label.** A line is a product-label line if, after trimming punctuation and "·" separators, it is made only of ride-type names and badges from one shared list (case-insensitive): UberX, UberXL, XL, Comfort, Comfort Electric, Green, Exec, Executive, Lux, Black, Pet, Uber Pet, Access, Assist, WAV, Exclusive, Priority, Share, Electric, Taxi, Uber X Share; a fare amount may follow on the same line ("UberX £12.40"). The list is a guess at real layouts and lives in one constant in each engine. The anchor is the **last** product-label line above the first leg line.
- **Fare zone, with a label.** The fare may come only from (a) the lines strictly between the anchor label and the first leg line, (b) the anchor label line itself, and (c) the Accept-button line below the legs, inside the card. Exactly one distinct card-fare-shaped amount there is the fare. Zone and Accept amounts that differ give None (`fare_ambiguous`), as do two amounts in the zone. No amount in the zone or on the Accept line gives None (`fare_missing`): **never look above the label**. A garbled money line in the zone gives None (`fare_unreadable`), as now.
- **Outside the zone is never a fare, and never a conflict.** Any £ amount above the anchor label, or outside the card (after the Accept line, or past the start of a second offer), is ignored entirely. It does not trigger `fare_ambiguous`. This is what removes the needless refusals (cycle-1 g02, g18, g19, g20 patterns).
- **No product label found.** Fall back to the cycle-1 rules (4 non-blank lines above the legs, card-fare-shaped, conflict means None, Accept line), with one extra cut-off: the window stops at, and excludes everything above, the nearest line that is not card text: a status-bar line (clock, battery %, network), a notification header ("App · now", "Monzo", "Starling Bank"), a status/pill label (online, earnings, Uber Pro, today), or any line of ordinary words. An amount above any such line is never a fare.
- Multi-offer screens (Trip Radar, a second card cut off) keep their current refusals. The leg, surge and rating rules are unchanged. Optional, only if the scan-engineer judges it safe: inside the zone, allow a short trailing badge word ("Fixed", "Upfront"); outside the zone nothing changes.

Acceptance criteria:
1. The cycle-1 failures g01, g11, g16 (qa_probes/fresh_cases_3.jsonl, now seen) give fare None; g02, g18, g19, g20 give the true fare. Re-written versions of them may go into R2's eval file.
2. The gated goal and the "must also hold" list above are met; `python -m pytest -q` passes, JS parity included.
3. reports/cycle-2/scan.md gives before/after numbers for all new metrics, lists every assumption about real layouts, and says plainly the numbers are synthetic.

### R2. Measure wrong numbers and needless refusals, and add fare-zone cases (owner: scan-engineer)

**tools/run_eval.py** gains three metrics in `evaluate()`, so each appears in both the `pilot` and `synthetic` blocks of eval.json (the gate reads the judged side), and in the printed summary line:
- `wrong_number_count` (int): the number of cases where at least one REQUIRED field is wrong, i.e. the parser returned a non-null value and `field_ok` is false for it (expected null but a value given, or outside TOLERANCE). Refusals (got None) never count.
- `false_accept_count` (int): cases where the parsed verdict is ACCEPT and the verdict for the true numbers is not ACCEPT. The true verdict is `estimate(Offer(**{f: expected_fields.get(f) for f in REQUIRED}), DriverProfile(**profile))`, so an expected null field gives UNKNOWN.
- `readable_manual_rate` (float, 4 dp) and `readable_n` (int): among cases whose expected_fields has all 5 REQUIRED fields non-null, the share where `offer.missing` is non-empty. None if `readable_n` is 0.
- Per-case rows gain `wrong_fields` (list of field names) and `true_decision`. The `--baseline` regression check also fails if `wrong_number_count` or `false_accept_count` rises. Existing metrics and their values do not change.
- A pytest covers the three metrics on a tiny hand-made case list (one wrong fare, one refusal, one false ACCEPT).

**New eval file** eval_set/synthetic_fare_zone.jsonl (`"origin": "synthetic"`, `"kind": "fare_zone"`, ids syn-fz-001 up), written and evaluated **before** any parser change, at least 20 cases:
- at least 8 with the card's fare line missing and a bare £ amount above the product label (varied pill, bank, tip and non-English wording, not only words the parser lists); expected fare null, legs filled;
- at least 8 readable cards with a second £ amount outside the fare zone (above the label or below the card); expected fare = the card's fare;
- at least 4 with no product label: 2 where the only amount sits above a status-bar or notification line (fare null), 2 readable (fare filled).
Save `reports/cycle-2/eval_fare_zone_before.json` with the cycle-1 parser; it must show `wrong_number_count > 0` and `readable_manual_rate` above its value in eval_before.json. The existing eval files stay byte-identical.

Acceptance criteria:
1. eval.json has the three metrics on both sides; `python tools/gate.py 2` reads `wrong_number_count` from it.
2. The before-eval file exists and shows both effects; scan.md quotes it.
3. pytest passes.

## Out of scope (cycle 2)

- Any UI change: verdict card, Details, history, settings, languages, the Low items QA left open (shift chips, Tamil 12px scroll, `MAX_TEXT`, £999 manual entry). The builder has no requirement this cycle.
- Share target, paste/drop, service worker, OCR engine and image clean-up: unchanged.
- Native Android app, live capture, split screen, Accessibility overlay: still waiting on the cycle-1 legal gate.
- Spoken verdict, verdict model changes, backend, pricing, recruitment.
- OCR-garble repair ("rnins" to "mins", "£ 12 .40", "1 .8 mi") and the "Rider pays … You earn …" layout: refusing these stays correct until real screenshots show what they look like.
- Real Uber screenshots: none exist yet. The next step that matters is still 10-20 real, redacted ones (decisions.md).

## Safety and hands-free review (cycle 2)

| Req | Rule (SAFETY.md) | How it complies |
|---|---|---|
| R1 fare zone | One glanceable word and colour while moving; no numbers to read. | No UI change: the driver still sees one word. The rule makes that word more trustworthy: a stray amount can no longer become the fare, so a false ACCEPT from screen noise is removed. When the zone has no fare, the answer is CAN'T TELL, not a guess. |
| R1 fewer refusals | Manual entry only when parked. | Every needless refusal sends the driver to manual entry, which is parked-only typing. Cutting refusals on readable cards means fewer cases where the driver has to stop and type. The rule never guesses to lower that rate: refusals for garbled or ambiguous fares stay. |
| R1 | FairFare never accepts or declines offers. | Unchanged; the reader only reads text from an image the driver chose to send. |
| R2 metrics and cases | (none directly) | Eval tooling only, no driver-facing change. It makes wrong numbers, the safety-relevant failure, a hard gate. |

No requirement changes SAFETY.md, and none needs a change to it.

## Human gates triggered (cycle 2)

Added to reports/cycle-2/human_gates.md (cycle 1's 21 open items still apply):
- Product/Shipping: owner confirms the fare-zone layout assumption (label above fare above legs; an Accept-button amount is the offer's fare) against at least 10 real, redacted offer screenshots before the cycle-2 reader ships to any driver.

---

# Cycle 1 (history)

## Current version: v0 (baseline)

- Parser: OCR text to fare, pickup and trip minutes/miles, surge, rating. Manual-entry fallback.
- Verdict: take-home per hour and per mile as a low/mid/high range, with confidence and a decision against the driver's targets. Engine codes are ACCEPT / MARGINAL / DECLINE (fairfare/verdict.py, app/js/engine.js).
- App (app/): Check screen with three modes: "Scan screenshot" (file picker, then Tesseract.js OCR on the phone), "Paste text", "Type numbers". The manifest has no share target, the page has no image paste or drop, and the service worker ignores non-GET requests.
- Known gaps found while writing this spec (checked in code, 2026-11-20):
  - en.json shows the engine's MARGINAL / DECLINE as **MAYBE / SKIP**. SAFETY.md says ACCEPT / MARGINAL / DECLINE.
  - The verdict card always shows the per-hour range, five number tiles and reasons. The app has no way to tell whether the vehicle is moving, so under SAFETY.md it must assume it is, and numbers should not be the first thing on screen.
  - The parser takes the first £ amount on the screen as the fare. A full-phone screenshot with a stray £ amount above the card (a notification, a promo banner) gives the wrong fare. Probe: status bar + "£5.00 off your next ride" + a £12.40 card parsed as fare 5.00.

## Goal for cycle 1 (v1): capture the job quickly, and read it right

**Owner's request:** "split screen and live recorded scan feature that capture the job quickly". Research (reports/cycle-1/research.md) found continuous capture of the Uber app is impossible from a web app on Android and iPhone. A native Android app could do it, but that needs a legal decision (see Human gates). This cycle delivers the intent, a quick capture, within the existing static web app: the driver takes a normal phone screenshot and sends it to FairFare in one or two taps, with no file picker.

Quick capture only helps if a full-phone screenshot is read correctly. A shared screenshot is the whole screen (status bar, notifications, banners), not a cropped card. So the gated goal is about reading those screenshots correctly.

**Gated metric (tools/gate.py, reports/cycle-1/goal.json):**

```
scan_accuracy_overall >= 0.99
```

measured by tools/run_eval.py on the eval set **including the new full-screen screenshot cases from R3**. Today it is 1.00 on the 60 cropped synthetic cases. With the R3 cases added and no parser fix, it is expected to drop below 0.99, so the gate fails unless R3 is done.

Caveat: judged on **synthetic** data only (no pilot cases exist). It proves the parser handles the noise patterns we invented, not real Uber screenshots.

**Must not regress (QA checks these, not gated):** manual_fallback_rate <= 0.15 on the original 60 cases; verdict_median_error and verdict_p90_error no worse than reports/cycle-1/eval_before.json (`run_eval.py --baseline` exits 0).

**Capture-speed target (acceptance criterion, QA verifies by hand, not gated):** on an Android phone (or emulator) with FairFare installed, it takes **at most 2 taps from the system screenshot preview to the verdict**: tap Share, tap FairFare. No file picker, no tap inside FairFare. The verdict appears within **8 seconds** of the tap on FairFare once Tesseract is cached (one earlier scan done). Note the timing on the device used. Offers are reported to stay on screen about 15 s, so this is tight, and this flow is for parked use only (see Safety).

## Requirements (priority order)

### R1. Share or paste a screenshot to FairFare (owner: builder)

The driver gets a screenshot into FairFare without the file picker.

- **Android share target.** app/manifest.webmanifest gets a `share_target` (method POST, enctype multipart/form-data, one `files` param accepting `image/*`, action inside the app scope, e.g. `./share-target`). app/sw.js handles that POST: it reads the image from the form data, keeps it in memory or a dedicated cache entry only until the page reads it, then redirects (303) to `./#check`. The Check screen picks up the shared image, runs the existing `scanImage` OCR and shows the verdict with no further tap. The image is deleted from the cache straight after it is read, success or failure.
- **Paste and drop (all platforms, including iPhone).** On the Check screen, pasting an image (paste event with an image in `clipboardData.files`/`items`) or dropping an image file runs the same OCR path. Pasted plain text keeps going to the existing text parser. If the browser supports `navigator.clipboard.read()`, a "Paste screenshot" button may use it; where it isn't supported or permission is refused, the button hides and nothing else breaks.
- The existing file-picker "Scan screenshot" button stays as the fallback.
- New UI strings go into en.json and all 25 other app/lang/*.json files together (tests/test_app_languages.py passes). Bump the service-worker cache name so installed copies update.

Acceptance criteria:
1. A pytest checks the manifest's `share_target` (POST, multipart, image/* files, action in scope) and that sw.js has a handler for that action that isn't blocked by the GET-only early return.
2. QA, on Android Chrome with the PWA installed (emulator is fine): screenshot a **mock offer card** (plain text, no Uber logo or branding, e.g. the app's DEMO text drawn as an image), tap Share, tap FairFare: the Check screen opens and shows the verdict with no other tap (the 2-tap target above).
3. QA, on desktop Chrome and on iPhone Safari if available: copy the mock card image, paste on the Check screen: the verdict appears. Drag-and-drop works on desktop.
4. After a shared scan, Cache Storage holds no copy of the image, and no network request carries image data. The only network requests are the existing Tesseract.js script and language-data downloads.
5. A non-image share, or an image with no offer on it, shows the existing "Couldn't read that screenshot" message. No crash.
6. `python -m pytest -q` passes.

### R2. One verdict word, matching SAFETY.md, shown before any numbers (owner: builder)

Decision: the app follows SAFETY.md and shows **ACCEPT / MARGINAL / DECLINE**. SAFETY.md is human-owned and it names the words. The engine already uses these codes, and CLAUDE.md and the docs use them too. Changing the safety rule's words to MAYBE/SKIP would be a safety-rule change, so it goes on the human gate list instead (plain words may be easier at a glance for drivers whose first language isn't English; Growth and the owner can test that).

- en.json: `v.MARGINAL` becomes "MARGINAL" and `v.DECLINE` becomes "DECLINE". In the other 25 languages, keep each translation but check it means "marginal / borderline" and "decline", not "maybe / skip". Fix any that drift, and list in the builder report any that a fluent speaker should review. Engine codes are unchanged, so tests/test_js_parity.py is unaffected.
- The verdict card shows **only the word and its colour** at first (plus the one-line sub text). The per-hour range, number tiles, "needs a fare of" line and reasons go behind a "Details (parked only)" disclosure, closed by default and closed again on each new verdict.
- Growth's draft message (reports/cycle-1/growth.md) can then name the verdict words. Growth updates its own draft; this spec doesn't edit it.

Acceptance criteria:
1. With the DEMO offer, the verdict area shows one of ACCEPT / MARGINAL / DECLINE (or CAN'T TELL) in English, with no £ figures visible until Details is opened.
2. No en.json string in the Check or History views says MAYBE or SKIP as a verdict.
3. tests/test_app_languages.py passes. The builder report lists the languages changed and any flagged for fluent review.

### R3. Read full-phone screenshots correctly (owner: scan-engineer)

A shared screenshot is the whole phone screen. The parser must pick the offer card's fare and times out of status-bar and notification noise, or refuse (null) rather than guess wrong.

- Add **at least 15** synthetic cases with `"kind": "fullscreen"`, ids from syn-0060 upward, **appended** to eval_set/synthetic.jsonl so the existing 60 cases stay byte-identical and the JS parity test covers the new ones. Generate them from tools/make_synthetic.py in a separate step after the existing loop, so the seeded rng for the first 60 is untouched. Noise to cover: status-bar clock and battery ("14:05", "87%", "4G"), a notification line that mentions minutes, a "Screenshot saved" toast, and in **at least 8 cases a stray £ amount** above or below the card (promo banner, earnings ticker, a message preview).
- Write the cases first and save an eval showing the drop, then change fairfare/parser.py and app/js/engine.js together so they stay identical.
- QA red-team adds a few full-screen cases of its own that scan-engineer hasn't seen, to check the fix isn't fitted to the cases.

Acceptance criteria:
1. `python tools/run_eval.py --save reports/cycle-1/eval.json` gives synthetic `scan_accuracy_overall >= 0.99` (the gated goal).
2. `run_eval.py --baseline reports/cycle-1/eval_before.json` reports no regression. manual_fallback_rate on the original 60 cases stays at 0.15 or lower.
3. tests/test_js_parity.py passes on all cases, the new ones included.
4. reports/cycle-1/scan.md shows the before and after numbers and says plainly that they are synthetic.

## Out of scope this cycle

- **Continuous screen recording or live scanning of the Uber app.** Not possible from a web app: getDisplayMedia isn't supported on Chrome Android or iOS Safari (research.md, item 1).
- **Split-screen mode.** Android split screen already works with any app, FairFare included, but without live capture FairFare can't see the Uber card in the other half. It also adds something to read while driving, and SAFETY.md allows only one word and colour, or audio, while moving. iPhone has no split screen.
- **A native Android app (MediaProjection) or Accessibility-service overlay.** Technically possible on Android, but Uber's UK driver terms ban "scraping" the Driver App and running automated programs, Uber says such tools break its terms, and Google Play restricts the Accessibility API. A driver's account (their income) could be at risk. That is a legal decision for the owner and a solicitor (human gate below), and it can't be built and shipped in one static-web-app cycle anyway.
- **Any automatic accept or decline.** FairFare never acts on offers (SAFETY.md). Not now, not in a native app.
- **Spoken (audio) verdict.** Allowed by SAFETY.md and a good fit with quick capture, but it needs its own safety design. Candidate for cycle 2.
- **Uploading screenshots, accounts, backend.** Images stay on the phone. Phase 2 backend isn't touched.
- **Changing the verdict model or targets.** verdict-modeler and backend-engineer have no requirement this cycle. Their only job is to keep the "must not regress" metrics.

## Safety and hands-free review (against SAFETY.md)

| Req | Rule | How it complies |
|---|---|---|
| R1 share/paste | "Never need to touch... while the vehicle is moving." | Taking and sharing a screenshot means handling the phone, so it is a **parked/stationary-only** flow. The app can't detect motion, so it never prompts or nags the driver to capture. The existing safety line ("Never type or tap while moving") stays visible on the Check screen. Driver rule: if an offer arrives while moving, don't capture it. The fewer taps the better: 2 taps and no picker means less time looking at the phone even when parked. Whether to tell drivers this rule outright (e.g. in onboarding) is a human gate. |
| R1 | "FairFare never accepts or declines offers." | FairFare only reads an image the driver chose to send it. It has no link to, control of or overlay on the Uber app. The driver goes back to Uber and decides. |
| R2 verdict word | "One glanceable word and colour (ACCEPT / MARGINAL / DECLINE)... No numbers to read." | Brings the app in line with the exact words in SAFETY.md, and hides numbers behind a closed "Details (parked only)" disclosure, because the app has to assume the vehicle is moving. Fixes an existing gap where numbers were shown first. |
| R2 | "Manual entry, settings and details only when parked." | Details are opened by choice and labelled parked only. "Type numbers" mode is unchanged (it is already manual entry, for parked use). |
| R3 parser | "If the app can't tell... assume it is [moving]"; no misleading verdict. | A wrong fare from screen noise would give a confident wrong word. R3 makes the parser refuse (CAN'T TELL) rather than guess when it isn't sure, so the one glanceable word stays trustworthy. No UI change. |

No requirement changes SAFETY.md.

## Human gates triggered

Added to reports/cycle-1/human_gates.md:
- Native Android app or Accessibility overlay for live capture: owner and solicitor decide, against Uber UK driver terms (scraping/automation clause) and Google Play policy. Nothing is built until then, and any version must never accept or decline offers.
- Manual screenshot-and-share (R1): owner and solicitor confirm that a driver taking their own screenshot of one offer and reading it on their own phone is acceptable under Uber UK terms, before it ships to drivers.
- Verdict words: the app now follows SAFETY.md (ACCEPT / MARGINAL / DECLINE). If the owner prefers plain words (e.g. MAYBE / SKIP), that is a SAFETY.md change needing owner sign-off and a decisions.md entry.
- Parked-only capture: owner confirms the in-app and onboarding wording that screenshots are taken only when parked, and that offers arriving mid-drive are let go.
- Privacy: shared screenshots can hold rider names, pickup places and other people's notifications. Privacy-compliance reviews on-device processing and immediate deletion, and the owner signs off before drivers use it.
