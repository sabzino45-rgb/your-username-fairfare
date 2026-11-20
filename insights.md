# Insights

_Owned by research. Evidence first; inference marked "(inference)"._

## What drivers told us
No interviews logged yet. research/ holds only its README. Nothing here yet about whether drivers want live screen capture; the owner's note is the only request so far.

## What the data shows
No pilot cases yet. eval_set/ holds only synthetic cases (reports/cycle-1/eval_before.json: pilot n_cases 0; synthetic 60). Synthetic numbers say nothing about real drivers.

## Uber UI / layout changes
None recorded from first-hand screenshots.
- GMB (UK union) reports Uber UK moving from a rider "fare" to a "trip payment" for drivers, with base, per-mile and per-minute rates unchanged; date not confirmed. https://www.gmb.org.uk/private-sector/taxi-and-private-hire-hub/uber-noticeboard
- No public report found of the Uber Driver app blocking screenshots or screen recording of offer cards. Not tested by us. (inference: if Uber ever sets a secure-window flag, every capture method returns a black frame.)

## Competitors
- **Mystro** (US): auto-accepts trips that meet driver criteria across platforms; ~$18.99/mo or $139.99/yr per a competitor's comparison page (unverified). Its founders said Uber sent cease-and-desist letters. https://solodrive.pro/compare/ , https://thehustle.co/news/the-third-party-apps-uber-and-lyft-are-trying-to-kill
- **Maxymo** (US, lists Uber among platforms): uses Android Accessibility Services; filters that auto-accept/decline; voice alerts; manual "Snapshot" entry showing per mile / per hour. Maxymo Pro $4.99 in-app purchase (App Store); $4.99/mo or $49.99/yr on a demo site. https://apps.apple.com/us/app/maxymo-the-gig-driver-app/id6478421495 , https://play.google.com/store/apps/details?id=com.tech.gm.pegasusdriver
- **GigU**: named with Mystro and Maxymo in Business Insider's report (Jul 2025, per URL) on apps that read the screen via accessibility features and overlay a widget. https://www.aol.com/rideshare-drivers-apps-help-them-093602749.html
- Category price band reported at about $5 to $19/month. https://thehustle.co/news/the-third-party-apps-uber-and-lyft-are-trying-to-kill
- **Gridwise** (US): earnings/mileage tracker that links work accounts; does not analyse offers live. Plus $14.99/mo or $107.99/yr (App Store). https://apps.apple.com/us/app/gridwise-gig-driver-assistant/id1215991382 , https://help.gridwise.io/hc/en-us/articles/360052645633
- **Solo** (US): earnings tracker; Basic $10, Pro $15, Pro Plus $20 per month per Gridwise's own comparison (competitor source). https://gridwise.io/blog/gridwise-vs-solo
- **Para**: reported as shut down. https://www.aol.com/rideshare-drivers-apps-help-them-093602749.html
- **UK**: Fare101 (planned Nov 2026 launch; Uber, Bolt, Freenow; says it will not accept or reject jobs; capture method not published). https://www.taxi-point.co.uk/post/fare101-taxi-and-private-hire-driver-job-assessment-app-planned-for-november-launch . "Driver Profit" web app (cost per mile, offer check; undated, method unknown). https://uk-driver-profit.replit.app/

## Open questions
- What do drivers actually decide on: per hour, per mile, or the gut-feel fare?
- Will they pay, and how much?
- Do South West drivers mostly use Android or iPhone? This decides whether any live-capture route is possible at all.
- Does the current Uber Driver app (UK) allow screen capture of the offer card? Needs a real device test.
- Has any UK Uber driver been deactivated for using an offer-reading app? No public report found.
- Does the offer card stay on screen long enough (reported ~15 s) for capture + OCR + a spoken verdict?

## Cycle 1: live screen capture (2026-11-20)
Full notes and sources: reports/cycle-1/research.md.
1. **Feasibility.** A web app/PWA cannot capture another app's screen on a phone: getDisplayMedia is unsupported on Chrome Android and iOS Safari (https://web-platform-dx.github.io/web-features-explorer/features/screen-capture/ ; May 2024 W3C reply: https://lists.w3.org/Archives/Public/public-webrtc-logs/2024May/0027.html). Android native can: MediaProjection with per-session user consent, a mediaProjection foreground service, a status-bar chip, auto-stop on screen lock (https://developer.android.com/media/grow/media-projection). Android split screen is possible; iPhone has no split screen (https://discussions.apple.com/thread/256191190). iOS needs a ReplayKit Broadcast Upload Extension capped at ~50 MB memory (https://github.com/twilio/video-quickstart-ios/blob/master/ReplayKitExample). Existing tools (Mystro, Maxymo, GigU) use Android Accessibility Services plus an overlay; Google Play limits accessibility-API use by non-accessibility apps and requires a declaration and disclosure (https://support.google.com/googleplay/android-developer/answer/10964491?hl=en).
2. **Competitors.** See Competitors above. US tools charge about $5 to $19/month; the ones that read offers live are Android accessibility-based and several auto-accept.
3. **Platform rules.** Uber spokesperson: using third-party tools "to bypass the system breaks our Community Guidelines and Terms of Service" (Business Insider via AOL). UK Uber B.V. driver terms (preview PDF, date unknown) prohibit "scraping" or improperly obtaining data from the Driver App and launching automated programs or scripts (https://s3.amazonaws.com/uber-regulatory-documents/country/united_kingdom/Uber+BV+Driver+Terms+-+UK+Preview.pdf). Lyft warned drivers of possible deactivation, then said it had not disabled any accounts. No public report found of a UK Uber deactivation for this. Needs human/legal review.
4. **Safety.** Highway Code rule 149: "You MUST NOT use a hand-held mobile phone, or similar device ... for any purpose when driving"; applies when stationary in traffic; widened in 2022 to standalone functions; hands-free "is also likely to distract your attention" (https://theorytest.org.uk/sections/techniques-and-advice-for-all-drivers-and-riders-rules-103-to-158/page/4 ; https://www.gov.uk/government/consultations/expanding-the-offence-of-using-a-hand-held-mobile-phone-while-driving-to-include-non-connected-mobile-application-actions). Penalty reported as 6 points and £200 (https://www.nimblefins.co.uk/mobile-phone-driving-6-points-200-fine). (inference) A split-screen view with numbers is something the driver reads while moving; our SAFETY.md already limits that to one word/colour or audio.
