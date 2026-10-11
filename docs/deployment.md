# Production deployment

`compose.production.yaml` runs prebuilt images with authenticated HTTPS,
restricted database roles, storage protection and persistent volumes.
`compose.yaml` is the loopback development stack; see
[local setup](development.md) for development and integration tests.

The supplied host-service examples use Ubuntu and systemd. The
[reference profile](reference-profile.md) records the default resource budget and
local measurements; it is not a universal hardware requirement or a VPS benchmark.
Review [operations](operations.md) and [recovery](disaster-recovery.md) before deployment.

## Prerequisites

Use Docker Engine with Compose >=2.24.4, Node.js 24 and Git for host operations.
Create a trusted operations account, secure SSH/firewall access and bound host
journal storage. Publish TCP 80/443 through Caddy; keep PostgreSQL internal.
Point the chosen domain's DNS to the host before requesting public HTTPS.

Verify host time synchronization and compare provider clocks. Market quotes allow
five seconds of skew; analyst facts exclude future observations. Preserve source
timestamps instead of clamping them to the collection clock.

Build the four images on a development machine or CI:

```sh
docker compose build worker
docker compose build web
docker compose build postgres
docker compose build caddy
```

Inspect their immutable image IDs, then transfer a verified `docker save` archive
or publish digest-pinned registry images. Load the images on the runtime host and
keep the previous release for rollback. Avoid accumulating build caches on a
small host. Base-image updates need dependency and container/recovery checks.

## Configuration

Copy `.env.example` to ignored `.env.production` and set file mode 0600.
Configure:

| Setting                                                                  | Value                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| `POSTGRES_PASSWORD`, `POSTGRES_WEB_PASSWORD`, `POSTGRES_WORKER_PASSWORD` | Distinct 32–128-character URL-safe random passwords |
| `WEB_IMAGE`, `WORKER_IMAGE`, `POSTGRES_IMAGE`, `CADDY_IMAGE`             | Immutable sha256 image IDs or registry digests      |
| `APP_ORIGIN`                                                             | Exact public HTTPS origin                           |
| `ACCESS_USER`, `ACCESS_HASH`                                             | Gateway identity and bcrypt hash, cost 12–14        |

Generate the gateway hash with `caddy hash-password` using stdin, not a plaintext
command-line argument. Quote the hash in the environment file to preserve dollar
signs. Leave optional provider settings blank when unused; model calls require
explicit enablement, key and model. Each service receives only its needed values.

## Start and update

```sh
node infra/ops/terminal.mjs validate
node infra/ops/terminal.mjs initialize
node infra/ops/terminal.mjs start
node infra/ops/terminal.mjs status
node infra/ops/terminal.mjs backup
node infra/ops/terminal.mjs verify-restore
```

`initialize` starts PostgreSQL, runs administrator migrations in a one-off worker
container and reapplies runtime grants. Repeat it before starting a schema update.
The permanent worker does not have migration privileges. Review a backup and
forward-schema compatibility before rolling images back; do not rewrite migrations.

Install the [backup service and timer](operations.md#backup-automation) after
adjusting their account/path and testing commands as that account. Configure an
independent off-host destination and verify a clean-host restore.

Public TLS issuance, firewall behavior, sustained host capacity, timer delivery
and off-host recovery still require deployment validation. Local container tests
have passed; no live VPS deployment or off-host recovery is claimed.

## Isolated container verification

Build the four images above, then run:

```sh
node infra/ops/verify-production.mjs
```

The verifier creates/reuses `terminal-production-qa` with separate database and
gateway volumes, generated ignored credentials and HTTPS on localhost:18443.
Backups/status/locks use `data/operations-qa`; production uses `data/operations`.
The QA override publishes only loopback ports and uses Caddy's internal CA.
Only the test client accepts that local certificate.

Checks cover authentication, Origin rules, database permissions, test-only storage
protection, record persistence, shutdown/outage/recovery and a real dump/restore.
Live ingestion and model calls are disabled. Results are written to
`.work/production-verification.json`. Persistent volumes are retained. Do not
use the QA override for a public deployment.
