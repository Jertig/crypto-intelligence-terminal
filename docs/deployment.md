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
