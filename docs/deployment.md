# Deployment

No VPS deployment is authorized or performed in Phase 0. The Compose and Caddy
configuration is for local validation only, with HTTP bound to loopback. Public
HTTPS, authentication, backups, retention automation, swap policy, monitoring,
and disaster recovery belong to production hardening.

Target: Ubuntu, two vCPU, 2 GB RAM, 40 GB disk. Runtime services: `web`, `worker`,
`postgres`, and `caddy`. The database must remain internal. Runtime builds should
be prepared on a capable workstation or CI rather than assumed feasible on this
small VPS.

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
