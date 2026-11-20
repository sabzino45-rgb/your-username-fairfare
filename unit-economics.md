# Unit economics

_Owned by economics. Inputs in economics.json are placeholders until real costs are known. Last updated: cycle 1, 2026-11-20._

## Current figures

Cycle-1 model (reports/cycle-1/economics.json). The only change from economics.json is `on_device_ocr_share` 0.8 -> 1.0, because the cycle-1 app has no cloud OCR path: Tesseract.js runs on the phone (app/js/app.js), loaded from cdn.jsdelivr.net.

```
cost_per_scan: 0.0
variable_cost_per_user_month: 0.0
net_revenue_per_user_month: 3.5344
gross_margin_per_user_month: 3.2344
gross_margin_pct: 0.9151
break_even_scans_per_month: None   (no per-scan cost, so no scan count breaks even)
```

The base economics.json, still assuming 20% of scans use cloud OCR at £0.0015, gives cost_per_scan 0.0003, variable cost 0.18/user/month, gross margin 3.0544 (86.4%), break-even 10,781 scans/month.

These figures rest entirely on placeholders. The margin is only "revenue minus costs" and needs real paying users to mean anything.

## Cost structure (cycle 1)

| Cost | Per scan or fixed | Amount now | Notes |
|---|---|---|---|
| OCR | per scan | £0 | Tesseract.js on the phone. The driver's phone pays in battery and data (a one-off download of the script and language data, then cached). |
| LLM | per scan | £0 | None used. |
| Storage | per scan | £0 | Shared screenshot is deleted straight after reading; offers stay on the phone (store.js). |
| Hosting | fixed | £0 if the repo is public | GitHub Pages + GitHub Actions (pages.yml, cron every 6 h). Needs checking if the repo is private. |
| Events feed | fixed | £0 | Ticketmaster Discovery API (free key) + GOV.UK bank holidays. About 4 runs a day, one shared feed for all users, so it does not grow per user. |
| CDN | fixed | £0 | cdn.jsdelivr.net (free, no SLA). |
| Payment processing | per payment | not modelled | No payment exists yet. See below. |

Placeholder `fixed_cost_per_user_month` 0.30 is kept; there is no real figure for it.

## Price tests
None run yet. No conversion, retention or willingness-to-pay data exists (research/ holds only README.md; 0 pilot drivers). Price-test results go here only from real data in research/price_test*, with sample sizes.
