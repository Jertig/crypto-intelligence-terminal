# Phase 7 QA review

## Status

PASS — full local gate complete. No VPS deployment or live model call.

## Checks

All seventeen sections of 05_TESTING_QA_PROMPT.md reviewed. Frozen installation,
migration consistency, formatting, lint, strict workspace/test types, 139 unit,
70 PostgreSQL integration and 35 browser tests passed. Original assertions,
coverage and deadlines remain intact. Worker/web production and container builds
passed from the settled source. Eleven migrations, 36 tables and four services.

Provider regressions remain deterministic: malformed/empty/rate-limited/timeout,
stale and failed provider responses retain their established contracts. No live
provider or model credential is required by tests. New integration coverage checks
concurrent list caps, idempotent items, note conflicts including equal clocks,
typed query/view roundtrips, report integrity/immutability, retention without keys,
provider transitions and complete/partial/future narrative baselines. Tests use
only the guarded local disposable terminal_test database.

Browser coverage adds unconfigured storage, request/origin/body validation,
escaped notes and edit conflicts, saved scanner links/failures, frozen six-part
reports, unavailable watched assets, keyboard actions and stale alert evaluation.
Prior scanner, inspector, source degradation, command palette and navigation
coverage is preserved. A build made before the final note selector was added
correctly failed that new browser assertion; rebuilding settled source passed the
whole suite without assertion/deadline changes.

The resumed clean-source gate found an order-dependent test-isolation defect:
research setup cleared exchange markets but retained token-risk fixtures from a
prior suite. Clearing both fixture roots in the guarded disposable database fixes
the empty-report test; its original empty-source assertion remains unchanged.
The complete 70-test integration gate then passed.

## Defects

No known unresolved Critical/High defect in the bounded Phase 7 scope. Production
authentication, TLS, disk protection and backups remain the next phase's gate.

## Security findings

Typed strict actions, UUIDs, character/body limits and allowlisted parameterized
SQL. No arbitrary table, SQL, URL or command input. Same-Origin/Host protection
for mutations, one concurrent mutation and 30 attempts/minute/process, sanitized
errors and no-store responses. Notes render as plain escaped text. Reports reject
updates at PostgreSQL and verify their digest on read; index responses never
include report bodies. Digest validation is not protection against an administrator
who can replace both content and digest. Records belong to one shared operator,
not a multi-tenant service. Local gateway is loopback-only; authenticated public
access is Phase 8 scope. No external notification or trading/signing interface.

Known-secret and recognizable-key scans passed across 32 historical revisions and
current files, with no forbidden environment/dump/private-key file. All 22 example
values remain blank. Specification text/reference hashes preserved. All 38 browser
JavaScript files exclude known credentials and server model authorization code.
Production dependency audit clean; existing patched development advisory remains
documented in dependency-security.md, with regression tests and no suppression.

## Data-quality and methodology findings

research-alerts:v1 exposes condition, comparison, value/unit, evidence IDs, source
time and evaluation time. Numeric rules require fresh complete evidence from a
successful tool; missing/stale/conflicting/future inputs remain UNKNOWN. Data-risk
conditions monitor the absence itself after a successful query. Provider failures
caused by missing configuration do not establish remote outages. Narrative changes
require complete coverage and an observed baseline; partial/future inputs cannot
replace it. Same-input reevaluation retains its result. UNKNOWN neither clears the
last known triggered state nor generates recovery. Notifications are transition
records, not predictions. Four risk categories remain separate, and liquidity
remains the disclosed same-pool USD proxy, not depth/withdrawal evidence.

Watchlist tickers are exchange-scoped labels and do not expand ingestion. Missing
market evidence stays unavailable. Notes are explicitly operator opinion. Saved
queries contain structured analyst scope, not SQL. Captured reports retrieve
server evidence without a model call; all six analyst sections, counter-evidence,
source timing and LIMITED/INSUFFICIENT confidence remain. Freshness is frozen at
capture time and visibly distinguished from current evidence. No causation,
unsupported probabilities, ownership/insider claim or fake market observation.
All prior event/macro observation/revision/retention rules are unchanged.

## Resource and Docker review

No runtime service or third-party dependency added. Eight typed tables; hard
mutation caps and bounded responses. At most three asset projections cached per
minute alert batch, plus bounded provider/intelligence reads. No automatic AI
requests. Credential-independent hourly report/notification retention, 50 reports
for 90 days and at most 1,000 notifications for 30 days. Report payload allowance
alone is about 6 MiB at the cap, plus ordinary PostgreSQL overhead. Notes/queries/
views/watchlists are count/length bounded; notes can contribute about 1.2 MiB at
maximum UTF-8 length. No report bodies in list responses. Pool/query deadlines
unchanged. This does not certify sustained maximum-universe VPS workload.

Four healthy services, no PostgreSQL host port, non-root Node users, existing
CPU/RAM limits, restart policies and 10 MiB × 3 logs verified. Worker SIGTERM exits
zero without OOM, removes its own heartbeat, and readiness returns 503. Restart
recovers. Database outage returns sanitized unavailable readiness; container
recreation preserves all eleven migrations, provider data and research records,
then readiness recovers. Local operator list/items, note, query, view, report and
alert/notification counts survived recovery. Existing eight-second process and
ten-second Compose deadlines remain unchanged.

Short recovery snapshot: Caddy 14.16 MiB, PostgreSQL 36.70 MiB, web 57.82 MiB,
worker 46.53 MiB (about 155 MiB). Database 32,431,127 bytes; worker/web images
61,986,724/77,193,082 bytes. Startup CPU was transient (PostgreSQL 16.51%, worker
33.03%); this is a local snapshot, not an idle/sustained VPS benchmark. Local host
had about 71 GB free. Global Docker cache/legacy images were not pruned or treated
as this project's production disk usage. Production capacity protection is Phase 8.

## Design deviations and fixed during review

Approved ivory reference compared with refreshed actual desktop and 390px mobile
captures for all four workspaces. Eight combinations have no page overflow or
uncaught errors. Tables scroll internally, controls remain keyboard accessible,
serif headings, restrained green/gold/red and thin separators persist. Creation
forms collapse when populated records exist; the tables lead the hierarchy.
Purposeful real watchlist capture: design/phase7-watchlist.png. Local operator
checklist text is a procedure, not fake market data; reports contain actual
server-retrieved observations/unavailable states. Synthetic fixtures are test-only.

Fixed: failed-tool thresholds, future-only coverage risk, future narrative clocks,
lost note edits on same-millisecond clocks, shared form fields, missing note asset
selector, unnecessary saved-view effect rendering, stale evaluator labeling and
oversized empty-form hierarchy. Existing analyst renderer was extracted for reuse,
preserving its behavior and all previous browser assertions.

## Remaining limitations

Single-operator records; no multi-user accounts, external delivery, acknowledgement
workflow or trading. Missing provider/model credentials and existing source/depth/
identity limitations remain explicit. In-app transitions are evaluated once per
minute, not real-time execution signals. Historical snapshots may expire and need
backup for longer retention. Live optional model integration is unverified; no
model calls/purchases performed. Production auth/HTTPS/backups/disk protection and
off-host recovery configuration belong to Phase 8; no deployment occurred.

## Recommendation

READY TO COMMIT. Push the bounded branch, require latest exact-head green CI,
merge, then start Phase 8. No routine approval required by the user's authorization.
