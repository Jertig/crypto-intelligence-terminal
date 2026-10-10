# Phase 4 QA review

## Status

PASS — final local Phase 4 gate completed on 2026-10-10. Ready for coherent
commits and PR; merge remains conditional on every latest CI check passing.

## Checks

Formatting, ESLint, strict workspace/test typechecking, frozen dependency install,
migration consistency and production builds passed. 88 unit tests and 43 guarded
PostgreSQL integration tests pass. Existing Phase 3 coverage (75 unit, 32 database,
19 browser) is preserved; no deadline or assertion was relaxed. The existing
navigation test now additionally verifies Wallets and retains its planned-workspace
assertions on the still-unimplemented AI Analyst. Migration count assertion follows
nine additive migrations; existing migrations are unchanged.

22 browser smoke tests passed on the final gate after the independent-retention
fix. Critical wallet paths cover
filtering, keyboard selection, inspector, source/coverage/methodology, missing
configuration, storage failure, public explorer links and 390px mobile overflow.

Provider tests use deterministic fixtures and a fixed collection clock. They cover
empty/malformed/oversized responses, bounded pages/transfers, explicit outcomes,
unsafe native quantities, validated addresses/cursors, sanitized failures, timeout,
rate limits, pagination failure with retained first-page evidence and duplicate
signatures. Ingestion fixture → normalization → PostgreSQL → derived analysis →
validated DTO preserves provenance. Future block/collection inputs are excluded.

## Defects

No known unresolved Critical or High implementation defect. Review found and fixed
timestamp serialization in raw SQL, compaction replay double-counting, loss of a
valid first page on a second-page failure, quota priority starvation, future health
timestamps, mismatched wallet-source evidence, implicit success for missing outcomes,
unsupported liquidity-type inference, future collection lookahead, and retention
coupling to successful polls. Per-address transaction locks prevent concurrent
compaction from duplicating archived counts. UI transfer annotations now occupy
separate readable lines; empty tables use compact spacing.
The final browser review also exposed a pre-hydration keyboard race. The command
trigger now remains disabled until the keyboard listener is attached; the smoke
test asserts this readiness before its original shortcut assertions. No sleeps,
retries, deadline extensions or removed assertions were introduced.

## Security findings

Known-secret and recognizable-key scans passed across all 20 existing revisions
and current tracked/untracked project files. No historic environment file or dump
was found. All 20 example environment values are blank. The original specification
and approved reference remain intact. Production dependency audit reports no known
vulnerabilities; the existing tested development-tool mitigation remains in place.

The Helius key stays in the worker environment. Fixed HTTPS origin, no redirects,
validated public addresses/signature cursors, bounded bodies/timeouts, persistent
daily quota, SQL parameters, and sanitized errors reviewed. Provenance stores a
canonical credential-free address endpoint. No arbitrary URL fetch, SQL tool,
command execution, traversal, signing, trading execution, or private-key code added.
Wallet routes are read-only and database-backed. Production auth/TLS remains Phase 8
scope; the current stack is local loopback HTTP.

## Data-quality findings

Provider-parsed transactions/transfers are AGGREGATED with separate block and
collection times. Derived behavior/relationships carry versioned provenance and
computation as-of time, with latest eligible input time separately visible. Failed,
future and expired inputs cannot support behavior/relationships. Native transfer
quantities are safe-integer lamports; token quantities are reported token units.
Assets are not summed into fabricated USD balances, flows or PnL.

Reputation weights follow the specification; all seven components and aggregate
remain unavailable, coverage zero and UNCALIBRATED. Behavior labels describe a
bounded sample, not profitability or lifetime style. Relationship/group evidence
does not establish ownership or insider status. Operator labels are unverified.
TRUNCATED persists after an observed gap; later small pages do not prove backfill.
Compacted counts describe observed records only. Wallet relationships are not used
to invent connected-holder concentrations or fill the narrative wallet-flow input.

## Resource concerns

No dependencies, runtime services or worker processes added. Four wallet tables
and four additive migrations bring the database to 25 tables/nine migrations.
Maximum eight active addresses, two 50-row pages/address, four requests/UTC day
globally, 500 retained transactions/address, 90-day raw-history policy, 100 response
details/address and 20 relationship edges/groups. Requests count against a durable
quota even when unsuccessful; oldest attempted addresses rotate fairly. Hourly
indexed retention handles inactive addresses without credentials, at most eight
expired addresses and 1,000 rows/address/cycle, respecting cancellation between
addresses. Monthly counts and retained identity metadata remain explicit Phase 8
operational retention concerns.

JSON observations are capped at 64 KiB; a fully saturated DTO could be large.
The current local deployment has no configured wallets, so live wallet workload,
provider quota cost and long-term two-vCPU/two-GB capacity are not certified here.
The existing four service limits total 1,300 MiB and two CPUs. Final local resource
snapshot after the production/recovery gate: PostgreSQL 43.34 MiB, web 52.56 MiB,
worker 50.30 MiB and Caddy 23.78 MiB (about 170 MiB total). This is a short local
sample after restart with live market bootstrap; worker used about half a CPU,
not a steady-state or saturated-wallet benchmark. Persistent database size was
30,219,287 bytes. Worker/web image sizes were 61,955,870/77,112,754 bytes.

Both final production images built successfully. All four services became healthy.
Worker SIGTERM exited zero, removed its heartbeat and made readiness return 503;
restart recovered. PostgreSQL outage returned sanitized 503 and recreation
preserved nine migrations, provider observations and the named volume. PostgreSQL
has no host port; web/worker run as node. Restart policies and 10 MiB × three-file
logs were verified. The application remains loopback-only and undeployed remotely.

## Design deviations

Ivory/off-white surfaces, restrained serif headings, muted accents, thin separators,
low radius and table-first research hierarchy preserved. Wallets/On-chain reuse
the existing shell and shared selection/query architecture. The inspector exposes
annotations, coverage, freshness, lineage, methodology and explicit uncertainty.
No decorative network graph, avatar or giant chat panel. Actual empty-state and
explicitly synthetic selected-wallet screenshots are inspected separately; fixtures
are never persisted into the production database or presented as live data.
Refreshed desktop and 390px mobile screenshots passed visual review, with no
document overflow or browser errors. The committed actual empty-state screenshot
is [Wallets](../../design/phase4-wallets.png). Selected synthetic evidence was
reviewed separately and explicitly labeled SYNTHETIC QA FIXTURE — NOT LIVE.

## Remaining limitations

Helius credentials and a tracked-wallet list were not supplied. Live Helius
integration is unverified; actual UI shows NOT_CONFIGURED with no live wallet rows.
The legacy endpoint is isolated behind the provider contract. Four requests/day
limits polling cadence and historical completeness; account billing is external
and no paid plan is purchased. Cost basis, outcomes, calibrated reputation,
beneficial ownership and complete position lifecycles remain unavailable.
VPS deployment and production access/backup/disk protections are not claimed.

## Recommendation

READY TO COMMIT. Local checks, recovery, security and visual review passed.
Push coherent Phase 4 commits, open PR, wait for every latest CI check on its exact
head, merge only green CI, then continue Phase 5 under the user's authorization.
