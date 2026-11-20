"""Unit economics: cost per scan and gross margin per user. Owned by the Economics agent.

Reads economics.json (inputs) and prints the figures to paste into unit-economics.md.
Price is an input only - changing it needs human sign-off (see CLAUDE.md gates).

Usage: python tools/economics.py [economics.json]
"""

from __future__ import annotations

import json
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")


def compute(c: dict) -> dict:
    per_scan = (c["ocr_cost_per_scan"] * (1 - c["on_device_ocr_share"])
                + c["llm_cost_per_scan"] + c["storage_cost_per_scan"])
    scans = c["scans_per_user_month"]
    variable = per_scan * scans
    net_price = c["price_per_month"] * (1 - c["vat_rate"]) * (1 - c["app_store_fee"])
    margin = net_price - variable - c["fixed_cost_per_user_month"]
    return {
        "cost_per_scan": round(per_scan, 5),
        "variable_cost_per_user_month": round(variable, 4),
        "net_revenue_per_user_month": round(net_price, 4),
        "gross_margin_per_user_month": round(margin, 4),
        "gross_margin_pct": round(margin / net_price, 4) if net_price else None,
        "break_even_scans_per_month": round((net_price - c["fixed_cost_per_user_month"]) / per_scan) if per_scan else None,
    }


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "economics.json")
    with open(path) as f:
        cfg = json.load(f)
    for k, v in compute(cfg["inputs"]).items():
        print(f"{k}: {v}")
