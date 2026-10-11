# Reliability

`GET /health` reports process liveness and dependency states.
`GET /health?ready=1` returns 503 until PostgreSQL and a worker heartbeat are
ready. Provider connectivity is reported separately. Configuration and database
errors are sanitized before reaching clients.

## Process lifecycle

The worker writes a heartbeat every five seconds without overlapping runs.
A heartbeat older than 30 seconds is stale. Application database pools allow two
connections each, with connection and query time limits.

Shutdown closes the health listener, aborts provider loops and cancels ingestion
connections before awaiting tasks. Unfinished transactions roll back. A separate
cleanup connection removes only the stopping instance's heartbeat; failed cleanup
is logged and the heartbeat ages out. The process deadline is eight seconds,
within Compose's ten-second grace period.

Development Compose runs migrations before worker startup. Production runs
administrator migrations explicitly and gives the long-running services limited
database roles. See [deployment](deployment.md).

## Ingestion and freshness

One combined Binance connection carries tickers and closed one-minute candles.
Silent streams become stale after 45 seconds and reconnect with jittered
exponential backoff capped at 60 seconds. Connections rotate before the
provider's 24-hour limit. REST requests time out after eight seconds and allow
at most 4 MiB per response; socket messages allow 64 KiB.

Latest prices flush every five seconds. The closed-bar buffer holds at most
1,000 rows. The default universe has twelve markets, configurable to thirty.
Funding and open interest use an independent five-minute schedule with at least
sixty seconds between failed attempts.

Spot observations older than ninety seconds are stale; funding and open interest
use ten minutes. Quote validation permits up to five seconds of provider clock
skew; the analyst excludes future evidence. Failed requests preserve the last
successful observation. [Data provenance](data-provenance.md) explains how
source timestamps and collection time remain distinct.

## Retention and recovery

Hourly cleanup retains minute candles for thirty days, five-minute candles for
180 days, hourly candles for two years and daily candles permanently. Funding
and open interest retain one year, provider-run logs fourteen days and derived
features/signals 180 days. Cleanup deletes at most 5,000 records per
table/interval per run and continues without provider credentials.

Filesystem and database thresholds protect ingestion while cleanup remains
active. Daily PostgreSQL backups rotate within an archive budget, and restore
verification uses a disposable database. See [operations](operations.md) for
thresholds, retention policies, monitoring and backup commands;
[disaster recovery](disaster-recovery.md) covers restoring service. Off-host
backup delivery and clean-host recovery still need deployment-specific verification.
