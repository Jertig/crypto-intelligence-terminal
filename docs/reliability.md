# Reliability

Phase 0 establishes process liveness, database readiness, a worker heartbeat,
bounded database pools, explicit provider configuration state, graceful shutdown,
container restart policies, health checks, memory limits, and rotating Docker logs.

There are no ingestion schedules, retries, live provider probes, or retention jobs
yet. Subsequent phases must introduce them with deterministic tests.

Planned retention: 1m candles for 30 days, 5m for 180 days, 1h for two years,
daily candles permanently, funding/OI for one year, features/signals for 180 days,
and logs for 14 days. Target database size is below 8 GB. Disk warnings at 70/80%
and protective ingestion action at 90% are later hardening work.

Planned backups: seven daily, four weekly, three monthly. Off-host storage and a
verified restore are required before production. No backup automation is claimed
in Phase 0.
