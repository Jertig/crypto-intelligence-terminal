# Architecture

Phase 6 adds read-only bounded evidence tools, explicit grounding/freshness gates,
an optional stateless model adapter and a six-part analyst memo. Structured model
selection cannot replace factual values or invent citations. All tools use fixed
database queries; no table, service or third-party dependency added. See
[evidence policy and bounds](ai-analyst.md).

Phase 5 adds three tables and migration 0009: observed macro revisions, immutable
sourced events and versioned event impacts. A bounded hourly engine in the same
worker coordinates fixed-origin FRED collection and retrospective event windows.
Database-only Events/Macro APIs feed dense tables and descriptive statistics.
No infrastructure or dependency is added. See [methodology](events-macro.md).

Phase 4 adds an optional bounded wallet coordinator in the same worker, four
additive tables across four new migrations, and a database-only wallet DTO route.
Normalized finalized transaction evidence is deduplicated per tracked address;
compaction is transactional and the daily provider budget persists across restarts.
Domain helpers classify observed activity and explain relationship groups without
common-owner claims. No additional services or dependencies. See [wallet methodology](wallet-intelligence.md).

Phase 3 adds a bounded token coordinator to the existing worker and five additive
tables via migration 0004. It writes selected DEX pools, security evidence and
separate versioned indicators. The Tokens/Risk workspaces query stored DTOs;
provider calls remain in the worker. See [token architecture and methodology](token-risk.md).

The target runtime contains four services: Caddy, the Next.js web application,
one bounded TypeScript worker, and PostgreSQL 16. PostgreSQL has no public port
in the application Compose configuration.

```text
External sources (Binance, DEX Screener, GoPlus; optional Helius and FRED)
  → provider adapters → worker → normalization → PostgreSQL
  → feature/intelligence engines → query layer → terminal and read-only AI tools
```

The repository contains `apps/web`, `apps/worker`, `packages/domain`,
`packages/db`, and `packages/providers`. Phase 1 adds Binance normalization,
bounded streaming, snapshots, OHLCV, funding/OI persistence and query APIs.
Phase 2 adds pure feature, narrative and signal engines in the domain package,
typed wide snapshots, bounded schedules and a database-only intelligence API.
Risk, wallets, events and macro are additive Phases 3–5. Phase 6 adds the analyst.
Market-data requests read PostgreSQL without provider fan-out. The optional
explicitly enabled analyst can call its fixed model provider on user submission;
its tools still read only bounded database projections.

The web shell can render with no database or provider configured. A liveness check
must distinguish a running web process from database readiness. The worker must
validate configuration, connect to the database, and stop gracefully. Market
ingestion uses one combined stream and bounded REST schedules.

Decisions: pnpm workspaces, strict TypeScript, PostgreSQL migrations via Drizzle,
Zod validation, server-side credentials, bounded connection pools, and a single
worker. Do not introduce Redis, Python services, or a heavy observability stack.

The complete requirements are in `specification/02_ARCHITECTURE_AND_DATA_SPEC.md`.
