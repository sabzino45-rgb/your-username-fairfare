# Spec

_Owned by product-spec. Rewritten each cycle._

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
