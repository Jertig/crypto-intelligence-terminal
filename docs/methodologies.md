# Methodologies

Phase 0 contains no market indicator, scoring engine, backtest, wallet classifier,
AI interpretation, or probability forecast.

Future methodologies must document name and version, input series and timestamps,
formula, units, weights, edge cases, missing/stale input policy, and deterministic
tests. The UI must expose components and counter-evidence. Historical association
must not be presented as causation.

The provider-health contract is an operational model, not a trading signal.
Configuration absence is reported separately from the four observed health states
`HEALTHY`, `DEGRADED`, `STALE`, and `DOWN`.
