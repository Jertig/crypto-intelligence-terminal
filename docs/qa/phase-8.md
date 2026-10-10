# Phase 8 QA review

## Status

PASS — complete local Phase 8 gate. No VPS deployment, public certificate,
off-host recovery or live model call is claimed. Publication requires green CI
on the exact pushed head; the final repository-wide audit runs again from main.

## Checks

All seventeen sections of 05_TESTING_QA_PROMPT.md reviewed. Frozen dependency
installation, formatting, lint, strict workspace/test types, migration consistency,
156 deterministic unit, 73 real PostgreSQL integration and 37 production-browser
tests passed. Original assertions, coverage and deadlines remain intact. Fresh
worker/web production builds and all four hardened container builds passed.
Twelve additive migrations, 37 public tables and four runtime services.

Provider tests preserve valid/malformed/empty/rate-limited/timed-out/stale,
disconnected/reconnected and failed-request contracts. Database coverage retains
idempotence, provenance, transaction rollback, retention without credentials,
immutable events/reports and research concurrency limits. New tests cover all
storage thresholds, missing/invalid/future/stale measurements, bounded backup
selection, pinned configuration, pause/resume, failed status persistence and
production research write protection. Missing data is never replaced by zero.

The final isolated secured production verifier passed 49 checks: homepage,
health, every data API and real static assets reject unauthenticated access;
authenticated HTTPS/readiness/security headers and HTTP redirects work. Foreign
origins fail. Runtime roles cannot assume administrator, create schema or modify
forbidden evidence/records. A labeled synthetic operational-state fixture blocks
writes while preserving reads, then real status is restored. Unit-injected
measurements verify worker pause/resume; no real disk was filled to trigger it.

Worker shutdown took 0.69 seconds, exit zero, no OOM; its own heartbeat was removed.
Readiness failed while stopped and during database outage, without internal error
details. Restart preserved notes/watchlists, twelve migrations and report digests.
A real 77,435-byte custom-format dump restored to a disposable database, preserving
twelve migrations, two reports, one note and one watchlist. Only the test database
created by that operation was dropped; existing data/volumes were preserved.

All four services were healthy with bounded memory/CPU/logs/restarts. Only Caddy
published loopback QA ports; production publishes only TCP 80/443. Node application
containers were non-root/read-only. Twelve warm serial API observations took
6–60 ms. Idle production-like service RAM totaled 139.97 MiB. See
[measurement scope and growth analysis](../resource-review.md).

Browser regression coverage preserves keyboard navigation, scanner sort/filter,
selection/inspector/chart, command palette, error/empty/stale/degraded states,
notes/conflicts, saved views, reports and alerts. New browser tests cover operation
status aging, unavailable/failed backup evidence and keyboard retry on API failure.
The final actual-data sweep captured 24 workspaces on desktop and mobile (48 images),
plus the secured operations view in both sizes. No page overflow or browser error.
Internal horizontal table scrolling remains intentional on small screens.

## Defects

No known unresolved Critical/High defect in the implemented bounded phase.
Optional provider credentials, VPS access, public TLS and off-host recovery remain
unverified external capabilities, explicitly documented rather than fabricated.

## Security findings

Strong distinct administrator/web/worker passwords, private PostgreSQL, restricted
runtime grants, explicit one-off migrations, personal HTTPS gateway authentication,
strict Origin/Host/body schemas, parameterized bounded SQL, server-only provider
keys, read-only AI tools, sanitized errors and mutation/model limits were reviewed.
No trading/signing/private-key capability exists. Backup/restore commands use fixed
arguments, ignored permission-checked configuration, streaming bounds, path
containment, overlap locks, integrity checks and a guarded disposable restore DB.

Known-secret/recognizable-key/history/client scans passed: 36 historical revisions
before Phase 8 commits, 39 browser chunks and current files; no prohibited environment,
dump or private-key file. All 32 example fields are blank. Original specification
text and approved reference hashes match. Repeat history scan after commits/main.
Docker contexts exclude nested environments, .work, archives and data.

Trivy v0.75.0 scans found no vulnerabilities or secrets in the hardened web,
worker and PostgreSQL images, and no High/Critical or secrets in Caddy. One UNKNOWN
module advisory concerns an unused OpenPGP package; the gateway's dependency-list
build check proves that package is not imported. No ignore rule suppresses it.
Production pnpm dependencies audit clean; the existing development-only braces
advisory remains locally patched and documented. See [dependency security](../dependency-security.md).

Personal Basic Auth is not MFA, multi-tenant isolation or an internet DoS guarantee.
The trusted host/Docker operator remains privileged. Public deployment hardening
and off-site alert delivery need their separately documented operator steps.

## Data-quality findings

Source/collection dates, units, direct/derived classifications and versioned formulas
are preserved. Four token risk categories remain separate. The liquidity-vacuum
signal remains a same-pool DEX aggregate proxy, not executable depth or confirmed
withdrawals. Ownership, LP attribution and missing market structure remain absent.
Wallet relationships do not establish common ownership or insiders. Macro period,
realtime range, observed revisions and collection time stay distinct; incomplete
event windows remain unavailable; cohorts match title/category/unit. Correlation,
regression and lead/lag remain descriptive, never causal.

AI retrieval remains small, allowlisted and read-only. Facts, Derived Signals,
Interpretation, Counter-evidence, Confidence and Sources are separate; stale,
future, missing and conflicting evidence cannot support interpretation. No model
credential/call, invented market fact or predictive probability was introduced.
Reports preserve capture-time freshness and verify their digest on read.

During live review some Binance timestamps were approximately ten seconds ahead
of the local collection clock. Future observations were labeled stale and excluded
from eligible analyst facts, preserving timestamps rather than clamping them.
Verify synchronized host clocks and provider timing before go-live; screenshots
show actual partial/stale observations, not fabricated fresh feeds.

## Resource concerns

Same four services; aggregate memory cap 1,300 MiB and CPU cap two cores. Pools,
arrays, requests, polling, retention, report sizes and logs remain bounded. Database
6/8 GiB warning/protection and 70/80/90% filesystem thresholds are deterministic.
Unknown/stale production measurements fail closed for writes. Cleanup continues
independently of credentials; deletion does not guarantee file shrinkage.

The real provider-history DB measured about 33 MB, separate from the 9.4 MB QA DB.
Backup selection is seven daily/four weekly/three monthly buckets under an 8 GiB
archive budget and filesystem reserve. The actual workstation backup filesystem
was in the urgent band; this was shown honestly and unrelated files were untouched.
Local idle/short visual samples do not prove sustained target-VPS capacity.

## Design deviations

Approved ivory/off-white palette, restrained serif headings, green/gold/red accents,
thin separators, dense tables, low radius and keyboard controls are preserved.
Operational status uses the existing table hierarchy. Missing-source workspaces
show useful evidence requirements. No invented chart, world map, avatar, chatbot
panel, neon/glass styling or decorative network graph was added.

## Fixed during review

- Quoted production tmpfs options so YAML does not split comma-separated flags.
- Corrected test module mocks to use the actual shared module path; failures remain tested.
- Scoped the existing runtime loader assertion after adding a second accessible status panel.
- Preserved honest confidence when real provider-health evidence is present; the empty-evidence operational report explicitly requests missing market/risk evidence.
- Accepted the genuinely urgent filesystem state in QA rather than assuming the workstation has normal capacity.
- Removed unused vulnerable runtime package managers; patched zlib; rebuilt Caddy/gosu against fixed dependencies and locked module checksums.
- Excluded newly generated QA environments/operations data from container contexts.
- Refreshed settled-source builds before the full browser gate; retained every original assertion and deadline.

## Remaining limitations

Helius/FRED/model keys and tracked-wallet configuration are absent. Futures locally
times out. CoinGecko/DefiLlama, exact TOTAL3/DXY/gold and CEX/DEX-flow/news feeds are
not connected. Sourced event records have not been imported. Reputation, risk and
regime methods remain descriptive/uncalibrated. Alerts are minute-based and in-app.
Public domain/VPS TLS, systemd installation, off-host delivery and clean-host recovery
are not performed. No paid service was purchased. Further infrastructure requires
actual measured need, not speculative scale.

## Recommendation

READY TO COMMIT — local gate passed; push coherent commits, require exact-head
green CI before merge, then run the final main-branch audit. Deployment remains
a separately authorized operation.
