# Architecture

Phase 3 adds a bounded token coordinator to the existing worker and five additive
tables via migration 0004. It writes selected DEX pools, security evidence and
separate versioned indicators. The Tokens/Risk workspaces query stored DTOs;
provider calls remain in the worker. See [token architecture and methodology](token-risk.md).

The target runtime contains four services: Caddy, the Next.js web application,
one bounded TypeScript worker, and PostgreSQL 16. PostgreSQL has no public port
in the application Compose configuration.

```text
External sources (Binance active; other adapters in subsequent phases)
  → provider adapters → worker → normalization → PostgreSQL
  → feature/intelligence engines → query layer → terminal and read-only AI tools
```

The repository contains `apps/web`, `apps/worker`, `packages/domain`,
`packages/db`, and `packages/providers`. Phase 1 adds Binance normalization,
bounded streaming, snapshots, OHLCV, funding/OI persistence and query APIs.
Phase 2 adds pure feature, narrative and signal engines in the domain package,
typed wide snapshots, bounded schedules and a database-only intelligence API.
Wallets, events, risk and AI remain subsequent phase boundaries.
Web requests read PostgreSQL; they never fan out to providers.

The web shell can render with no database or provider configured. A liveness check
must distinguish a running web process from database readiness. The worker must
validate configuration, connect to the database, and stop gracefully. Market
ingestion uses one combined stream and bounded REST schedules.

Decisions: pnpm workspaces, strict TypeScript, PostgreSQL migrations via Drizzle,
Zod validation, server-side credentials, bounded connection pools, and a single
worker. Do not introduce Redis, Python services, or a heavy observability stack.

The complete requirements are in `specification/02_ARCHITECTURE_AND_DATA_SPEC.md`.
