# Architecture

The target runtime contains four services: Caddy, the Next.js web application,
one bounded TypeScript worker, and PostgreSQL 16. PostgreSQL has no public port
in the application Compose configuration.

```text
External sources (future phases)
  → provider adapters → worker → normalization → PostgreSQL
  → feature/intelligence engines → query layer → terminal and read-only AI tools
```

Phase 0 establishes `apps/web`, `apps/worker`, `packages/domain`, and `packages/db`.
Provider adapters, indicators, signals, narratives, wallets, events, and AI tools
are reserved boundaries, not implemented capabilities.

The web shell can render with no database or provider configured. A liveness check
must distinguish a running web process from database readiness. The worker must
validate configuration, connect to the database, and stop gracefully; no market
ingestion is authorized in this phase.

Decisions: pnpm workspaces, strict TypeScript, PostgreSQL migrations via Drizzle,
Zod validation, server-side credentials, bounded connection pools, and a single
worker. Do not introduce Redis, Python services, or a heavy observability stack.

The complete requirements are in `specification/02_ARCHITECTURE_AND_DATA_SPEC.md`.
