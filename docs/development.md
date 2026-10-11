# Development and testing

Use Node.js 24 and pnpm 10.33.0. Docker Engine with Compose is needed for the local
database and container checks. Run commands from the repository root.

## Interface preview

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:3000](http://127.0.0.1:3000). Without configuration, the interface
shows disconnected sources. The web and worker development commands read the root
`.env`; production builds require no provider credentials.

## Database and worker

Copy `.env.example` to `.env`. Set `POSTGRES_PASSWORD` to a new local password.
Set `DATABASE_URL` to a PostgreSQL URI with the same password, user/database
`terminal`, and host `127.0.0.1:54321`. All example values are intentionally blank.

```sh
docker compose -f compose.yaml -f infra/docker/compose.local.yaml up -d postgres --wait
pnpm db:migrate
pnpm db:check
```

Run `pnpm dev:worker` and `pnpm dev` in separate terminals. Public market ingestion
is enabled by default. Set `MARKET_INGESTION_ENABLED=false` for offline work;
optional providers need their own configuration in [data sources](data-sources.md).

The local override publishes PostgreSQL on loopback only. It is for host-side
development and tests, not public access. The named volume survives container
recreation.

## Complete local stack

After setting `POSTGRES_PASSWORD` in `.env`:

```sh
docker compose build worker
docker compose build web
docker compose build postgres
docker compose build caddy
docker compose up -d --wait
```

Open [localhost:8080](http://127.0.0.1:8080). The worker applies migrations before
starting; the web service waits for readiness. The base Compose file exposes only
Caddy on loopback. Use [production deployment](deployment.md) for authenticated HTTPS.

`docker compose down` stops and removes containers while keeping volumes.
Do not use `down -v` for routine development or tests.

## Testing

```sh
pnpm qa
pnpm db:check
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm qa` runs documentation links, formatting, ESLint, strict types, unit tests
and worker/web production builds. Run resource-intensive commands sequentially.
The other suites have these prerequisites and purposes:

| Suite      | What it checks                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| Unit       | Provider contracts, calculations, freshness, malformed inputs and failure paths using deterministic fixtures |
| PostgreSQL | Migrations, constraints, idempotence, rollback, concurrency, retention and immutable records                 |
| Browser    | Production-server routes, keyboard interaction, source/error states and desktop/mobile layouts               |
| Container  | Fresh images, readiness, authentication, role permissions, shutdown/recovery and backup restoration          |

### Integration database

The integration suite accepts only `terminal_test` on `127.0.0.1` or `localhost`.
It resets that database's test schemas. Set `TEST_DATABASE_URL` in `.env` with
the local password and port above, using database name `terminal_test`.

Create it once after starting local PostgreSQL:

```sh
docker compose exec -T postgres psql -U terminal -d terminal -c "CREATE DATABASE terminal_test"
pnpm test:integration
```

### Browser and container checks

Browser tests launch the production web build on port 3100 and use explicit test
fixtures; they do not need live provider keys. Run `pnpm build` first if the build
is absent or stale. Linux may need `pnpm exec playwright install --with-deps chromium`.

After building the four images above, run `node infra/ops/verify-production.mjs`
for the isolated container suite. It uses a separate database volume and
`data/operations-qa` directory, temporary ignored credentials and loopback HTTPS.
It exercises failures only in that test stack and preserves persistent volumes.
See [container verification](deployment.md#isolated-container-verification).

GitHub Actions runs all four suites. Workflow actions are pinned; credentials
are generated and masked per run. Local link validation, `pnpm docs:check`, checks
repository paths and Markdown anchors without making CI depend on external sites.

## Working on the code

Put source-specific normalization in provider adapters, pure calculations in
domain modules and persistence in the database package. Keep credentials and
provider calls out of browser code. A new formula needs a method version and
input/provenance coverage; a schema change needs SQL and Drizzle metadata from
`pnpm db:generate`, followed by `pnpm db:check` and integration tests.

Use focused branches and conventional commits. Keep synthetic data in test
fixtures and generated outputs, secrets and dumps out of Git. Review the affected
tests and documentation before opening a pull request; merge only after CI passes.
