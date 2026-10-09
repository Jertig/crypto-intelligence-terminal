# Phase 1 QA

## Status

PASS — local gate complete on 10 October 2026 WIB. The PR merge additionally
requires latest head GitHub CI to pass.

## Checks

- Repository: original specification text/image preserved; no current secrets,
  recognizable private keys, forbidden environment files or dumps in history.
- Dependency consistency: frozen lockfile install and Drizzle check pass.
- Formatting, ESLint and strict workspace/test types pass.
- Unit: 49 deterministic tests pass, including normalization, provider failures,
  message size, stale detection, backoff, reconnect and stopped-stream recovery.
- Integration: 19 real PostgreSQL tests pass. All three migrations run from empty
  guarded test database and are idempotent; duplicate ingestion, late observations,
  constraints, retention boundaries, provenance and batch rollback are covered.
- Production builds pass. All 13 browser tests pass, including populated scanner, selection,
  chart, provenance, command search, failure, mobile and empty-shell regressions.
- Docker: four services healthy; worker exits zero on shutdown and removes its
  own heartbeat. Restart restores readiness. Database outage is sanitized and
  unready; container recreation preserves migrations and observed data. PostgreSQL
  has no host port in final base stack. Restart policies and rotating logs verified.

## Defects

No open Critical or High product defect identified. Missing external futures
availability is a disclosed capability limit, not substituted market evidence.

## Security findings

Production dependency audit is clean. The existing development-only braces
advisory remains version-flagged with a tested local depth guard; no suppression.
Provider origins/protocols/ports are allowlisted, redirects rejected, bodies bounded,
errors sanitized, SQL parameterized and candle inputs validated. No request-time
provider fetch, client secret, shell execution, signing or trading permission.
Authentication is Phase 8 scope; this preview remains loopback-only.

## Data-quality findings

Live spot REST and ticker/closed-candle stream persisted 12 actual markets and
over 20,000 closed candles. Independent futures requests timed out locally.
Funding and OI normalization/persistence are fixture-tested, visibly unavailable
without observations. Prices/quote volumes are USDT; OI is base quantity and
funding fraction becomes percent only in presentation. Exchange-scoped identities
do not assert global mappings. Source/ingestion time and DIRECT quality survive
the provider-to-query pipeline. Cached data continues aging during query failures.

## Resource concerns

One combined stream, maximum 30 symbols (default 12), capped message/buffer sizes,
two database connections per application and sequential bounded REST work.
No tick history or request-time fan-out. Hourly retention deletes at most 5,000
rows per historical table/interval. Snapshot prices overwrite by source recency.
Measured local steady snapshot: Caddy 12.77 MiB, PostgreSQL 36.34 MiB, web 53.12
MiB, worker 46.14 MiB. CPU at that instant: 0%, 3.36%, 0%, 1%, respectively.
Warm-up had higher short bursts. Allocated container limits total 1,300 MiB.
Database was approximately 15 MB at initial verification. These are local
observations, not sustained VPS load certification. Retained 12-symbol OHLCV is
about 1.4 million rows before daily and derivatives; plan storage with indexes,
WAL and vacuum overhead and enforce the final 8 GB budget in Phase 8.

## Methodology and AI review

No research scores are introduced in Phase 1. Freshness thresholds and retention
are deterministic and documented. No model is called; memo facts cite actual
selected observations and interpretation stays unavailable. No evidence is
invented for wallet/event/risk/macro capabilities.

## Design deviations

The approved ivory palette, restrained serif titles, thin separators, small radii,
dense table and right inspector are preserved. Charts show observed closed-bar
prices with attribution. No decorative graphs or fake aggregate tape metrics.
Mobile prioritizes selected evidence and replaces the wide table with asset rows.

## Fixed during review

Bounded exchange metadata/ticker requests prevent unrelated or oversized exchange
payloads from poisoning selected observations. Newer prices survive late REST
responses. Health uses a shared pool and detects old provider success timestamps.
Stream construction failures back off safely; stop cancels reconnect. Failed
initial persistence cannot mark the in-memory universe initialized. Derivatives
require nonempty funding and provenance constraints. Populated mobile review
caught tape overflow and an inherited empty-state pseudo-element; regression
coverage was added. Integration testing was rerun with its explicit local port
override after final base Compose removed that port; final stack is internal.

## Remaining limitations

Futures endpoint is unavailable locally. Global metadata/market cap and CEX flows
remain absent. Initial history is bounded and longer outages can leave gaps;
retention is not a completeness guarantee. Risk, wallets, narratives, macro,
grounded AI and durable research are later phases. Public TLS/auth/backup/disk
policies arrive in Phase 8. No VPS deployment occurred.

## Recommendation

READY TO COMMIT. Populated desktop/mobile screenshots were inspected after the
updated Docker image booted. Both layouts have no horizontal page overflow and
no browser errors. CI remains a separate required merge gate.
