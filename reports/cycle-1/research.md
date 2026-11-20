# Cycle 1 research: live screen capture / split screen

_Research agent, 2026-11-20. Evidence is cited by URL; my own reasoning is marked "(inference)". No pilot drivers or real data exist yet, so nothing here comes from FairFare drivers._

**Owner's request (as interpreted):** while the Uber Driver app is open, FairFare reads offers automatically and quickly (side by side in split screen, continuously capturing the screen) instead of the driver taking and uploading screenshots.

**Method limits:** I used web search. Direct page fetches failed for www.gov.uk, developer.mozilla.org and techcrunch.com because this session's network allowlist blocks them, so some primary pages (MDN compatibility table, the GOV.UK Highway Code page, the TechCrunch article) are cited from search results and secondary copies, not read in full. developer.android.com was read directly.

---

## 1. Technical feasibility

### Web app / PWA (what FairFare is today)
- Screen capture from a web page uses `getDisplayMedia`. The Web Platform feature explorer lists it as unsupported on **Chrome Android** and **Safari on iOS**, and supported on desktop browsers. https://web-platform-dx.github.io/web-features-explorer/features/screen-capture/
- A W3C mailing-list thread says mobile Chrome and Firefox for Android define the API but "always reject with NotAllowedError". https://lists.w3.org/Archives/Public/public-webrtc/2019Nov/0038.html
- A May 2024 W3C reply says Chrome does not currently support screen sharing on Android. https://lists.w3.org/Archives/Public/public-webrtc-logs/2024May/0027.html
- Twilio's docs say mobile browsers do not support screen sharing and point to native SDKs. https://www.twilio.com/docs/video/screen-share-chrome
- I found no 2026 source showing that this has changed, and could not open MDN or chromestatus to check directly.
- **Conclusion from the evidence:** the current GitHub Pages web app cannot continuously capture the Uber Driver app on either platform. (inference) The existing screenshot → share/upload → on-device OCR flow is the only capture path open to a pure web app.

### Native Android
- **MediaProjection** (Android 5+) captures the device display or, from Android 14, a single app window, into a Surface/ImageReader that can be processed in real time. https://developer.android.com/media/grow/media-projection
  - "Your app must request user consent before each media projection session." A token can be used once; reuse throws `SecurityException` on Android 14+.
  - Apps targeting Android 14+ must run a foreground service of type `mediaProjection` (`FOREGROUND_SERVICE_MEDIA_PROJECTION` permission).
  - Android 15 QPR1+ shows "a status bar chip that is large and prominent" during capture, and "screen projection automatically stops when the device screen is locked."
  - (inference) So a driver would have to approve a system consent dialog at the start of every session, and again after each screen lock.
- **Accessibility Services**: this is how the existing offer-reading tools work. Business Insider (July 2025 per its URL, read via AOL syndication) reports these apps "can use a phone's accessibility features to read the screen and overlay a widget to guide drivers." https://www.aol.com/rideshare-drivers-apps-help-them-093602749.html . Maxymo's store listing says it uses Accessibility Services for "managing app interactions and automating certain tasks." https://play.google.com/store/apps/details?id=com.tech.gm.pegasusdriver
  - Google Play policy: only apps designed to help people with disabilities may set `isAccessibilityTool`; others must complete an accessibility declaration in Play Console and meet prominent disclosure and consent rules. "Deceptive and non-declared uses of these APIs may result in a suspension of your app and/or termination of your developer account." https://support.google.com/googleplay/android-developer/answer/10964491?hl=en
  - The Chinese-language version of the policy page lists automation tools among things that are not accessibility tools (per search summary). https://support.google.com/googleplay/android-developer/answer/10964491?hl=zh-Hans
- **Overlay ("display over other apps")**: `SYSTEM_ALERT_WINDOW` permission, granted by the user in Settings > Special access; from Android 8 the only allowed overlay window type is `TYPE_APPLICATION_OVERLAY`. Secondary sources only; I did not get the official Android reference page. https://commonsware.com/blog/2017/05/11/system_alert_window-updates.html , https://mas.owasp.org/MASTG/demos/android/MASVS-PLATFORM/MASTG-DEMO-0104/MASTG-DEMO-0104/
- **Split screen on Android** works for resizable apps (multi-window); the MediaProjection guide says to make capture apps resizable. https://developer.android.com/media/grow/media-projection

### iPhone
- **No split screen on iPhone**: Split View is iPad-only. https://discussions.apple.com/thread/256191190 , https://www.howtogeek.com/827718/can-you-split-screen-on-iphone/
- Capturing other apps needs a **ReplayKit Broadcast Upload Extension**; the in-app recorder cannot capture other apps. The extension has a memory cap of about 50 MB (since iOS 12.2 per Twilio's sample). https://github.com/twilio/video-quickstart-ios/blob/master/ReplayKitExample , https://www.zegocloud.com/docs/faq/ios-screen-sharing-crash , https://developer.apple.com/forums/thread/651367
- (inference) On-device OCR inside a 50 MB extension, kept running for a whole shift, is a hard engineering problem and needs a prototype before anyone commits to it. iOS also has no accessibility-overlay equivalent, so the Android competitor approach does not port.

### Will Uber's app even allow capture?
- I found no public report that the Uber Driver app blocks screenshots or recordings of offer cards. Not tested. (inference) If Uber marks the window as secure, every capture method (screenshot, MediaProjection, ReplayKit) gets a black frame. A device test on a current UK Uber Driver build is needed.

## 2. Competitors

| App | What it does with offers | How it captures | Price (source quality) |
|---|---|---|---|
| Mystro (US) | Auto-accepts trips meeting criteria; switches between Uber and Lyft | Screen reading / automation (BI via AOL; Hustle) | ~$18.99/mo or $139.99/yr (competitor's page, unverified) https://solodrive.pro/compare/ |
| Maxymo (US) | Filters that auto-accept/decline; voice alerts; manual "Snapshot" entry showing per mile and per hour | Android Accessibility Services | Maxymo Pro $4.99 (App Store) https://apps.apple.com/us/app/maxymo-the-gig-driver-app/id6478421495 ; $4.99/mo or $49.99/yr on a demo site https://thewebions.com/demos/maxymo/ |
| GigU | Named alongside Mystro and Maxymo as a screen-reading offer tool | Accessibility read + overlay (BI via AOL) | Not found |
| Para | Offer tool singled out by r/UberEatsDrivers as a "cheating app" | Not found | Reported shut down (BI via AOL) |
| Gridwise (US) | Earnings and mileage tracking, airport/event demand; not a live offer reader | Account linking ("Sync Automatically") https://help.gridwise.io/hc/en-us/articles/360052645633 | Plus $14.99/mo or $107.99/yr (App Store) https://apps.apple.com/us/app/gridwise-gig-driver-assistant/id1215991382 |
| Solo (US) | Earnings tracker | Not researched in depth | Basic $10, Pro $15, Pro Plus $20/mo (from Gridwise's comparison, a competitor) https://gridwise.io/blog/gridwise-vs-solo |
| Fare101 (UK, planned) | Fare value, distance, time for Uber, Bolt, Freenow; "will not accept or reject jobs" | Not published | Not published https://www.taxi-point.co.uk/post/fare101-taxi-and-private-hire-driver-job-assessment-app-planned-for-november-launch |
| Driver Profit (UK web app) | Cost per mile from car costs; checks ride offers | Not stated | Not stated https://uk-driver-profit.replit.app/ |

- The Hustle reports drivers get roughly 15 seconds to assess an offer and that these apps cost about $5 to $19 a month. https://thehustle.co/news/the-third-party-apps-uber-and-lyft-are-trying-to-kill
- A Play Store reviewer of Maxymo reported auto-decline stopped working and that it "doesn't do anything for Uber but show the amount after the trip" (single review). https://play.google.com/store/apps/details?id=com.tech.gm.pegasusdriver
- (inference) Every live offer reader I found is Android-only in practice and built on Accessibility Services; I found none using MediaProjection + OCR. A UK-focused, read-only (never auto-accepts) tool would sit closest to Fare101's stated position.

## 3. Platform rules (for human / legal review; no legal conclusions here)

- **Uber's stated position:** an Uber representative "declined to discuss specific apps but said that using third-party tools to bypass the system breaks our Community Guidelines and Terms of Service." (Business Insider via AOL) https://www.aol.com/rideshare-drivers-apps-help-them-093602749.html
- **Cease-and-desist:** Mystro's CEO said Uber sent letters accusing the company of violating its terms and interfering with driver relationships; founders said they were worried Uber "might sue us." Same source; also https://thehustle.co/news/the-third-party-apps-uber-and-lyft-are-trying-to-kill
- **UK Uber B.V. driver terms** (preview PDF; date not shown in what I could see) prohibit "'scraping' or otherwise improperly obtaining data from the Uber Services or Driver App", launching "automated programs or scripts" (spiders, crawlers, robots, bots), and to "reverse engineer, decompile, modify, or disassemble the Uber Services or Driver App." https://s3.amazonaws.com/uber-regulatory-documents/country/united_kingdom/Uber+BV+Driver+Terms+-+UK+Preview.pdf . The same language is in the 2015 agreement submitted to a UK parliamentary committee, which also gives Uber the right to deactivate or restrict access where terms are breached. https://www.parliament.uk/globalassets/documents/commons-committees/work-and-pensions/Written_Evidence/Uber-BV-Driver-Services-Agreement-20-10-2015.pdf . I could not confirm whether the current UK terms still use this wording.
- **UK Community Guidelines** prohibit attempts "to gain unauthorised access to our app and/or website ... or any server, computer or database connected to our app" (per search snippet). https://www.uber.com/gb/en/legal/general-community-guidelines/
- **Uber deactivation guidance** lists accepting requests without intending to complete them as a reason to lose access. https://www.uber.com/ke/en/drive/driver-app/deactivation-review
- **Lyft (contrast):** sent drivers messages that third-party apps "are unsafe and not allowed" and that accounts "may be at risk of deactivation"; Lyft later said it had not disabled any driver accounts for using them. https://therideshareguy.com/weekly-roundup-lyft-threatens-driver-deactivation-over-third-party-earnings-apps/
- **Deactivations:** I found no public report, in the UK or elsewhere, of an Uber driver deactivated specifically for using an offer-reading app. General deactivation reports exist (e.g. ACRE, 2025) but do not break out third-party apps. https://acrecampaigns.org/research_post/driven-out-by-ai/
- (inference) The terms quoted above talk about scraping and automated programs; whether reading the driver's own screen on the driver's own phone falls under them is exactly the question a solicitor must answer. Auto-accept is a separate, and from Uber's statements a more clearly opposed, behaviour; SAFETY.md already forbids FairFare from doing it.

## 4. Safety: UK law on phone use while driving

- **Highway Code rule 149** (wording via secondary copies; GOV.UK page blocked in this session): "You MUST exercise proper control of your vehicle at all times. You MUST NOT use a hand-held mobile phone, or similar device, capable of interactive communication (such as a tablet) for any purpose when driving or when supervising a learner driver." It also says you MUST NOT pick up and use the phone "while stationary in traffic", including at traffic lights or queuing. https://theorytest.org.uk/sections/techniques-and-advice-for-all-drivers-and-riders-rules-103-to-158/page/4 , https://www.safedrivingforlife.info/blog/cars/can-i-use-my-mobile-phone-traffic-lights/
- **2022 tightening:** the offence was widened from interactive communication (calls, texts) to standalone functions, covering all hand-held use "even when the interactive communication capability is turned off or unavailable." Exceptions include calling 999/112 in a genuine emergency when it is unsafe to stop, and contactless payment at a terminal. Sources differ on the commencement date (25 March vs 6 April 2022 are both cited). https://www.gov.uk/government/consultations/expanding-the-offence-of-using-a-hand-held-mobile-phone-while-driving-to-include-non-connected-mobile-application-actions , https://assets.publishing.service.gov.uk/media/62053d3cd3bf7f3148fe3ecc/explanatory-memorandum-to-the-revision-of-the-highway-code-rule-149-about-using-mobile-phones-while-driving.pdf , https://www.gbnews.com/lifestyle/cars/motorists-fines-highway-code-rule-mobile-phone
- **Hands-free / cradle:** allowed if the phone is not hand-held and does not block the view, but the Code warns "Using hands-free equipment is also likely to distract your attention from the road," and commentators describe tapping apps in a cradle as a legal "grey area". https://www.selectcarleasing.co.uk/news/article/using-mobile-phone-while-driving-cradle-mount-legal-rules , https://www.parkers.co.uk/car-advice/mobile-phones/new-law
- **Penalty:** reported as 6 penalty points and a £200 fine; up to £1,000 if it goes to court (sources differ). https://www.nimblefins.co.uk/mobile-phone-driving-6-points-200-fine , https://www.gbnews.com/lifestyle/cars/motorists-fines-highway-code-rule-mobile-phone
- (inference) Offers arrive while the car is often moving or queued. A split-screen view showing per-hour and per-mile numbers is something the driver would read while driving, which SAFETY.md already forbids. Automatic capture reduces handling (no screenshot, no tap) compared with today's flow, which is a safety argument in its favour, but only if the output while moving is the single word/colour or audio SAFETY.md allows. Whether glancing at a cradled phone is lawful is for a human to judge.

---

## Summary for the team
- **Feasible today in the web app:** no live capture on either platform.
- **Most promising feasible route (inference):** a native Android companion using MediaProjection (single-app capture of the Uber Driver app, on-device OCR, existing parser), with an audio and one-word verdict and no accept/decline action. It avoids the Accessibility API route that Google Play restricts and that the auto-accept competitors use. It still needs per-session consent and a device test to confirm Uber's app is capturable.
- **iPhone:** no split screen; ReplayKit extension with ~50 MB limit; feasibility unproven.
- **Biggest risk:** Uber says third-party tools that "bypass the system" break its Terms and Guidelines, and the UK driver terms ban scraping/automated data collection from the Driver App. A driver's account (their income) could be at risk. Needs a human/solicitor decision before any build reaches drivers.
- **Evidence gap:** no driver has asked for this yet except the owner; we don't know the Android/iPhone split of South West drivers.
