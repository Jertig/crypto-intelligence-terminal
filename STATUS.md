# Project status

Phases 0–6 completed and merged after green CI:

- Phase 0: PR #1, d955dde.
- Phase 1: PR #2, 8a32384.
- Phase 2: PR #3, d69e8dd.
- Phase 3: PR #4, 4951872; all fourteen latest checks passed.
- Phase 4: PR #5, 0f3823e; all fourteen latest checks passed on 8d9e718.
- Phase 5: PR #6, 2e353a1; all fourteen latest checks passed on 1af11cb.
- Phase 6: PR #7, ef9d092; all fourteen latest checks passed on f96de81.

Phase 3 final gate: 75 unit, 32 PostgreSQL integration, 19 browser tests;
production containers, graceful shutdown/recovery, data-quality, security,
resource and ivory desktop/mobile design reviews passed.

Completed Phase 4: bounded Helius adapter,
explicit tracked-address configuration, normalized transfers/activity, history
compaction, provider degradation, behavior methodology, uncalibrated reputation
components, observed relationships/groups, keyboard-first wallet explorer.

Phase 4 local QA passed: 88 unit, 43 PostgreSQL integration and 22 browser tests;
formatting, lint, strict types, migration consistency, production builds, both
container builds, graceful shutdown/recovery, security and desktop/mobile design
review. All prior coverage is preserved. Nine additive migrations and 25 tables.
Merged after green CI, preserving all prior history and coverage.

Completed Phase 5: bounded FRED adapter, observed revisions,
sourced immutable events, event windows and descriptive statistical research.
Local QA passed: 108 unit, 51 PostgreSQL integration and 26 browser tests; strict
types, formatting, lint, migration consistency, production/container builds,
graceful shutdown/recovery, resource/security and desktop/mobile visual review.
Ten additive migrations and 28 tables. Merged after green CI; credentials and live
macro/event ingestion remain unavailable. See docs/qa/phase-5.md.

Completed Phase 6. Read-only evidence retrieval, explicit analyst
memo sections and optional server-side model adapter. Local gate passed: 125 unit,
57 PostgreSQL integration and 29 browser tests; strict checks, production/container
builds, live-ingestion shutdown/recovery, security/resource and desktop/mobile
review. No new table/migration/service. See docs/qa/phase-6.md. Merged with exact
head green CI. Live model credentials are absent; no paid or automatic
model request was performed.

Active: Phase 7, feat/research-workflow. Persistent bounded watchlists, notes,
saved queries/views, immutable evidence reports and deterministic in-app alerts.
Eight additive typed tables, eleven migrations total, same four runtime services.
Local full QA passed: 139 unit, 70 PostgreSQL integration, 35 browser tests,
strict checks, production/container builds, graceful shutdown/recovery, security,
resource and desktop/mobile visual review. See docs/qa/phase-7.md. Publishing and
latest-head CI/merge remain pending.

Helius credential and tracked-wallet list are absent. No fake live activity;
fixtures validate deterministic behavior. Live Binance spot/DEX/GoPlus continue;
futures remains unavailable. No VPS deployment performed. Phases 7–8 follow
sequentially after the active phase passes and merges.
