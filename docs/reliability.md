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

Phase 1 runs one combined ticker/closed-1m stream. Silent streams are stale after
45 seconds and reconnect with jittered exponential backoff, capped at 60 seconds.
Connections rotate before the 24-hour provider limit. REST timeout is eight
seconds; responses are bounded to 4 MiB and socket messages to 64 KiB. Latest
prices flush every five seconds; closed-bar buffering is capped at 1,000 rows.
The default universe is 12 markets, configurable to at most 30. Funding/OI has
an independent five-minute schedule and at least 60-second failure backoff.
Spot observations older than 90 seconds are stale; funding/OI uses ten minutes.
Provider failure preserves the last successful observation.

Active hourly retention: 1m candles for 30 days, 5m for 180 days, 1h for two years,
daily candles permanently, funding/OI for one year, provider-run logs for 14 days.
Deletes are capped at 5,000 records per table/interval per run. Feature/signal
retention for 180 days arrives with those tables. Target database size is below
8 GB. Disk warnings at 70/80%
and protective ingestion action at 90% are later hardening work.

Planned backups: seven daily, four weekly, three monthly. Off-host storage and a
verified restore are required before production. No backup automation is claimed
in Phase 0.
