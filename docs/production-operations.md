# Production operations

Prepared for Ubuntu, 2 vCPU, 2 GB RAM and 40 GB disk. No VPS deployment has been
performed. Local Docker Desktop measurements and isolated HTTPS checks are not
VPS capacity measurements or verification of a public certificate.

## Four services

Production uses four prebuilt, digest-pinned images: web, worker, PostgreSQL 16 and
Caddy. Security rebuilds preserve upstream database/gateway behavior while updating
their binaries; see [dependency security](dependency-security.md). Only Caddy
publishes TCP 80/443. PostgreSQL, web, worker and the gateway's
loopback health listener have no public host ports. Caddy persists certificate
state. Fresh PostgreSQL initializes restricted `terminal_web` and
`terminal_worker` roles. An explicit administrator migration/grant task runs
before starting the application; the long-running worker has no administrator
URL or schema-creation privilege. Repeat initialize after every schema update.

Runtime memory caps: web 400 MiB, worker 300 MiB, PostgreSQL 500 MiB, Caddy
100 MiB; total 1,300 MiB, leaving approximately 748 MiB on a 2 GiB machine for the
OS and Docker. CPU caps total two cores. V8 old-space limits are 256/160 MiB for
web/worker. Application roots are read-only and non-root, with bounded temporary
filesystems and dropped capabilities. PostgreSQL has 20 connections, 128 MiB
shared buffers, 4 MiB work memory, 64 MiB maintenance memory and a 128 MiB
per-process temporary-file limit. Its 512 MiB WAL target is not a hard disk cap.
Pools remain two connections per application with original query/connect limits.
These bounds reduce pressure; they do not prove that every possible configuration
fits under sustained maximum load. Prepare images off the VPS.

## Personal access model

Caddy authenticates every HTTPS application, API, static asset and health
request with one operator identity and a bcrypt password hash. Generate a long
random password and cost 12–14 hash; cost 12 is used by the isolated test. The
browser's native HTTP authentication sends credentials over TLS. Authorization is
removed before forwarding to Next.js. No browser-side gate or public health bypass
exists. APP_ORIGIN is an exact validated HTTPS origin; analyst/research mutations
also require matching Origin and browser-facing Host, strict typed bodies and
existing per-process rate/concurrency bounds. Header/body/time bounds apply at
the gateway; only its container-loopback health listener bypasses authentication.

This is a shared personal terminal, not a multi-tenant identity system. It has no
MFA, per-user record ownership, fine-grained permissions or instant browser logout.
Changing the hash/recreating Caddy revokes old credentials. Caddy's bounded
authentication cache retains credentials in process memory to avoid hashing every
request; host/Docker administrators remain trusted. Protect SSH, restrict access
to the operator's IP/VPN where practical, and keep OS/images patched. CPU limits
and strong passwords do not provide denial-of-service protection. Database roles
are a second boundary, not protection from a compromised trusted Docker host.

The ignored environment file must be owner-readable only (0600 on Ubuntu).
Passwords are distinct, 32–128 URL-safe characters; no secret enters a build
argument, image layer, browser bundle or committed file. Runtime credentials are
scoped explicitly to each Compose service. Docker administrators can inspect
container environment variables; membership in the Docker group is root-equivalent.
The backup systemd user is therefore an administrative operator, not an untrusted
application account. Do not put trading credentials or private keys in this system.

## Storage protection

The existing worker samples PostgreSQL database size and the database/backup
filesystems once per minute. The singleton observation is bounded to 8 KiB.
70% filesystem use warns, 80% is urgent, and 90% pauses provider/feature/research
engines and blocks research writes. Database size warns at 6 GiB and protects at
8 GiB independently of filesystem headroom. Missing/invalid measurements protect
ingestion; observations older than two minutes or in the future block production
research writes. Heartbeats, read-only evidence and cleanup continue. Recovery
recreates engine instances after fresh safe measurements; last successful provider
observations age normally and are never relabeled as new evidence.

The filesystem values describe the mounted filesystem, not project-only use.
Docker Desktop typically reports its Linux VM disk and does not measure the
Windows host's 40 GB equivalent. On Ubuntu the mounts must share the intended
VPS storage. Recheck `df`, volume locations and backup placement before go-live.
A minute interval and in-flight bounded batches can overshoot a threshold; leave
headroom. Retention deletes reclaim reusable PostgreSQL pages, not necessarily
filesystem bytes. Do not automate VACUUM FULL or delete volumes to relieve pressure.
Investigate and provide capacity or an operator-planned maintenance window.

Hourly credential-independent maintenance invokes the existing bounded retention
functions even when ingestion is disabled/protected. The original engines retain
their idempotent pruning for continuity. Policies remain: 1m candles 30 days; 5m
180 days; 1h two years; daily bars permanent; funding/OI one year; ingestion logs
14 days; features/signals/narratives and token histories 180 days; wallet history
90 days/500 transactions per address with summaries; macro five years of period
dates and twelve changed versions per date; reports 90 days/max 50; notifications
30 days/latest 1,000. Other research records have count/payload bounds and explicit
operator deletion. No unbounded application log file is written.

Docker json-file logs rotate at three 10 MiB files per service (about 120 MiB
aggregate), with ordinary runtime overhead. Do not enable credential/debug tracing.
Set a bounded journald policy (for example SystemMaxUse=100M) for the host backup
timer. Never prune unrelated containers, volumes or images automatically.

## Backup automation

`node infra/ops/terminal.mjs backup` runs a consistent custom-format pg_dump through
the internal PostgreSQL container. It writes an owner-only temporary archive,
enforces an 8 GiB archive budget and reserves 10% of filesystem capacity, then
atomically publishes the completed dump and SHA-256 sidecar. A lock rejects overlap;
dump/restore processes have a 120-second container deadline. Recognized abandoned
partials older than one day are cleaned under the lock. Only recognized project
archive names are pruned, after a successful new dump. Seven latest daily, four
latest Monday-based weekly and three monthly buckets select the newest archive
in each bucket; overlapping selections share one file. Calendar gaps stay gaps.

A budget failure preserves the last successful archive and records failure. The
policy may retain fewer than fourteen distinct files due to overlap or a small
history. A large database may require moving verified archives off-host before
the next dump fits; this budget does not promise fourteen maximum-size dumps.
Never erase the last good backup to make a failed run green. A stale lock requires
the operator to confirm that no backup is running before removing only that lock.
Backup status is unavailable without a completed dump, and stale/failed after
36 hours or an error. A dump digest does not prove disaster recovery.

Install Node 24, Git and the Docker CLI on the operations host. Copy the supplied
`infra/backup/terminal-backup.service` and `.timer` to systemd, adjust the project
directory/user to the secured checkout, and enable the timer. The timer runs daily
at 02:30 UTC with a short jitter and bounded execution. Its status must be checked;
no timer has been installed on the user's VPS by this work.

QA backups/status/locks are isolated under `data/operations-qa`; production uses
`data/operations`. The isolated verifier never prunes production archives or
publishes QA success into production status. Its worker uses the separate QA
database volume and operations bind mount, both verified in the container gate.

## Monitoring and response

Authenticated `/health` separates liveness from DB/worker status;
`/health?ready=1` returns 503 when dependencies are not ready. `/api/operations`
and Data Status expose bounded storage and backup observations. Provider health
and failure codes remain independent; a missing key does not establish a remote
outage. Worker heartbeats run every five seconds and expire after 30 seconds.
The original eight-second worker shutdown and ten-second Compose grace remain.
Systemd's failed timer, stale backup status, protective/unknown storage, missing
worker heartbeat and provider degradation need operator attention. In-app alerts
require a running evaluator/browser; they are not an off-site pager.

At warning, review relation sizes, retained row counts, log rotation, archive use
and image/cache ownership. At urgent, copy and verify archives off-host, address
unexpected growth and avoid building images on the VPS. At protection, investigate
before resuming; do not falsify the status record or relax limits. Backups on the
same disk are not disaster recovery. Follow [recovery](disaster-recovery.md).

Primary references: [Caddy authentication](https://caddyserver.com/docs/caddyfile/directives/basic_auth),
[Caddy server limits](https://caddyserver.com/docs/caddyfile/options),
[Compose services](https://docs.docker.com/reference/compose-file/services/),
[PostgreSQL pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html).
