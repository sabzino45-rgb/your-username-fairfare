# Growth - cycle 1

_Owner: growth agent. Date: 2026-11-20. Window for these experiments: 2026-11-20 to 2026-12-04 (2 weeks)._

## 0. What I read

- `research/` holds only `README.md`. No Owner view exports, no interview notes, no pilot feedback, no price tests.
- `insights.md`: no interviews, no pilot cases, competitors not researched. Open questions: what drivers decide on, and will they pay.
- `unit-economics.md` / `economics.json`: all inputs are placeholders. £4.99/month is a placeholder price, not a tested one. Price tests run: none.
- `app/js/app.js` (Owner view and feedback form) and `app/lang/en.json`: the Owner view reads only the phone it runs on (`owner.note`: "These figures come from this phone only").

Status: not launched. The public link is not live (GitHub Pages is not switched on yet).

## 1. Funnel (real numbers only)

| Stage | Number now | How it will be measured | Measurable in phase 1? |
|---|---|---|---|
| Drivers reached | **0** | Owner keeps a tally per channel: one line per post or per conversation (date, channel, town, how many drivers saw or heard it). For a group post, count "seen by" only if the group shows it; otherwise write "unknown". | Yes, by hand. |
| Opened the app | **0** (link not live) | No analytics exist, and the app keeps everything on the phone. Counted only as drivers who tell the owner they opened it (at the check-in, see below). A per-channel link such as `?src=wa-bristol` would not be counted either, because nothing records it. | Partly: self-report only. Real counts need phase 2 or an analytics tool, which is a privacy decision. |
| Checked an offer | **0** | Each driver's own Owner view shows "Offers saved" for their phone. At a check-in, with the driver's agreement, they read that number out or send a screenshot. | Yes, per driver, with the driver's help. Not automatic. |
| Came back within 7 days | **0** / unknown | Same check-in, 7 days after they start: "Offers saved" went up, or the driver says they used it on 2 or more different days. The app does not store a "days used" count, so this is self-report plus "Offers saved". | Partly. |
| Would pay | **0** survey answers | Feedback question q3 ("would you pay a few pounds a month?"). The answers are stored **only on the driver's phone**: the owner's Owner view shows only answers given on the owner's phone. So the owner must ask the driver to show their Owner view, or ask q1 to q3 out loud at the check-in and note the answers. | Yes, by hand. |
| Paid | **0** | No payment exists. Nothing to measure until the owner decides on a price and a way to take payment (human gate). | No. |

Sign-ups: **0**. Pilot drivers: **0**. Survey answers: **0**. Testimonials: **none** (and none will be written for drivers).

**The check-in is the only way to measure in phase 1.** Proposal: each pilot driver gets one short call or meeting, while parked, on day 7 (5 minutes). The owner notes: town, platform (q4), opened yes/no, the "Offers saved" number, used on 2 or more days yes/no, q1 to q3 answers, one sentence of feedback. The owner stores this as a redacted note in `research/` (first name or initials only, no phone numbers). How long to keep contact details is a privacy-compliance question; I have flagged it.

What can't be measured until phase 2: total opens, unique drivers, retention for drivers who skip the check-in, and survey answers from any phone the owner never sees.

## 2. Experiments (max 3) - goal: first 20 pilot drivers in the South West by 2026-12-04

"Pilot driver" means: agreed to try it, opened the app, and agreed to a day-7 check-in. Nothing below is approved: every public post, flyer or visit is a human gate.

Shared safety rule for all three: recruit only drivers who are **parked with the engine off**. Never approach a car in a moving queue, never ask anyone to open the link while driving, and the message says this too (SAFETY.md).

### E1. In-person at driver waiting areas (Bristol first)

- **What:** The owner spends 2 or 3 sessions of about 2 hours talking to parked drivers where they already wait, with a small card that has the link and a QR code. Show the app on the owner's phone; don't push. Places on public record:
  - Bristol Airport's driver **Waiting Zone**, about a mile from the terminal, with free parking, toilets and bins. It was set up in 2019 for app drivers waiting for airport jobs ([Taxi Point, 2019](https://www.taxi-point.co.uk/post/2019/09/25/bristol-airport-to-give-uber-drivers-their-own-waiting-area); [Taxi Point on the 2025 interchange changes](https://www.taxi-point.co.uk/post/bristol-airport-opens-new-transport-interchange-with-key-changes-for-taxi-drivers-picking-up-and-dro)). Airport land has its own rules ([Terminal Forecourt terms of use](https://www.bristolairport.co.uk/corporate/doing-business-with-us/terminal-forecourt-access/terminal-forecourt-area-terms-of-use/)). **Ask the airport for permission first.** Don't hand anything out without it.
  - Bristol Temple Meads. Uber says it is riders' most-requested Bristol destination ([Uber Bristol page](https://www.uber.com/global/en/cities/bristol/)). The station drop-off point holds only about 3 vehicles ([Network Rail](https://www.networkrail.co.uk/rail-travel/our-stations/bristol-temple-meads/)), so **don't recruit there**: drivers can't safely stop. Only talk to drivers parked legally nearby.
- **Target metric:** 12 pilot drivers out of about 40 conversations.
- **How measured:** The owner's tally (conversations, cards given, "yes, I'll try it" with a check-in booked). Then day-7 check-ins.
- **Expected effect:** This is the most likely way to get the first 10 to 12 drivers. Face to face builds trust, and the owner sees first use in person, which tells us whether onboarding works. The conversion rate is a guess, not data. Cost: the owner's time and printing.

### E2. Go through existing driver organisations rather than cold-posting

- **What:** Ask organisations that already represent or meet South West drivers whether they would pass on the message to members, or let the owner speak for 5 minutes. Ask; don't post. Organisations on public record:
  - **Bristol City Council Taxi Forum**: council officers plus trade representatives nominated by organisations, held regularly, some meetings virtual ([forum page](https://www.bristol.gov.uk/business/licences-and-permits/taxis-and-private-hire-licensing/taxi-forum); [Feb 2025 minutes](https://services.bristol.gov.uk/files/documents/9904-taxi-forum-february-2025-minutes/file)). The useful contacts are the trade reps, not the council. Ask the licensing team how to reach them, and never imply council endorsement.
  - **BCP Council Taxi Forum** (Bournemouth, Christchurch and Poole, which is the Dorset end of the region) ([forum page](https://bcpcouncil.gov.uk/business/licences-and-permits/taxis-and-private-hire-licences-drivers/taxi-forum)).
  - **App Drivers and Couriers Union (ADCU)**: a national union for app drivers that has organised in Bristol before ([about](https://adcu.org.uk/about-us); [Bristol 24/7 coverage](https://www.bristol247.com/news-and-features/news/companies-worth-billions-pounds-without-us-theyre-just-apps/)). I found no confirmed Bristol branch page.
  - **GMB**: recognised by Uber for UK drivers ([GMB Uber page](https://www.gmb.org.uk/uber)). I found no South West contact for drivers.
  - A **Bristol Private Hire Drivers Association** appears in older press ([Bristol 24/7](https://www.bristol247.com/news-and-features/news/angered-drivers-take-to-streets-against-uber/)). I found no current contact, so it may no longer be active.
  - Plymouth has held Taxi Trade Meetings in the past, with no evidence they still run ([Plymouth democracy portal document](https://democracy.plymouth.gov.uk/documents/s94460/Response%2081%20Table%20of%20responses%20Appendix%204.pdf)). Ask Plymouth licensing.
- **Target metric:** 2 organisations agree to share the message, giving 5 pilot drivers.
- **How measured:** The owner's tally of contacts made and replies. At the check-in, ask "where did you hear about FairFare?"
- **Expected effect:** Reach beyond Bristol (Dorset, and maybe Plymouth) without spamming groups. A message from a trusted rep gets past drivers' wariness of "earnings apps". Slow: organisations may take longer than 2 weeks to answer. Unions may have views on tools built around Uber's offer screen. **The Uber terms question (CLAUDE.md legal gate) should be settled before E2**, so we don't lose trust.

### E3. Language communities: one community, one language, one helper

- **What:** Pick one language community with an organisation on public record. Ask it to share the message in that language, and show that the app works in that language. Example on public record: Bristol's Somali community organisations, the **Bristol Somali Resource Centre**, 43 Ducie Road, Barton Hill ([Charity Commission](https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/4044605/what-who-how-where); [Voscur directory](https://voscur.org/vcse-directory/organisation/Bristol%20Somali%20Resource%20Centre)), and the **Bristol Somali Centre**, Fox Road, Easton ([Open Charities](https://opencharities.uk/ew/1129083)). I have **no evidence** of how many South West ride-hail drivers speak Somali or any other language. Before choosing a language, the owner should ask the E1 drivers which languages they and their colleagues prefer, and pick the most common answer. Check first that the app has that language (see `app/lang/`).
  - **Before use,** a fluent speaker must review the translated message and the app's text in that language. Machine translation errors would cost trust.
  - Driver WhatsApp and Facebook groups: I could not verify any South West group by name with public sources, so I list none. If E1 or E3 drivers invite the owner into a group, the owner posts **once**, follows the group's rules, and asks the admin first.
- **Target metric:** 3 pilot drivers who use the app in a language other than English.
- **How measured:** The check-in asks what language they use the app in (each saved feedback answer also records `lang`, visible on the driver's own Owner view).
- **Expected effect:** Tests whether the 26-language claim matters to real drivers, which is still unproven. Small numbers, but the learning value is high.

**Total target across E1 to E3: 20 pilot drivers.** If we get fewer than 8 by day 10, it is a reach or trust problem, not a feature problem. Next cycle should then talk to the drivers who said no, not build more.

## 3. Draft recruitment message (NOT posted: needs owner approval)

> **Looking for 20 drivers in the South West to try a free app**
>
> I'm building FairFare, a free phone web app for ride-hail drivers in Bristol, Bath, Exeter, Plymouth, Torbay, Cornwall, Dorset, Wiltshire, Gloucestershire and Somerset.
>
> You type in or scan an offer's details and it shows a rough take-home per hour, as a range, based on your own costs and targets. It also shows typical busy times and local events. It works in 26 languages. It is new and may get things wrong. That's why I need drivers to test it and tell me honestly.
>
> It's free to try. There's no account, and your data stays on your phone.
>
> Please only open it when you're parked, never while driving.
>
> If you'd try it for a week and have a 5-minute chat after, reply here or message me. Link: [LINK - not live yet]
>
> FairFare is independent and not connected to Uber, Bolt or any other company.

Notes on the draft: it makes no earnings claims and doesn't say it will "save you money". It names no verdict words, because the app (ACCEPT/MAYBE/SKIP) and CLAUDE.md/SAFETY.md (ACCEPT/MARGINAL/DECLINE) disagree; flagged for the Orchestrator. "Scan" should be cut if scanning isn't in the build that ships.

## 4. Risks and flags for other agents

- **Privacy-compliance:** the pilot tally and check-in notes collect personal data (name, contact). They need a lawful basis, a retention period and a short privacy line in the message. Survey screenshots may also show other data.
- **Legal (human):** Uber's terms on reading offer screens. Settle before E2 (unions and forums).
- **Orchestrator:** the verdict labels don't match between the app and SAFETY.md.
- **Measurement:** phase 1 has no automatic counting. Every funnel number this cycle depends on the owner's tally and the check-ins. Synthetic eval results say nothing about whether drivers will use or pay for FairFare.

## Sources

- https://www.taxi-point.co.uk/post/2019/09/25/bristol-airport-to-give-uber-drivers-their-own-waiting-area
- https://www.taxi-point.co.uk/post/bristol-airport-opens-new-transport-interchange-with-key-changes-for-taxi-drivers-picking-up-and-dro
- https://www.bristolairport.co.uk/corporate/doing-business-with-us/terminal-forecourt-access/terminal-forecourt-area-terms-of-use/
- https://www.uber.com/global/en/cities/bristol/
- https://www.networkrail.co.uk/rail-travel/our-stations/bristol-temple-meads/
- https://www.bristol.gov.uk/business/licences-and-permits/taxis-and-private-hire-licensing/taxi-forum
- https://services.bristol.gov.uk/files/documents/9904-taxi-forum-february-2025-minutes/file
- https://bcpcouncil.gov.uk/business/licences-and-permits/taxis-and-private-hire-licences-drivers/taxi-forum
- https://adcu.org.uk/about-us
- https://www.bristol247.com/news-and-features/news/companies-worth-billions-pounds-without-us-theyre-just-apps/
- https://www.gmb.org.uk/uber
- https://www.bristol247.com/news-and-features/news/angered-drivers-take-to-streets-against-uber/
- https://democracy.plymouth.gov.uk/documents/s94460/Response%2081%20Table%20of%20responses%20Appendix%204.pdf
- https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/4044605/what-who-how-where
- https://voscur.org/vcse-directory/organisation/Bristol%20Somali%20Resource%20Centre
- https://opencharities.uk/ew/1129083
