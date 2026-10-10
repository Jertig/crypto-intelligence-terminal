# Phase 2 QA

## Status

PASS — full local gate complete on 10 October 2026 WIB. Latest head CI
must separately pass before merge.

## Checks

Repository/specification audit, frozen dependency install, Drizzle consistency,
formatting, ESLint, strict types and production build pass. No dependency added.
61 deterministic unit tests cover closed windows, gaps, stale/future inputs,
units, correlation/zero variance, allocation limits, safe URLs, coverage,
component weights, partial scores and regime prerequisites.
26 PostgreSQL tests pass and cover four migrations from empty, whole fixture pipeline,
versioned rows, idempotency, completeness, rollback, provenance, constraints and
180-day retention with explanation cascade.
16 browser smoke tests pass and cover narrative matrix/filter/select/detail, partial
coverage, unavailable factors, source drill-down, API failure/retry, mobile and
all existing market/shell paths. Container builds pass; all four services healthy.
Worker shutdown exits zero and removes its heartbeat; readiness rejects the
stopped worker. Restart recovers. Database outage is sanitized; recreation
preserves observed data and all four migrations. Base PostgreSQL has no host
port. Restart policies and bounded rotating logs verified.

## Defects

No open critical/high product defect identified.

## Security findings

Original specification/reference preserved. Twelve historical revisions and
current tracked/untracked files checked against actual ignored secret values:
no leaks, private keys or forbidden environment/dump files. Production dependency
audit clean. Existing development-only advisory mitigation remains tested.
Database-only query API uses bounded rows, sanitized errors, parameterized SQL,
runtime contracts and no external URL fetching. Classification links reject
non-HTTPS and embedded credentials. No AI call, trading or signing.

## Data-quality findings

Actual local closed histories yielded 168 features across twelve observed
markets and fifteen narrative rows. Full narrative scores remain null because
wallet/protocol evidence is absent; futures unavailability further reduces
coverage. No fixture rows are seeded into production.
Features preserve their input series and source times. Missing configured assets
reduce breadth coverage. Narrative source time comes from its selected tag.
Signals, features and narratives preserve formula versions; active versions
are selected explicitly. Cached values age rather than appearing perpetually live.

## Methodology and AI grounding

All fourteen formulas, units, windows, weights, allocation decisions, sampling
limits and regime thresholds documented in methodologies.md. UI exposes each
component and missing evidence. Partial scores are descriptive and uncalibrated;
full score is withheld. Regime turnover is explicitly a proxy, not measured
liquidity. No model is called or interpretation fabricated.

## Resource concerns

Same four services and one worker. Feature calculations every five minutes,
narratives every fifteen, sequential bounded database reads. Maximum thirty
markets, 1,000 hourly bars/market, 31 daily bars, 96 funding observations and
500 OI observations. API maximum 420 features/15 narratives/two signals.
Typed wide rows avoid fourteenfold row multiplication; metadata is secondary
and bounded to 64 KiB. Hourly retention batches expire history after 180 days.
Twelve assets produce 622,080 feature rows per version/180 days; thirty produce
1,555,200. Local snapshot: Caddy 25.41 MiB, PostgreSQL 32.36 MiB, web 56.23 MiB,
worker 53.51 MiB. Warm-up CPU at that instant: 0%, 11.77%, 0.02%, 46.86%.
Database about 24.7 MB. Limits total 1,300 MiB. Not VPS certification.
Observed feature metadata averaged 1,131 stored bytes across 1,080 live rows;
historical growth still depends on input density, indexes, WAL and versions.
Integration verification pauses live ingestion and runs heavy checks sequentially
to avoid unrelated warm-up contention; all assertions and deadlines are preserved.

## Design deviations

Ivory background, compact table matrix, serif section headings, thin separators,
restrained state colors and right-hand feature inspector preserved.
Populated desktop and mobile screenshots inspected. No horizontal page overflow
or browser errors. Component tables scroll internally on narrow screens.

## Fixed during review

Stable variance avoids false funding z-scores on constant input. Aligned return
windows prevent benchmark mismatch. Missing configured assets remain in breadth
coverage and missing classified assets in narrative weight denominator. Future
features cannot contribute. Formula-versioned signals cannot mask active versions.
An ambiguous browser alert selector was scoped to the actual product message.
Visual review also found and corrected an old UI clock causing new response
timestamps to briefly appear stale. A delayed-response regression covers it.

## Remaining limitations

Curated classifications cover four assets; cohort coverage is narrow and
editorial. Wallet/protocol components absent; full scores unavailable.
Public futures times out locally. Initial historical gaps can make metrics
unavailable. Regime is a heuristic without macro/on-chain factors or calibration.
Secure remote access, backups/disk enforcement remain Phase 8. No VPS deployment.

## Recommendation

READY TO COMMIT. Latest green CI remains a separate mandatory merge gate.
