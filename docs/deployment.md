# Deployment

Production hardening is prepared and locally verified separately from deployment.
No VPS deployment has been authorized or performed. `compose.yaml` remains the
loopback development preview; `compose.production.yaml` provides secured HTTPS,
restricted roles, storage protection and prebuilt images. Read the
[operations/security model](production-operations.md) and
[recovery workflow](disaster-recovery.md) before go-live.

Target: Ubuntu, two vCPU, 2 GB RAM, 40 GB disk. Runtime services: `web`, `worker`,
`postgres`, and `caddy`. The database must remain internal. Runtime builds should
be prepared on a capable workstation or CI rather than assumed feasible on this
small VPS.

## Production preparation

Use Ubuntu with Docker Engine/Compose >=2.24.4, Node 24 and Git for host operations and a
dedicated trusted operator account. Secure SSH/firewall and configure bounded
journald. Publish only TCP 80/443 through Caddy; do not expose PostgreSQL or bind
the development database override publicly. Domain DNS must point to the target
before public automatic HTTPS can work. A 1 GiB emergency swap file may soften
transient pressure; it is not usable application capacity or a substitute for caps.

Verify NTP/time synchronization on the host and compare provider clocks before
go-live. Future source timestamps are withheld from eligible analysis and labeled
stale; they must never be clamped to local collection time to manufacture freshness.

Build images on a workstation/CI, inspect their immutable IDs, and transfer a
verified `docker save` archive or use digest-pinned registry images. Load the
archive on the VPS. Do not build or accumulate build caches there. Keep a previous
release for rollback; remove only operator-reviewed obsolete project images.
Pinned base-image updates need dependency, container and recovery QA.

Copy `.env.example` to ignored `.env.production`, chmod 0600, and fill:
POSTGRES_PASSWORD, POSTGRES_WEB_PASSWORD and POSTGRES_WORKER_PASSWORD (distinct
32–128-character URL-safe random values); WEB_IMAGE, WORKER_IMAGE, POSTGRES_IMAGE and CADDY_IMAGE (immutable
sha256 IDs or registry digests); APP_ORIGIN (exact https://domain); ACCESS_USER;
ACCESS_HASH (bcrypt cost 12–14). Generate the gateway hash with `caddy hash-password`
using stdin, not a command-line plaintext password. Quote the hash value in the
environment file to preserve its dollar signs. Optional provider keys stay blank
when absent; AI remains disabled without explicit enablement/key/model. No runtime
service receives the entire environment file.

```sh
node infra/ops/terminal.mjs validate
node infra/ops/terminal.mjs initialize
node infra/ops/terminal.mjs start
node infra/ops/terminal.mjs status
node infra/ops/terminal.mjs backup
node infra/ops/terminal.mjs verify-restore
```

Initialize starts PostgreSQL, runs administrator migrations in a one-off worker
container, then reapplies limited runtime grants. The permanent worker runs only
its runtime process. Repeat initialize before starting a new schema release;
never run backward migrations or rewrite migration history. Review a backup and
forward-schema compatibility before rolling images back.

Install the supplied backup timer only after adjusting its directory/user and
testing the commands as that account. Configure off-host transfer and verify a
clean-host restore. Public TLS, firewall, actual VPS resource behavior and remote
recovery remain go-live checks requiring the operator's domain/host/access details.

## Isolated production-like QA

```sh
docker compose build worker
docker compose build web
docker compose build postgres
docker compose build caddy
node infra/ops/verify-production.mjs
```

This creates/reuses only `terminal-production-qa`, separate from development data,
with generated ignored credentials and HTTPS on localhost:18443. The explicit QA
override publishes loopback ports only and uses Caddy's internal CA. The test client
accepts only this known local certificate; production clients use normal trusted
public TLS. It tests authentication, Origin rules, database permissions, synthetic
storage-protection states (test-only), persistent operator procedures, frozen
unavailable-evidence reports, shutdown/outage/recovery and a real dump/restore.
Live ingestion/model calls are disabled. Result: `.work/production-verification.json`.
No persistent volume is removed. Do not use this override for public deployment.

## Local PostgreSQL

Copy `.env.example` to the ignored `.env`. Generate a local password and set
`POSTGRES_PASSWORD`. Set `DATABASE_URL` to a PostgreSQL connection URI using that
password, database/user `terminal`, and host `127.0.0.1:54321`. The example file
intentionally contains no values. Do not reuse local credentials in production.

```sh
docker compose -f compose.yaml -f infra/docker/compose.local.yaml up -d postgres --wait
pnpm db:migrate
pnpm db:check
```

The override exposes PostgreSQL on loopback only for host-side checks. Omit the
override for the full local application stack; PostgreSQL then has no host port.
The named volume persists data across container recreation. `docker compose down`
does not delete it. Do not use `down -v` unless explicitly discarding local data.

Migration generation is credential-free. Migration execution requires a valid
database URI. Schema changes must be committed as SQL and Drizzle metadata.

## Full local stack

```sh
docker compose build worker
docker compose build web
docker compose build postgres
docker compose build caddy
docker compose up -d --wait
```

Open `http://127.0.0.1:8080`. Readiness is at `/health?ready=1`. Only Caddy is
exposed, on loopback. Worker migrations run before its heartbeat service starts;
web waits for worker readiness. Images run application code as a non-root user.
Compose caps runtime memory at 1,300 MB in total and rotates each service's logs
at three 10 MB files. This is a local foundation configuration, not a secured
production deployment.

For host development, use the database override, run `pnpm db:migrate`,
`pnpm dev:worker`, and `pnpm dev` in separate terminals. The latter commands read
the ignored root `.env`; production image builds require no credentials.

## Integration tests

The integration suite refuses any database except `terminal_test` on
`127.0.0.1` or `localhost`. It drops and recreates the test schemas. Never point it
at a database you intend to keep.

Set `TEST_DATABASE_URL` in `.env` using the same local password and loopback port,
but database name `terminal_test`. Create the database once:

```sh
docker compose -f compose.yaml -f infra/docker/compose.local.yaml up -d postgres --wait
docker compose exec -T postgres psql -U terminal -d terminal -c "CREATE DATABASE terminal_test"
pnpm test:integration
```

When returning to the internal-only full stack, run the base Compose file without
the override:

```sh
docker compose up -d --wait
```

This recreates PostgreSQL without its loopback host port and retains its named
volume. A local password is generated per environment; CI generates and masks
an ephemeral password per run. Credentials never enter build arguments or images.
