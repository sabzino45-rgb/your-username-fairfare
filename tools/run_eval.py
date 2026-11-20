"""Regression eval over eval_set/*.jsonl. Shared by Scan Engineer, Verdict Modeler, QA, Orchestrator.

Reports:
  - scan field accuracy (per field and overall) and manual-fallback rate
  - verdict error on take-home per hour: median and 90th percentile
  - range coverage: share of cases where the real outcome fell inside [low, high]
Real (pilot) and synthetic cases are reported separately; goals are judged on
pilot data when there is any, otherwise on synthetic (flagged as such).

Usage:
  python tools/run_eval.py                    # print report
  python tools/run_eval.py --save reports/eval_latest.json
  python tools/run_eval.py --baseline reports/eval_baseline.json   # exit 1 if median or p90 got worse
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import statistics
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fairfare import DriverProfile, estimate, parse_offer_text  # noqa: E402
from fairfare.parser import REQUIRED  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
TOLERANCE = {"fare": 0.01, "pickup_min": 1.0, "pickup_miles": 0.15, "trip_min": 1.0, "trip_miles": 0.15}


def load_cases(pattern: str) -> list[dict]:
    cases = []
    for path in sorted(glob.glob(pattern)):
        with open(path) as f:
            cases += [json.loads(l) for l in f if l.strip()]
    return cases


def pct(values: list[float], q: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def field_ok(name: str, got, want) -> bool:
    if want is None:
        return got is None  # correctly refused to guess
    return got is not None and abs(got - want) <= TOLERANCE[name]


def evaluate(cases: list[dict]) -> dict:
    field_hits = {f: 0 for f in REQUIRED}
    errors, covered, fallback, details = [], 0, 0, []
    for c in cases:
        offer = parse_offer_text(c["ocr_text"])
        for f in REQUIRED:
            field_hits[f] += field_ok(f, getattr(offer, f), c["expected_fields"].get(f))
        if offer.missing:
            fallback += 1
        v = estimate(offer, DriverProfile(**c.get("profile", {})))
        out = c.get("outcome")
        row = {"id": c["id"], "decision": v.decision, "confidence": v.confidence, "missing": offer.missing}
        if out and v.per_hour_mid is not None and out["minutes"] > 0:
            actual = out["take_home"] / (out["minutes"] / 60)
            err = abs(v.per_hour_mid - actual) / max(abs(actual), 1e-9)
            errors.append(err)
            covered += v.per_hour_low <= actual <= v.per_hour_high
            row.update(actual_per_hour=round(actual, 2), est_mid=v.per_hour_mid, rel_error=round(err, 4))
        details.append(row)

    n = len(cases)
    return {
        "n_cases": n,
        "scan_accuracy": {f: round(h / n, 4) for f, h in field_hits.items()} if n else {},
        "scan_accuracy_overall": round(sum(field_hits.values()) / (n * len(REQUIRED)), 4) if n else None,
        "manual_fallback_rate": round(fallback / n, 4) if n else None,
        "verdict_n_scored": len(errors),
        "verdict_median_error": round(statistics.median(errors), 4) if errors else None,
        "verdict_p90_error": round(pct(errors, 0.9), 4) if errors else None,
        "range_coverage": round(covered / len(errors), 4) if errors else None,
        "cases": details,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cases", default=os.path.join(ROOT, "eval_set", "*.jsonl"))
    ap.add_argument("--save")
    ap.add_argument("--baseline")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    cases = load_cases(args.cases)
    report = {
        "pilot": evaluate([c for c in cases if c.get("origin") != "synthetic"]),
        "synthetic": evaluate([c for c in cases if c.get("origin") == "synthetic"]),
    }
    report["judged_on"] = "pilot" if report["pilot"]["n_cases"] else "synthetic"

    for name in ("pilot", "synthetic"):
        r = report[name]
        print(f"[{name}] cases={r['n_cases']} scan_acc={r['scan_accuracy_overall']} "
              f"fallback={r['manual_fallback_rate']} median_err={r['verdict_median_error']} "
              f"p90_err={r['verdict_p90_error']} coverage={r['range_coverage']}")
        if args.verbose:
            for row in r["cases"]:
                print("   ", row)
    if report["judged_on"] == "synthetic":
        print("WARNING: no pilot cases yet - metrics come from synthetic data and prove nothing about real drivers.")

    if args.save:
        os.makedirs(os.path.dirname(args.save) or ".", exist_ok=True)
        with open(args.save, "w") as f:
            json.dump(report, f, indent=2)

    if args.baseline and os.path.exists(args.baseline):
        with open(args.baseline) as f:
            base = json.load(f)
        key = report["judged_on"]
        worse = []
        for m in ("verdict_median_error", "verdict_p90_error"):
            old, new = base[key].get(m), report[key].get(m)
            if old is not None and new is not None and new > old + 1e-9:
                worse.append(f"{m}: {old} -> {new}")
        if (base[key].get("scan_accuracy_overall") or 0) > (report[key].get("scan_accuracy_overall") or 0) + 1e-9:
            worse.append(f"scan_accuracy_overall: {base[key]['scan_accuracy_overall']} -> {report[key]['scan_accuracy_overall']}")
        if worse:
            print("REGRESSION vs baseline:\n  " + "\n  ".join(worse))
            return 1
        print("No regression vs baseline.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
