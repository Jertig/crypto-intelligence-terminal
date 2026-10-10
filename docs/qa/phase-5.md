# Phase 5 QA review

## Status

PASS — complete local gate after bounded observed-revision retention and final
keyboard navigation review. No VPS deployment or live FRED verification claimed.

## Checks

The frozen dependency install and migration consistency passed. No dependency or
runtime service was added. Strict workspace/test types, formatting, lint and 108
unit tests passed. All 51 PostgreSQL tests passed, including
atomic revision-cap and concurrent independent retention coverage. All 26 browser
smoke tests passed, including sourced event selection, raw/derived distinctions,
missing derivative evidence, observed vintages, stale macro status, storage failure
and recovery, and 390px mobile overflow. Prior phase assertions and deadlines
remain intact. Clean production builds and both final container builds passed.
All four services became healthy. Worker shutdown exited zero without OOM,
removed its heartbeat and returned readiness 503; restart recovered. PostgreSQL
outage returned sanitized 503; recreation preserved migrations, provider rows and
the named volume. No PostgreSQL host port, node web/worker users, restart policies
and rotating logs were verified.

One initial database run timed out in an existing intelligence test and subsequent
cleanup collided with its unfinished operation. A fresh sequential full run passed
all tests with the original deadlines and assertions. Local host memory pressure
remains distinct from the application resource budget; checks stayed sequential.

Provider cases cover valid/empty/missing/zero/negative observations, malformed
values, future periods, mismatched realtime ranges, duplicate dates, truncated or
oversized bodies, HTTP/network/rate-limit/abort failures and fixed-origin requests
without key leakage. Unit fixtures verify exact closed-bar windows, gaps, future
collection exclusion, zero baselines, derivative units/tolerances, mixed inputs,
public citations, known OLS coefficients, small/constant/nonfinite/overflowing
samples, no forward fill, rolling windows and signed lag conventions.

## Defects

No known unresolved Critical or High implementation defect. QA repaired raw-SQL
timestamp serialization, test setup JSON serialization, event cohort mixing,
provider-health contract integration, unstable memo dependencies, mobile controls,
an ambiguous route-announcer/error selector, and numeric overflow handling.
Resource review added atomic per-date version caps and credential-independent
period pruning before accepting the storage design. Repeated event arrow presses
now move focus with selection; filtered selections retain their evidence context.
A three-event browser regression covers repeated navigation and filtering.

## Security findings

FRED uses a fixed HTTPS origin, no redirects, curated IDs, bounded bodies and
timeouts. Its key is worker-only and absent from stored endpoints or errors.
Public event citations require credential-free HTTPS and are never fetched.
Database statements are parameterized; manual imports are bounded, immutable and
transactional. New web APIs are read-only database queries. No arbitrary SQL/URL
tool, remote file ingestion, traversal endpoint, command execution API, signing,
private keys or trading code was added. The local stack remains loopback-only;
production access/TLS is still Phase 8. Known-secret, recognizable-key and forbidden
file scans passed over all 24 prior revisions and current files. All twenty example
values remain blank; original specification/reference preserved. Production
dependency audit is clean. No secret or dump is committed.

## Data-quality findings

FRED DIRECT observations preserve period dates, realtime date ranges and actual
collection time. Missing dot values remain null. Changed locally observed versions
are retained; unchanged polls do not inflate history or rewrite first knowledge.
Collection-as-of queries exclude future versions. Expired revisions can make old
queries unavailable; complete publication-time ALFRED history is not claimed.

Manual event release times and citations remain separate from macro periods.
Expectations/actuals are explicit nullable sourced inputs; future events cannot
have observed actual values. DERIVED impact windows expose actual bar boundaries,
version, calculation time and missing-input reasons. No gapped price path, missing
volume baseline or stale same-observation derivative is turned into an estimate.

Historical cohorts match title/category/unit/asset. Cross-market log changes or
unit differences are labeled, matched without forward fill, and gated by twenty
varying finite intervals. Regression, rolling and lead/lag relationships are
retrospective descriptive association. Timing mismatch, revisions, confounders,
serial dependence, small/selected samples and eleven exploratory lags are explicit.
No significance, unsupported probability, causation or Granger claim. AI grounding
remains Phase 6; no AI-generated facts are used in these workspaces.

## Resource concerns

Four runtime services and one worker remain. Three tables via one additive
migration bring the schema to 28 tables/ten migrations. Twelve serial hourly
provider requests, five-year period horizon, 2,000 observations per request,
twelve observed versions/date, atomic changed-date compaction and bounded hourly
pruning constrain macro storage. Retention runs without credentials and locks
per series. Fifty latest retained-window events are refreshed per hour; stored
events cap at 2,000 and impact identities at four windows × three assets/event.
Responses cap events at 100, impacts at 1,200, macro observations at 24,000 and
daily crypto points at 6,000. Worker cancellation is checked between operations.
Final short local snapshot after recovery: Caddy 35.07 MiB, PostgreSQL 29.27 MiB,
web 46.04 MiB and worker 44.28 MiB (about 155 MiB total). Limits total 1,300 MiB
and two CPUs. Database size: 30,686,231 bytes. Worker/web images:
61,967,388/77,140,971 bytes. This restart/bootstrap sample does not certify a VPS
steady state or saturated live FRED workload.

A synthetic maximum DTO (24,000 macro observations and 6,000 crypto points) was
8,606,480 bytes and processed in 296 ms; process RSS 175 MiB, heap growth 43 MiB.
The bounded upper response is large; gzip is enabled, the UI uses a shared cache
with minute polling, and AI retrieval must project small relevant evidence. This
is a local synthetic envelope, not live data or a production capacity claim.

## Design deviations

Ivory, serif headings, restrained accents, thin separators and compact tables
preserved. Events/Macro use the existing shell, query cache and evidence inspector;
controls wrap on mobile and large tables scroll internally. No maps, radar charts,
decorative networks, giant cards or chatbot panel. Actual unavailable states and
explicitly synthetic evidence were captured separately and visually inspected on
desktop and 390px mobile. Eight route/layout combinations have no page overflow
and no uncaught browser errors. Populated tables scroll internally. Purposeful
actual unavailable screenshots are preserved in design/phase5-events.png and
design/phase5-macro.png; labeled fixture captures remain local QA artifacts.

## Fixed during review

All issues above were fixed without disabling rules, extending deadlines,
removing tests or weakening assertions. Added mathematical and storage edge cases
strengthen the previous phase coverage.

## Remaining limitations

FRED credentials and sourced live event records are absent. Live FRED integration
and official release transcription are unverified; no fake events or macro values
are seeded. TOTAL3, exact DXY and gold are unavailable. Studies depend on retained
market windows; the latest fifty-event refresh is bounded, and old revision
history is deliberately incomplete. Retrospective observations are not a causal
experiment or release-time trading simulation. No VPS deployment performed;
production auth, disk protection and backups are later Phase 8 scope.

## Recommendation

READY TO COMMIT. Push coherent Phase 5 commits and merge only every latest green
CI check on the exact PR head before Phase 6.
