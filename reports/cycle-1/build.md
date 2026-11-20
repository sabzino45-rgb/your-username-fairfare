# Cycle 1 build report (Builder): R1 and R2

Branch: cycle-1. Nothing is committed: the Orchestrator handles git.

## What changed

| File | Change |
|---|---|
| app/manifest.webmanifest | Added `share_target`: action `./share-target` (relative, inside scope `./`), POST, multipart/form-data, one `files` param `image` accepting `image/*`, .png, .jpg, .jpeg, .webp. |
| app/sw.js | Cache name bumped `fairfare-v1` to `fairfare-v2`. A POST to `share-target` is handled **before** the GET-only early return: it reads `formData().getAll("image")`, clears any older hand-off, puts the image (or an empty "not an image" marker) into a dedicated `fairfare-share` cache under one key, and returns a 303 to `./#check`. A stray GET to `share-target` redirects to `./#check`. `activate` doesn't delete `fairfare-share` mid hand-off. |
| app/js/app.js | **R1:** `checkShared()` runs on start. It reads the hand-off entry once, then `caches.delete("fairfare-share")` in a `finally` (success or failure), and runs `scanImage()`. A document `paste` listener (Check route only) takes an image from `clipboardData.files`/`items` and runs `scanImage()`. Text-only pastes are not intercepted. `dragover`/`drop` do the same for image files, and a non-image drop shows "Couldn't read". There is an optional "Paste screenshot" button using `navigator.clipboard.read()`: it is hidden where that API is missing and hides itself if permission is refused. `scanImage()` now takes any Blob, switches to Scan mode and rejects non-images with the existing "Couldn't read that screenshot" message before loading Tesseract. `setMode` moved to module scope. **R2:** the verdict card shows the word, colour, sub-line and confidence. The per-hour range, five tiles, "needs a fare of" line and reasons sit inside `<details id="details">` "Details (parked only)", closed by default. It stays open only while the same offer and settings are re-rendered (e.g. typing). Any new verdict closes it. The tile money values are now wrapped in `ltr()` for RTL. |
| app/styles.css | Styles for the disclosure summary, and a dashed outline while dragging a file. |
| app/lang/*.json (all 26) | `v.MARGINAL` / `v.DECLINE` changed (table below). New keys in every file: `check.pasteShot`, `check.dropHint`, `v.details`. |
| tests/test_share_target.py (new) | 5 tests: manifest share_target shape and relative in-scope action; sw.js handles the POST before the GET-only return, uses `formData`, the manifest's field name and 303; cache bumped; SHARE_CACHE/SHARE_KEY names match between sw.js and app.js and the page deletes the cache; en verdict words are ACCEPT/MARGINAL/DECLINE with no MAYBE/SKIP in `v.*`/`check.*`/`history.*`; numbers come after `<details>` in the verdict markup. |

### Verdict words (R2)

Old values meant "maybe / skip" in every language, so all 26 were changed. MARGINAL is rendered as "borderline / doubtful". DECLINE is an imperative "refuse / decline", matching each language's existing imperative ACCEPT and its sub-lines ("depends on traffic", "misses your targets").

| Lang | MARGINAL | DECLINE | Fluent review? |
|---|---|---|---|
| en | MARGINAL | DECLINE | |
| es | DUDOSO | RECHAZAR | |
| fr | LIMITE | REFUSER | |
| pt | DUVIDOSO | RECUSAR | |
| ro | LA LIMITĂ | REFUZĂ | |
| pl | NA GRANICY | ODRZUĆ | |
| lt | ABEJOTINA | ATSISAKYK | yes |
| bg | ГРАНИЧНО | ОТКАЖИ | |
| ru | НА ГРАНИ | ОТКЛОНИТЬ | |
| uk | НА МЕЖІ | ВІДХИЛИТИ | |
| tr | SINIRDA | REDDET | |
| sq | NË KUFI | REFUZO | yes |
| ar | هامشي | ارفض | yes |
| fa | مرزی | رد (unchanged) | yes |
| ur | مشکوک | انکار کریں | yes |
| ps | شکمن | رد یې کړئ | yes |
| ckb | دوودڵ | ڕەتی بکەرەوە | yes |
| ku | LI SER SÎNOR | RED BIKE | yes |
| hi | संदिग्ध | मना करें | yes |
| bn | মাঝামাঝি | প্রত্যাখ্যান করুন | yes (long word at 58px) |
| pa | ਸ਼ੱਕੀ | ਇਨਕਾਰ ਕਰੋ | yes |
| gu | શંકાસ્પદ | ના પાડો | yes |
| ta | சந்தேகம் | மறுக்கவும் | yes |
| so | SHAKI LEH | DIID | yes |
| am | አጠራጣሪ | እምቢ በል | yes |
| ti | ኣጠራጣሪ | ኣይትቀበል | yes |

The 3 new strings in the 25 non-English files also need fluent review in the same languages. The Feedback question `fb.q1` still says "accept or skip" in English and its translations. It is not in the Check or History views, so I left it. Growth or Product can reword it.

## Tests run

- `python3 -m pytest -q`: **36 passed, 1 failed**. The failure is `tests/test_js_parity.py::test_js_engine_matches_python[synthetic_fullscreen.jsonl]`. That is the Scan Engineer's in-progress work (their new fullscreen set and their engine.js/parser.py changes), not a file I touched. Before their new file appeared, the full suite was 23/23 green with my changes. `tests/test_app_languages.py` and the new `tests/test_share_target.py` pass.
- `node --check` on app.js and sw.js: OK.
- Playwright (Chromium headless, `python3 -m http.server 8766` from app/, server stopped afterwards). **All 27 checks passed:**
  - Check screen loads with no JS errors. Console errors were only network ones: `data/events.json` 404 (live feed not built locally, pre-existing) and cdn.jsdelivr.net blocked (Tesseract).
  - The demo offer shows **MARGINAL**. Details is closed. The verdict's visible text has no £ (`"MARGINAL / Depends on traffic... High confidence / Details (parked only)"`). The range appears once Details is opened, stays open on a re-render of the same offer, and closes on a new verdict (£30 fare gives ACCEPT).
  - A plain-text paste into the textarea is not intercepted. An image paste (PNG File in a ClipboardEvent) is intercepted, switches to Scan and shows "Reading the screenshot…". Tesseract is blocked here, so it ends on "Couldn't read that screenshot. Type the numbers instead." with no crash. Image drop runs the same path. A non-image drop shows "Couldn't read".
  - **Share target through the real service worker:** a multipart POST of a mock card PNG to `./share-target` (form submit while the SW controls the page) lands on `/#check` and runs the scan path. Afterwards Cache Storage holds only `fairfare-v2`: no `fairfare-share` and no share entry. A non-image share (.txt) shows "Couldn't read" and also leaves no cache.
  - Arabic: `dir=rtl`, word هامشي, summary translated, 7 `bdi dir=ltr` number wrappers inside Details.
  - Network: the only non-GET requests were the two local share-target POSTs. The external hosts requested were fonts.googleapis.com, fonts.gstatic.com and cdn.jsdelivr.net. None carried image data.
- Test script and screenshots, outside the repo: /tmp/claude-0/-home-user/822f3609-d26f-5d56-bc0b-4c5c4ba5b5fd/scratchpad/pw_check.js, verdict-en.png, verdict-ar.png.

## Untested

- **Real OCR end to end:** Tesseract.js can't load from cdn.jsdelivr.net in this sandbox. Every scan path was checked only up to the Tesseract call and its error branch. No paste, drop or share was seen producing a verdict from pixels.
- **The Android share sheet itself:** the installed PWA appearing in Share, the 2-tap flow and the 8-second timing (spec R1 acceptance criteria 2 and 3). Only the SW's POST handler was exercised, via a form POST. QA needs a real device or an emulator.
- iPhone Safari paste. The real `navigator.clipboard.read()` permission prompt (the button only shows; its click was not exercised). Real OS drag from the desktop (synthetic DragEvents were used).
- Upgrade from an installed `fairfare-v1` copy to `v2`.

## Open risks

- **Leftover image if the page never opens:** if the share POST lands but the page never loads (app killed between the 303 and the page load), the image stays in `fairfare-share` until the next app start, which deletes it. Privacy-compliance should know.
- **Shared image while on another tab:** a share always opens `#check` and scans. That's intended, but a share arriving while the driver is moving is still a parked-only flow by rule only. The app can't detect motion (SAFETY.md, human gate already listed).
- The `<details>` element is a tap target, but it is optional and labelled "parked only". Nothing needs a tap to get the verdict.
- 22 languages have new verdict words that a fluent speaker hasn't reviewed (table above). Long words (bn "প্রত্যাখ্যান করুন") wrap at the 58px display size.
- One parity test is red because of the concurrent Scan Engineer work. Re-run the suite after their hand-off.

## Privacy fix (after the Privacy block): no Google Fonts

Privacy blocked the release because every page load sent the driver's IP and browser details to Google Fonts.

Changes:
- **app/index.html:** removed the two `preconnect` links (fonts.googleapis.com, fonts.gstatic.com) and the Google Fonts stylesheet link.
- **app/styles.css:** font tokens now use system fonts only:
  - display: "Arial Narrow", "Roboto Condensed", "Helvetica Neue Condensed", "Sans Narrow", system-ui, sans-serif
  - body: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif
  - mono: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace
  - Added `.wordmark, h1, .word, .level { font-stretch: condensed; }` after their `font` shorthands, because the shorthand resets the stretch.
- **app/sw.js:** cache bumped `fairfare-v2` to `fairfare-v3`.
- No other host was added. A grep of app/ finds no `googleapis`, `gstatic`, Barlow, Inter or JetBrains references.

Evidence:
- `python3 -m pytest -q`: **37 passed**. The Scan Engineer's parity test is green now too.
- Playwright (Chromium, 400×860, app/ served on port 8769, server stopped after). The script loaded #check, ran the demo, visited all 6 tabs and pasted an image to trigger the Tesseract load. It logged every request: 24 in all.
  - Hosts: `localhost:8769` and `cdn.jsdelivr.net` (Tesseract only).
  - **0 requests to fonts.googleapis.com or fonts.gstatic.com.**
- Console errors were only the known ones: `data/events.json` 404 (the live feed isn't built locally) and cdn.jsdelivr.net blocked (ERR_TUNNEL_CONNECTION_FAILED). No page errors.
- Computed style of the verdict word: the display stack with `font-stretch: 75%`. Body uses the system-ui stack. No horizontal page scroll at 400px.
- Screenshot: /tmp/claude-0/-home-user/822f3609-d26f-5d56-bc0b-4c5c4ba5b5fd/scratchpad/check-400px.png (outside the repo). It shows the MARGINAL card, Details closed, the safety line, the input card and the shift goal, with layout intact.
- Font look varies by device: Android has no Arial Narrow, so it falls back to Roboto with `font-stretch: condensed` (Roboto Condensed where the system has it). That is QA's to eyeball on a phone.
- Remaining third-party request: cdn.jsdelivr.net for Tesseract.js, only when a scan starts. It is the existing, documented exception (spec R1 acceptance criterion 4). Self-hosting it is a possible later privacy step.

## Attempt 2 (fixes for QA BLOCK, reports/cycle-1/qa.md)

UI items only. Parser items #1–3 and #8–12 belong to the Scan Engineer, and I didn't touch parser.py, engine.js or eval_set/.

| QA item | Fix (app/js/app.js unless noted) |
|---|---|
| **#4 H4: stale verdict** | `scanImage()` (paste, drop, file pick, "Paste screenshot" button, share) now clears the old offer before OCR starts. The card goes to a neutral state: `data-d="READING"`, grey, "—", "Reading the screenshot…", no word, colour, numbers or Details. A failed read (OCR error, no offer found, non-image) shows **CAN'T TELL** with "Couldn't read that screenshot…" inside the card at the top, never the previous verdict. |
| **#5 rapid pastes** | A request counter `scanSeq`: each scan takes a number, and a result is ignored unless it is still the latest. Typing, the demo button or leaving Scan mode also cancels a pending read. |
| **#6 numbers above the fold** | The "Read from the card: Fare shown £…" readout was moved out of the input card and into "Details (parked only)". For CAN'T TELL with partial text, a Details holding only the readout is shown, so a parked driver can see what was missing. Readout numbers are wrapped in `ltr()`. |
| **#7 word breaks mid-word** | `.word` in styles.css is now `white-space: nowrap; word-break: keep-all; overflow-wrap: normal` (and line-height 1). The new `fitWord()` scales the font down until the word fits on one line (floor 18px), and runs on every render and on resize. |
| **#13 huge paste** | `MAX_TEXT = 5000`: `maxlength` is set on the textarea, and both the textarea value and OCR text are sliced to 5000 before parsing. |
| **#15 Details across identical offers** | Each new offer (scan, demo click, paste into the textarea) increments `offerGen`. Details stays open only for the same generation **and** the same numbers. |

The shift-goal card's £ figures, which QA noted as low severity, are unchanged. That card is below the fold at 390×844 and is a parked planning tool.

**Tests:** 2 new pytest tests and 1 updated, in tests/test_share_target.py:
- the scan clears the verdict before OCR and drops stale results
- the readout and numbers sit inside Details
- Details is tied to the offer generation
- `MAX_TEXT` and `maxlength` are present
- `.word` uses nowrap with no `overflow-wrap: anywhere`

`python3 -m pytest -q`: **40 passed** (includes the Scan Engineer's new tests).

**Playwright:** Chromium, app/ served on port 8771, server stopped afterwards. Tesseract was stubbed by routing the jsdelivr URL to a fake `recognize()` with a set delay, text and failure, so the success and timing paths ran for the first time. All 16 checks passed:
- 390×844, QA's repro: a £30 text offer gives ACCEPT and Details is opened. Then an image is pasted and its read fails after 600 ms.
  - During the read: READING, "—", no Details, no £ or digits.
  - After the read fails: CAN'T TELL with "Couldn't read…", no Details.
- Rapid pastes (£40 at 800 ms, then £6 at 100 ms) end on DECLINE, the newest. Typing during a pending read also wins.
- A scanned demo gives MARGINAL with Details closed. The visible text of the verdict card, the safety line and the input card has **no £ and no digits**. The readout appears only inside Details.
- A new scan with identical numbers closes Details, and so does "Try a demo offer" pressed again.
- An 850 KB paste completes in 442 ms (maxlength is 5000).
- Word fit at **390×844 and 360×780**: all 26 languages × ACCEPT, MARGINAL, DECLINE and CAN'T TELL are on one line in every case. The check uses one line box, height ≤ line-height, and scrollWidth ≤ clientWidth.
- No page errors.

Screenshots (outside the repo), all in /tmp/claude-0/-home-user/822f3609-d26f-5d56-bc0b-4c5c4ba5b5fd/scratchpad/:
- a2-failed-read-390.png
- a2-scan-marginal-390.png
- a2-bn-360.png ("প্রত্যাখ্যান করুন" fitted on one line)
- a2-ar-360.png, a2-ru-360.png, a2-lt-360.png

Script: pw_attempt2.js in the same folder.

**Still untested / open:**
- Real Tesseract OCR: the stub stands in for the CDN, which is blocked in this sandbox.
- Real phone fonts: fitting is measured, so it should hold, but long words in bn, lt, ru and ku get smaller than the 58px English word, so they are less glanceable. That is a reason to review shorter words with fluent speakers.
- Real-device paste and share.
