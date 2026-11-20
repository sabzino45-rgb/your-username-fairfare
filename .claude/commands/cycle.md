---
description: Run one FairFare improvement cycle (research -> spec -> build -> review -> gate)
argument-hint: [cycle number, default next]
---
Run FairFare improvement cycle $ARGUMENTS as the Orchestrator described in CLAUDE.md. If no number is given, use one more than the highest reports/cycle-* folder (start at 1).

1. **Setup**: create reports/cycle-N/. Read insights.md, decisions.md, spec.md and the previous cycle's reports. Run `python tools/run_eval.py --save reports/cycle-N/eval_before.json`.
2. **Research**: delegate to the `research` subagent to update insights.md.
3. **Spec**: delegate to `product-spec` to update spec.md and write reports/cycle-N/goal.json with ONE measurable goal. Check that the goal is tied to a real-world metric. If it isn't, send it back.
4. **Build**: delegate to `scan-engineer`, `verdict-modeler`, `builder` and `backend-engineer` for the requirements each one owns, in parallel where they don't touch the same files. Ask `growth` for its funnel and experiment plan in parallel.
5. **Measure**: run `python -m pytest -q` and `python tools/run_eval.py --save reports/cycle-N/eval.json --baseline reports/eval_baseline.json`.
6. **Review**: delegate to `qa-red-team`, `privacy-compliance`, `economics` and `ops-reliability` in parallel. Each writes its STATUS report. Any of them can block.
7. **Gate**: run `python tools/gate.py N`.
   - FAIL: log the specific failure in decisions.md, then loop back to step 4 with exactly that failure as the task. Stop after 3 attempts and ask the human.
   - HOLD: list the unticked human_gates.md items for the human, and stop.
   - PASS: if the eval ran on pilot data, copy reports/cycle-N/eval.json over reports/eval_baseline.json. Then tell the human it's ready for approval to ship to pilot drivers. Do not ship it yourself.
8. **Log**: append the cycle's decision, its reason and the key numbers to decisions.md.
9. **Office**: if the ArtifactData tool is available, update the agent office at https://claude.ai/artifact/6UKYXsG6JX1tWVexKTASUq:
   - first read the `notes` collection and treat each note with state "waiting" as owner input for this cycle; set it to "picked-up" when handed to an agent;
   - set `status/<agent-id>` for every agent that worked ({state: "done" | "blocked", task, updated});
   - add one `responses` document per agent report ({agent, kind: "report", cycle, at, title, body}), with the body a short plain summary of its report file;
   - add any new human gates to `gates` ({order, title, detail, state: "open"}).

End with a summary of no more than 10 lines: goal, result, numbers before and after, blockers, and what the human needs to do.
