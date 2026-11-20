STATUS: PASS

# Economics - cycle 1

_Economics agent, 2026-11-20. All inputs are placeholders. Nothing here is based on real users, real payments or real conversion data, because none exist._

## Verdict

PASS. Cycle 1 adds no per-scan cost and no paid fixed cost. Gross margin per user goes **up**, from £3.0544 to £3.2344 per month (86.4% to 91.5%) at the placeholder £4.99 price. It does not go negative or fall, so no decisions.md entry is needed.

## What changed this cycle and its cost effect

| Change | Per-scan cost | Fixed cost |
|---|---|---|
| Share-to-FairFare / paste / drop, OCR by Tesseract.js on the phone (build.md R1; app/js/app.js loads `tesseract.js@5.1.1` from cdn.jsdelivr.net) | £0. There is no cloud OCR path anywhere in app/js, so the placeholder "20% cloud OCR at £0.0015" no longer applies. | £0 (free public CDN, no SLA) |
| Shared image kept only until read, then deleted (spec R1, build.md) | £0 storage | none |
| Live events feed: GitHub Actions cron every 6 h + GitHub Pages + Ticketmaster Discovery API + GOV.UK bank holidays (.github/workflows/pages.yml) | none | £0 on free tiers. One shared feed for all users, so the cost does not grow with users. |
| No server, no LLM | £0 | none |

Modelled in reports/cycle-1/economics.json (only change: `on_device_ocr_share` 0.8 -> 1.0). economics.json itself is unchanged, including `price_per_month`.

```
                               base economics.json   cycle-1 model
cost_per_scan                  0.0003                0.0
variable_cost_per_user_month   0.18                  0.0
net_revenue_per_user_month     3.5344                3.5344
gross_margin_per_user_month    3.0544                3.2344
gross_margin_pct               0.8642                0.9151
break_even_scans_per_month     10781                 None (no per-scan cost)
```

Sensitivity to the one remaining cost, `fixed_cost_per_user_month` (cycle-1 model): £0 -> margin £3.53; £0.10 -> £3.43; £0.30 -> £3.23; £0.50 -> £3.03.

### Cost risks to watch (not costs today)
- **Free tiers can change or run out.** GitHub Pages and Actions are free for a public repo; if the repo is private, check the plan (Pages on a private repo and Actions minutes beyond the free allowance may cost money). Ticketmaster's free Discovery API has a daily call quota; check the current limit on the developer portal. At about 4 runs a day it should be far inside any quota, but this was not measured.
- **jsDelivr has no SLA.** If it is down, scanning fails (the app falls back to typing). Self-hosting the Tesseract files on GitHub Pages would cost £0 and remove the dependency; that is a build decision, not a cost one.
- **The driver pays the data and battery** for the first Tesseract download (script plus language data). Not a FairFare cost, but it matters for drivers on small data plans.
- **Real OCR was never run end to end** (build.md: Tesseract blocked in the sandbox). If on-device accuracy turns out too low and someone proposes cloud OCR or an LLM per scan, that would add a real per-scan cost and must come back here.

## Placeholder inputs that need real numbers

| Input | Now | Why it is a placeholder | How to get the real number |
|---|---|---|---|
| price_per_month | 4.99 | Never tested. Human gate. | Owner decision, informed by a real price test (see human_gates.md). |
| vat_rate | 0.1667 (VAT share of a VAT-inclusive price) | Applies only if FairFare is VAT-registered. | Owner/accountant: registration status and expected turnover vs. the threshold. |
| app_store_fee | 0.15 | FairFare is a web app on GitHub Pages, with no app store and no payment method yet. | Owner decides the payment channel. For direct web payment, use the payment provider's published UK card fee (a percentage plus a fixed fee per charge, which bites hard on a £4.99 charge). The tool cannot model a fixed per-charge fee yet. |
| ocr_cost_per_scan | 0.0015 | No cloud OCR exists. Irrelevant while on_device_ocr_share is 1.0. | Only if cloud OCR is proposed: the provider's price list. |
| on_device_ocr_share | 0.8 in base; 1.0 in cycle-1 model | The code has no cloud path, so 1.0 is correct today. | Owner may set economics.json to 1.0; I have not edited it beyond the cycle copy. |
| llm_cost_per_scan / storage_cost_per_scan | 0.0 | Correct for the current design. | Revisit if phase 2 (shared backend) stores data. |
| scans_per_user_month | 600 | Made up. No driver has used the app. | Day-7 check-ins: each driver's "Offers saved" count from their Owner view (growth.md section 1), scaled to a month. Irrelevant to cost today, as cost per scan is £0. |
| fixed_cost_per_user_month | 0.30 | Hosting is £0 today; real fixed costs (domain, payment provider monthly fees, phase-2 backend, support time) are unknown. | Owner lists actual monthly bills once any exist, divided by paying users. |

## Price comparison (information for the human only; no price change proposed)

Competitor prices from reports/cycle-1/research.md, section 2 (sources and quality as stated there; all in US dollars, all US products):

- Maxymo Pro: $4.99/month (App Store) or $49.99/year (demo site).
- Gridwise Plus: $14.99/month or $107.99/year (App Store). Earnings tracker, not an offer reader.
- Mystro: about $18.99/month or $139.99/year (competitor's comparison page, unverified).
- Solo: $10 / $15 / $20 per month tiers (from a competitor's comparison).
- The Hustle: these apps cost "about $5 to $19 a month".
- UK tools (Fare101, Driver Profit): no price published.

The placeholder £4.99 sits at the bottom of that range, around Maxymo's price (£4.99 is a little more than $4.99 at recent exchange rates). Caveats: the paid US tools mostly auto-accept or auto-decline via Accessibility Services, which FairFare will not do; Gridwise and Solo are trackers, not offer readers; none is UK-priced. **None of this says what South West drivers will pay.** No driver has been asked yet.

## The main risk: loud warning

**There is no retention, conversion or willingness-to-pay data at all.** Pilot drivers: 0. Survey answers: 0. Payments: 0. Price tests: 0 (research/ holds only README.md; growth.md section 1). The 91.5% margin is arithmetic on a made-up price for users who do not exist. Cost is not FairFare's problem today (£0 per scan); whether anyone pays is. Next cycle's decisions should rest on Growth's day-7 check-ins, not on these figures.

## Human gates added (reports/cycle-1/human_gates.md)
- Decide the payment channel (web direct vs. store), which sets the fee assumption.
- Optionally approve a real price-test design at the day-7 check-in (this would relax the existing "no price mentioned to pilot drivers" item, so it needs the owner's explicit choice).
The existing Growth/Pricing item (keep £4.99 as placeholder, mention no price) was not duplicated.
