# Phase 3 QA

## Status

PASS — final local gate completed 10 October 2026 WIB. Latest head CI must
separately pass before merge. Phases 0–2 and their history remain preserved.

## Checks

Formatting, ESLint, strict workspace/test types, frozen installation, migration
consistency, production build and production dependency audit pass.
75 deterministic unit tests pass, including the token provider/risk cases.
32 guarded PostgreSQL integration tests pass: five migrations from empty,
provider fixture → normalization → persistence → calculation → query DTO,
idempotency, source-time upserts, future filtering, immutable pool identity,
transaction rollback, constraints, active methodology, cancellation and the
180-day retention boundary. Existing tests and their five-second deadlines
remain unchanged. One cold resource-contention run timed out in the earlier
feature pipeline and caused a follow-on duplicate; the quiet full rerun passed
after stopping preview services. No assertions or time limits were relaxed.
19 browser smoke tests pass. The three token/source tests additionally pass
after strengthening the Risk URL/heading assertion. Coverage includes keyboard
selection, filtering/sorting, source independence, inspector/navigation,
discrepancy disclosure, stale/partial/missing inputs, retry and mobile overflow.

Final worker and web production containers build and boot. Four services healthy;
worker shuts down with exit zero and removes its own heartbeat. Readiness rejects
a stopped worker, then recovers. Database outage returns sanitized unavailable;
recreation preserves five migrations and observations. Base PostgreSQL has zero
host-port bindings. Restart policies, CPU/RAM limits, nonroot application users
and 10 MiB ×3 rotating logs verified. Test-only loopback database exposure was
removed after QA. No persistent volume was deleted.

## Defects

No open critical/high product defect identified.

## Security findings

Current working files and all sixteen existing revisions scanned against actual
ignored secret values and recognizable private credential patterns: no leaks,
private keys or forbidden environment/dump files. Blank example credentials,
original package text and approved image verified. Production audit clean;
existing development-only advisory mitigation remains tested.
Requests allow only official HTTPS origins, reject redirects and network-path
URLs, cap bodies at 2 MiB and time out after eight seconds. Optional GoPlus
credentials are server-only and never sent to DEX Screener. Query APIs are
database-only, bounded, parameterized and return sanitized errors. No signing,
private-key handling, trading, command execution or AI provider was added.
Production authentication/TLS remain Phase 8; this preview is loopback-only.

## Data-quality and methodology findings

Actual local public responses persisted two selected pools and two security
records for the verified SOL/USDC mints. Contract, ownership, liquidity and
market-structure indicators are separate, with weights, units, reasons and
source evidence. Unknown/unsupported flags remain null, not false. Provider
authorities and recognition do not establish maliciousness or safety.
Partial coverage withholds full indicators. No overall composite risk score.

USDC's reported market cap exceeded reported FDV. Both aggregates remain visible;
the liquidity/market-cap component is withheld and the discrepancy disclosed.
We do not infer compatible supply scopes or substitute FDV. Wrapped SOL's
zero-supply holder report does not produce a concentration value. GoPlus LP
holders cannot reliably be attributed to the selected DEX pool and stay absent.
Source time means collection time for these aggregates, explicitly labeled.
Cached data ages, including stored vacuum states. Same-pool one-hour history is
anchored to current collection, not a later recalculation clock.
Both live vacuum proxies are unavailable during warm-up. USD changes may reflect
valuation, not withdrawals; missing spread/depth and wallet distribution prevent
a market-wide conclusion. All formulas, thresholds, weights, versions and limits
are documented in token-risk.md and exposed in the inspector.

## AI grounding

No model called or interpretation manufactured. Deterministic indicators expose
missing evidence and uncalibrated partial values; no unsupported probability.

## Resource concerns

No runtime or dependency added. Maximum eight tokens, three current pools each,
four DEX chain requests per 15 minutes, eight sequential security requests hourly.
Response/query/batch bounds, source-aware backoff and hourly 180-day retention
reviewed. Component JSON capped at 64 KiB; inactive identity growth and the final
database budget remain Phase 8 operational concerns.
Local warm snapshot: PostgreSQL 46.76 MiB, web 53.23 MiB, worker 46.32 MiB,
Caddy 14.09 MiB; corresponding CPU .19%, 1.55%, .72%, 0%. Configured service memory
limits total 1,300 MiB. Database 28.6 MB at capture; token DEX stored row bytes
1,164 and risk stored row bytes 10,440, before relation/index overhead. Production
application images approximately 59 MiB worker and 74 MiB web. These are local
snapshots, not VPS capacity certification. Host builds/tests remain sequential.

## Design deviations

No material deviation from approved ivory institutional direction. Desktop and
390px mobile inspected: serif headings, dense separate component tables, thin
separators, muted accents, compact inspector, wrapping addresses and internal
table scrolling. No page overflow or uncaught browser error. Actual screenshots:
`design/phase3-tokens.png`; full desktop Risk/mobile evidence also captured locally.

## Fixed during review

Unknown authority semantics, zero/partial holder counts, floating weight totals,
coherent score/coverage validation, network-path origin escape, stale vacuum
display, collection-anchored comparisons, independent provider status, command
availability labels, market-cap/FDV discrepancy and screenshot navigation timing.

## Remaining limitations

DEX aggregates have unknown upstream event time and unverified supply scope.
The bounded default universe is not discovery coverage. Executable depth,
verified selected-pool LP attribution and beneficial-owner links are absent.
Futures timeouts limit market-structure evidence. An hour of real same-pool
history is required; no synthetic warm-up is seeded. No production deployment,
authentication/TLS, backup or long-term capacity certification is claimed here.

## Recommendation

READY TO COMMIT. Push coherent Phase 3 commits and merge only latest green CI,
then continue Phase 4 automatically under the user's authorization.
