"""Release gate for one cycle. Used by the Orchestrator.

Checks, for reports/cycle-<N>/:
  1. goal.json exists with one measurable goal, e.g.
     {"metric": "verdict_median_error", "op": "<", "value": 0.15}
  2. eval.json meets the goal (on pilot data if any, else synthetic - flagged)
  3. qa.md, privacy.md, economics.md, ops.md each start with "STATUS: PASS" (any BLOCK fails)
  4. human_gates.md lists anything needing human sign-off; if any unchecked "- [ ]"
     items remain, the result is HOLD (waiting on a human), never PASS.

Exit code: 0 PASS (ready for human approval to ship), 1 FAIL, 2 HOLD.
Usage: python tools/gate.py 3
"""

from __future__ import annotations

import json
import operator
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
OPS = {"<": operator.lt, "<=": operator.le, ">": operator.gt, ">=": operator.ge}
REVIEWERS = ("qa.md", "privacy.md", "economics.md", "ops.md")


def status_of(path: str) -> str:
    if not os.path.exists(path):
        return "MISSING"
    with open(path) as f:
        first = f.readline().strip().upper()
    return first.removeprefix("STATUS:").strip() if first.startswith("STATUS:") else "UNSTATED"


def main(cycle: str) -> int:
    d = os.path.join(ROOT, "reports", f"cycle-{cycle}")
    failures, holds, notes = [], [], []

    try:
        with open(os.path.join(d, "goal.json")) as f:
            goal = json.load(f)
        with open(os.path.join(d, "eval.json")) as f:
            ev = json.load(f)
        side = ev["judged_on"]
        actual = ev[side].get(goal["metric"])
        if side == "synthetic":
            notes.append("goal judged on SYNTHETIC data only")
        if actual is None or not OPS[goal["op"]](actual, goal["value"]):
            failures.append(f"goal not met: {goal['metric']} = {actual}, needed {goal['op']} {goal['value']}")
        else:
            notes.append(f"goal met: {goal['metric']} = {actual} {goal['op']} {goal['value']}")
    except FileNotFoundError as e:
        failures.append(f"missing {os.path.basename(e.filename)}")

    for r in REVIEWERS:
        s = status_of(os.path.join(d, r))
        if s != "PASS":
            failures.append(f"{r}: {s}")

    hg = os.path.join(d, "human_gates.md")
    if os.path.exists(hg):
        with open(hg) as f:
            open_items = [l.strip() for l in f if l.strip().startswith("- [ ]")]
        holds += open_items

    for n in notes:
        print("note:", n)
    if failures:
        print("FAIL")
        for x in failures:
            print("  -", x)
        return 1
    if holds:
        print("HOLD - waiting on human sign-off:")
        for x in holds:
            print("  ", x)
        return 2
    print("PASS - ready for human approval to ship to pilot drivers.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
