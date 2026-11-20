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
