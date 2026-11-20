STATUS: PASS

# Ops & Reliability: cycle 1

Checked 2026-11-20, around 12:00 UTC. This is a report only. No code, settings or git state was changed.

## Status decision

The role's feed thresholds (older than 12 h is a problem, older than 24 h is a block) are about the feed that drivers are being served on the published site. Right now there is no published site and no published feed. Pages is not switched on, nothing has been merged to main, and no driver can reach the app. So no driver is being served stale data, and nothing is being released this cycle. Shipping to drivers is a human gate in any case. That means the freshness check **cannot be measured**. It has **not passed**. It is not a block on the cycle-1 branch, because there is no deployment for it to block.

The status is PASS because every check that can run on this cycle's work passed: CI, tests, offline load, languages, slow connection, and no JS errors. One condition is carried forward:

**Release precondition (added to the human gate "switch on GitHub Pages"):** before any driver is recruited or the link is shared, the first "Publish app" run after Pages is enabled must succeed. Ops must then confirm that the published `data/events.json` has `generated` under 12 hours old. If that check fails, or the published feed is older than 24 hours, the status becomes BLOCK.

## Health table

| Check | Result | Evidence |
|---|---|---|
| "Check FairFare" runs | PASS | `gh run list -L 10`: the last 9 Check runs all `success`. 7 on `cycle-1` (latest 2026-11-20T11:54:23Z, id 44731378496) and 2 on `main` (10:52, 10:58). |
| "Publish app" runs | FAIL (known owner action) | 2 runs, both `push` on `main`, both `failure` (05:43:53Z and 10:48:53Z, id 44722379364). `--log-failed`: `actions/configure-pages@v5` gave `Get Pages site failed ... Not Found`, so Pages is not enabled. The fetch step itself worked: `events=0 bank_holidays=8 notes=['ticketmaster_no_key']`. No `schedule` run is listed yet. |
| Published site reachable | NOT MEASURABLE | `curl https://sabzino45-rgb.github.io/your-username-fairfare/` gave `CONNECT tunnel failed, response 403`. The sandbox proxy blocks github.io. The site would not exist anyway, because the Pages deploy has never succeeded. |
| Feed freshness (`generated`) | NOT MEASURABLE (no published feed) | `/data/events.json` on Pages: blocked by the proxy, and never deployed. Locally, `app/data/` does not exist and the app gets a 404. Age is effectively unbounded. That would be a BLOCK for a live site, but there is no live site (see the status decision above). |
| Feed notes | `ticketmaster_no_key` (in the CI run) | No Ticketmaster key is set (`TICKETMASTER_API_KEY:` is empty in the log). For drivers this means 0 live concerts, sport or theatre events. Only the 8 GOV.UK bank holidays come through. The app shows "Live events aren't switched on yet. You can still add your own." (`demand.liveOff`), so it does not claim live events it doesn't have. `bank_holidays_failed` did not occur. |
| Unit tests | PASS | `python3 -m pytest -q`: **37 passed** in 0.19 s. The parity failure build.md mentions has been fixed. |
| Every language file loads | PASS | Playwright fetched all 26 `app/lang/*.json` files: each returned 200 and parsed. en has 202 keys and the others 200. The difference is `_name` and `_dir` (metadata). `test_app_languages.py` passes. |
| Console errors | PASS (expected 404 only) | Online load: the only errors are `404 data/events.json` (no feed built locally). No `pageerror` events. |
| Service worker registers | PASS | `navigator.serviceWorker.ready`: scope `http://localhost:8768/`, state `activated`, page controlled after reload. Cache `fairfare-v2` holds the full shell. |
| App shell offline | PASS | After one online load, `context.setOffline(true)` then reload renders the app (769 chars of text, input UI present). The only error is the cached 404 for events.json. Also passed on a fresh context with a single online load. |
| Slow phone connection | PASS (about 4.8 s to render) | No SW, cache disabled, 400 ms RTT and about 400 kbit/s: HTML at 455 ms, app rendered at 4.8 s. There is a serial module waterfall (app.js, then store/i18n/demand, then engine/southwest, then en.json, then events.json). No errors. |
| Share-target cache leftover | RISK CONFIRMED (on-device only) | A POST to `share-target` while the page doesn't consume it (fetch with `redirect:'manual'`, 3 of 3 runs) leaves `fairfare-share` holding the image (70-byte test PNG). It survives until the app next starts; then `takeSharedImage()` deletes it (`afterReload: false` in all runs). With the normal redirect flow, build.md saw nothing left. One extra run of mine using `redirect:'follow'` also showed no leftover. I couldn't explain that difference, but it is consistent with the documented design. |

Test scripts (outside the repo): `/tmp/claude-0/-home-user/822f3609-d26f-5d56-bc0b-4c5c4ba5b5fd/scratchpad/ops/ops_check.js`, `ops_check2.js`, `ops_check3.js` in the same folder. The server on port 8768 was stopped afterwards.

## Incidents

**None affecting drivers.** No driver can reach the app yet.

- **"Publish app" failed twice on main (05:43Z, 10:48Z).** Cause: GitHub Pages is not enabled in repo settings (`configure-pages` returns 404 Not Found). Driver impact: none, since there is no public app. Fix: an owner action (Settings → Pages → Source: GitHub Actions), then re-run "Publish app". This is already in human_gates.md. It is not a code fault: the fetch step ran cleanly.
- **No live events (`ticketmaster_no_key`).** Cause: the `TICKETMASTER_API_KEY` secret has not been added. Driver impact once published: the demand screen has bank holidays and the driver's own events only, and says so honestly. Fix: an owner action (add the free Ticketmaster Discovery key as a repo secret).

## Reliability findings (no action taken)

1. **The app never checks how old the feed is.** `app.js` shows "Updated {time}" when Ticketmaster is a source, but nothing warns when `generated` is over 12 or 24 hours old. Offline, the SW serves the last cached `events.json`, however old. Scheduled GitHub workflows also get disabled automatically after 60 days without repo activity. The feed could then go stale without anyone noticing.
2. **The SW caches error responses.** The fetch handler stores any GET response without checking `res.ok`, so the `404 data/events.json` sits in `fairfare-v2`. Offline, a language file never fetched before (for example `pl.json`) falls back to `index.html` with status 200 and content type `text/html`. `i18n.js` catches the JSON parse error and shows English, so nothing crashes. The picker still says Polski, though, while the text is English.
3. **A shared screenshot can stay on the phone** until the app is next opened (confirmed above). Neither `activate` nor any timer clears `fairfare-share`. The image can contain pickup places and rider names. Privacy-compliance should weigh this against the human gate on shared screenshots.
4. **Render waits for `events.json`.** `start()` awaits `loadLive()` before `render()`. On a slow or flaky signal, the Check screen waits for the feed even though the verdict doesn't need it. The 4.8 s was measured on localhost with a fast 404. A slow github.io response would add to it.
5. **Workflows use actions on Node 20.** The run log warns that Node 20 is deprecated and these actions are forced onto Node 24. This works today but should be bumped before it breaks.

## Top reliability risk

**The live feed will go stale without anyone noticing.** Freshness depends on a 6-hourly cron that has not run successfully even once. GitHub can disable it after inactivity, and it fails as long as Pages or the key are missing. The app shows whatever feed it last cached, with no age warning. A driver could plan around stale or missing event data and not know. Mitigation for the Backend agent to propose: an in-app warning when `generated` is over 12 h old, and a workflow step that fails loudly when the notes hold `*_failed`.

## Summary

STATUS: PASS for cycle 1. CI is green: the last 9 "Check FairFare" runs succeeded. Locally, 37/37 tests passed. The service worker registers, the app shell loads offline, all 26 language files load, there are no JS errors, and the app renders in about 4.8 s on a slow connection. "Publish app" failed twice because GitHub Pages isn't enabled, and the feed has `ticketmaster_no_key`. Both are known owner actions. The proxy blocked the published site. The feed freshness check can't be measured until the first publish. It doesn't block this cycle, but it becomes a BLOCK before any driver gets the link if `generated` is over 24 h old. Top risk: the feed going stale unnoticed, since the app has no age warning. A shared screenshot can stay in `fairfare-share` until the app is next opened.
