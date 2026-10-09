# Active implementation plan

The attached work package is the authoritative specification. The user's explicit
scope and model request take precedence over its recommendations.

## Approved sequence

Phase 0 is approved and merged. Complete Phases 1–8 sequentially, running each
phase's full QA gate and merging only green CI. Do not purchase services, handle
private keys, automate trading, fabricate market facts, or deploy to the VPS
without deployment authorization. Missing optional credentials do not block
independent work; document them and preserve explicit unavailable states.

## Phase 1 bounded plan

1. Preserve the four-service topology and ivory shell. Add shared normalized
   market contracts and a public-data-only Binance adapter with bounded requests,
   timeout/rate-limit handling, reconnect/resubscription, and staleness.
2. Add typed asset/venue/market identity, snapshots, OHLCV, funding, OI, and
   ingestion-run tables with provenance, uniqueness, idempotent persistence,
   retention, and transaction tests.
3. Integrate one worker: capped universe (default 12, maximum 30 markets), one
   spot WebSocket, bounded REST bootstrap/recovery, no tick history, periodic
   batched persistence, and independent derivative availability.
4. Serve bounded database queries only. Add table sorting/filtering/column
   visibility, keyboard selection, asset inspector, source/freshness indicators,
   and a basic price chart. No narrative, wallet, risk-score, or AI implementation
   in this phase.
5. Verify live public spot ingestion, failure/reconnect behavior, deterministic
   provider fixtures, real PostgreSQL and browser paths, clean build, Docker,
   security, resources, and approved design; document, push, PR, merge green CI.

## Bounded changes

1. Initialize the pnpm workspace, Next.js application, worker, shared domain,
   formatting, linting, strict TypeScript, and documentation.
2. Add PostgreSQL 16, the Drizzle foundation migration, bounded worker lifecycle,
   and local Docker Compose with Caddy, resource limits, and rotating logs.
3. Add Zod environment validation, provider-health contracts, and a health route
   that distinguishes application liveness from dependency readiness.
4. Establish deterministic unit tests, migration/integration tests, browser smoke
   tests, dependency checks, and GitHub Actions.
5. Build the approved ivory shell with navigation, command palette, inspector,
   explicit unavailable states, and no fabricated data.
6. Run every applicable section of `docs/specification/05_TESTING_QA_PROMPT.md`,
   repair meaningful defects, capture screenshots, and record evidence.
7. Push `chore/project-bootstrap`, show commits and CI, open a reviewable PR, then
   wait for the user's approval before Phase 1.

## Review gates

Review each coherent change before committing. Use conventional commits. Check
formatting, lint, types, deterministic tests, and production build. Run real
PostgreSQL and container checks where available; report environmental limits
truthfully. GitHub CI must verify migration constraints and browser behavior.

Never commit secrets, `.env`, dumps, runtime data, or generated build artifacts.
Keep `.env.example` values blank. Preserve the supplied specification verbatim.

## Completed foundation

All Phase 0 steps were verified and approved. The original report remains
`docs/qa-report.md`; subsequent phase reports are preserved separately.
