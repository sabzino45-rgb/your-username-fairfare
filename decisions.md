# Decision log

_Owned by the Orchestrator. Append only. Each entry has the date, the decision, the reason and the evidence._

## 2026-11-20 - Baseline (v0)
- Decision: set up the agent team, v0 parser and verdict model, synthetic seed eval set.
- Baseline (synthetic only): scan_accuracy 1.00, manual_fallback 0.15, verdict median error 0.082, p90 0.221, range coverage 0.94.
- Caveat: the synthetic data comes from the same assumptions as the model, so these numbers say nothing about real drivers. Pilot data is needed.
