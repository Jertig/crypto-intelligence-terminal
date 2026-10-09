# Reliability

Phase 0 establishes process liveness, database readiness, a worker heartbeat,
bounded database pools, explicit provider configuration state, graceful shutdown,
container restart policies, health checks, memory limits, and rotating Docker logs.

`GET /health` reports liveness and dependency states. `GET /health?ready=1`
returns 503 until both PostgreSQL and a worker heartbeat are ready. Neither route
claims market providers are connected. Invalid environment values return a
sanitized configuration error. Database errors are reported as `UNAVAILABLE`.

The worker migrates before boot in Compose, waits for PostgreSQL health, upserts
one heartbeat every five seconds without overlapping runs, and removes its own
instance on SIGTERM/SIGINT. A heartbeat older than 30 seconds is stale. Database
connections are bounded to two per application, with connect/query time limits.
No raw credentials or database errors are returned to clients.

There are no ingestion schedules, retries, live provider probes, or retention jobs
yet. Subsequent phases must introduce them with deterministic tests.

Planned retention: 1m candles for 30 days, 5m for 180 days, 1h for two years,
daily candles permanently, funding/OI for one year, features/signals for 180 days,
and logs for 14 days. Target database size is below 8 GB. Disk warnings at 70/80%
and protective ingestion action at 90% are later hardening work.

Planned backups: seven daily, four weekly, three monthly. Off-host storage and a
verified restore are required before production. No backup automation is claimed
in Phase 0.
