# Phase 0 QA report

Reviewed on 10 October 2026, Asia/Jakarta, against every section of
`specification/05_TESTING_QA_PROMPT.md`. Scope is the foundation and initial shell.
No market-core implementation or VPS deployment is included.

## Status

PASS for all applicable Phase 0 checks. Future-phase checks are explicitly
excluded below rather than represented as tested capabilities. The upstream
development dependency advisory remains disclosed with a tested local mitigation.

## Checks

| Check                       | Result                | Evidence                                                                                                                                         |
| --------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dependency consistency      | PASS                  | `pnpm install --frozen-lockfile`; strict peer validation; committed lockfile and local patch                                                     |
| Formatting and lint         | PASS                  | `pnpm format:check`; `pnpm lint` with zero warnings                                                                                              |
| Typecheck                   | PASS                  | Strict workspace types and test-source types; no broad suppressions                                                                              |
| Unit                        | PASS                  | 28 deterministic tests in four files; no external APIs                                                                                           |
| Integration                 | PASS                  | 10 tests against real PostgreSQL 16 in a guarded disposable database                                                                             |
| Migration consistency       | PASS                  | `pnpm db:check`; initial migration applied twice with one migration record                                                                       |
| Build                       | PASS                  | Worker bundle and Next standalone production build; clean Linux/Docker source contexts                                                           |
| Docker                      | PASS                  | Four healthy services, readiness, dependency failure/recovery, persistence, graceful worker shutdown, port isolation                             |
| E2E                         | PASS                  | 10 Playwright tests against the production server; Chromium, one worker                                                                          |
| Production dependency audit | PASS                  | `pnpm audit --prod`: no known vulnerabilities                                                                                                    |
| Full dependency audit       | MITIGATED / DISCLOSED | Registry reports one high advisory for development-only `braces@3.0.3`; no upstream fixed release; pinned depth guards and five regression tests |

GitHub Actions repeats lint/format, typecheck, unit, build, PostgreSQL integration,
browser smoke tests, and Docker readiness. All seven jobs passed on
[`fa5cf02`](https://github.com/Jertig/crypto-intelligence-terminal/actions/runs/37979753742).
The [Phase 0 PR](https://github.com/Jertig/crypto-intelligence-terminal/pull/1)
also runs the checks for each new head revision. CI failures were repaired without
disabling validation or tests. This report's subsequent commit changes only
documentation, framework guidance, and purposeful screenshots.

## Complete checklist review

1. **Repository health — PASS.** Reviewed dependency changes, scripts, environment,
   SQL migration/metadata, Docker, and CI. Scanned every Git revision for current
   local secret values and recognizable key patterns. No `.env`, keys, dumps,
   runtime database files, or build artifacts are committed. `.env.example` has
   13 blank values. Supplied text and approved PNG remain preserved, allowing
   Git line-ending normalization.
2. **Static checks — PASS.** Formatter, lint, strict types, frozen install, and
   migration consistency pass. No `any`, `@ts-ignore`, or disabled lint rules
   were added to bypass checks. Credential and dependency failures return
   intentional sanitized errors.
3. **Unit tests — PASS.** Provenance requirements, methodology-version rules,
   environment validation, readiness, exact stale boundary, invalid/future
   timestamps, configuration/health separation, command filtering, and dependency
   depth guards are deterministic. Indicator/scoring/retention logic does not
   exist yet.
4. **Provider tests — NOT APPLICABLE.** No adapters or live API calls are
   implemented. The observed provider-health contract is validated. Malformed,
   empty, rate-limit, timeout, stale, and reconnect adapter fixtures belong to
   Phase 1 and subsequent provider phases.
5. **Database tests — PASS.** Empty migration and repeat application, uniqueness,
   nonempty identifiers, valid status classes, observed-success requirements,
   timestamp preservation, bounded heartbeat upserts, negative heartbeat timing,
   instance-safe cleanup, and transaction rollback are covered. There are no
   market ingestion or retention tables to duplicate or delete.
6. **Integration — PASS.** Real PostgreSQL confirms the domain/schema boundary and
   worker persistence lifecycle. Docker verifies database → worker heartbeat →
   health API readiness. The provider-to-feature pipeline is outside Phase 0.
7. **Frontend — PASS.** Loading, empty, API error/retry, offline, and degraded
   operational states are exercised. Keyboard navigation and command filtering
   work. Sorting, selecting a market row, and populated inspector updates await
   real market data; no mock rows are substituted for them.
8. **Playwright — PASS.** Homepage, workspace navigation, command shortcuts,
   focus restoration, arrows/Enter/Escape, unavailable states, readiness semantics,
   404, 1366px/2560px layouts, and 390px mobile layout pass. Homepage checks collect
   uncaught browser and console errors. Screenshot capture collected zero
   uncaught browser errors across four actual Docker-backed views.
9. **Production build — PASS.** Both applications build. Next runs its standalone
   server with copied static assets; browser checks use production output. Docker
   excludes local dependencies/build output and installs the frozen dependency
   tree inside Linux images.
10. **Docker — PASS.** Web and worker images build; all four services boot healthy.
    Worker waits for PostgreSQL and migrates before boot; web waits for worker
    health. All services use `unless-stopped`, JSON logs capped at three 10 MB
    files, and memory limits. PostgreSQL has zero host port bindings in the base
    stack; only Caddy publishes `127.0.0.1:8080`. Worker SIGTERM exits 0 without
    OOM and removes its heartbeat. Stopping worker or PostgreSQL returns readiness
    503, then restart recovers. PostgreSQL recreation preserves the existing
    migration and zero provider rows; no volume was deleted.
11. **Resources — PASS for foundation.** One worker, one non-overlapping heartbeat
    every five seconds, two database connections per application, three-second
    query/connect limits, bounded command results, no REST fan-out, and no market
    tables. Runtime memory caps total 1,300 MiB. Local snapshots were roughly
    126–162 MiB combined; the foundation database was about 7.9 MB. These idle
    observations do not establish long-running growth or production-load behavior.
    Builds run sequentially and tests use one worker. Docker/OS overhead still
    needs headroom within the target 2 GB VPS.
12. **Data correctness — PASS.** No fabricated price, funding, OI, return, risk
    score, narrative, event, or wallet observation is present. Missing values are
    em dashes or explicit empty states. Runtime timestamps are actual observations;
    the clock uses WIB. The provenance schema requires provider, source,
    source/ingestion timestamps, quality, and methodology version where relevant.
13. **Methodology — PASS for scope.** No score or opaque model output is produced.
    Future calculation requirements are documented. Operational staleness has
    a tested 30-second threshold and rejects future/invalid timestamps.
14. **AI grounding — NOT APPLICABLE.** No LLM request or AI market output exists.
    Memo sections state missing evidence; they do not fabricate facts or
    counter-evidence. Full grounding tests belong to Phase 6.
15. **Security — PASS with disclosed dependency mitigation.** Environment
    credentials remain server-side and absent from client code/build context.
    SQL values are parameterized; routes are bounded, read-only, and sanitized.
    There is no arbitrary URL-fetch endpoint, command execution API, file path
    input, trading credential, or wallet-signing surface. Application containers
    run as `node`. Authentication, public TLS, and public-access rate controls
    are later production requirements; local access is loopback-only.
16. **UX — PASS.** Approved ivory colors, thin panel borders, compact information
    hierarchy, restrained green/gold accents, serif headings, tabular numbers,
    left navigation, right inspector, and keyboard command search are preserved.
    Screenshots of dashboard, palette, data status, and mobile were visually
    inspected. There is no decorative or invented market chart.
17. **Report and workflow — PASS.** This report records defects, security, data,
    resources, design, fixes, limitations, and the commit recommendation. Changes
    use coherent conventional commits on `chore/project-bootstrap`. Existing
    history is preserved; the PR stays unmerged pending approval.

## Defects

- **Critical:** none open.
- **High:** no unmitigated Phase 0 defect. The upstream `braces` development-tool
  advisory remains version-flagged; the local patch and regression tests mitigate
  its documented recursion failure. Patch maintenance is required until upstream
  provides a fixed release.
- **Medium:** none open within Phase 0. Production authentication, TLS, backups,
  retention, and sustained-load verification are future deliverables.
- **Low:** ESLint remains on the compatible 9.x line until Next's plugins declare
  next-major support. The approved reference's populated panels become honest
  empty states because no market providers exist yet.

## Security findings

No committed secrets or production credentials were found. Example environment
values stay blank. Production audit is clean. The full audit deliberately still
shows the upstream development advisory; it is neither muted nor misrepresented
as registry-clean. Details are in `dependency-security.md`.

## Data-quality findings

Database provider rows remain zero. Only operational heartbeat and migration
records exist. The design reference is not loaded by the application. Fixtures
are confined to deterministic tests and the disposable database. Operational
readiness never claims that a market provider is connected.

## Resource concerns

The local foundation is small and bounded. There is no long-running production
load result, ingestion-growth result, VPS memory measurement, or database
retention evidence yet. Later phases must budget tables and jobs before adding
ingestion; local idle snapshots are not a substitute for those checks.

## Design deviations

Reference market values and charts are replaced with explicit unavailable states.
Muted text and gold accents are darkened for readability. Mobile prioritizes the
inspector and memo, with compact navigation and no dense desktop scanner table.
All are intentional scope/accessibility choices, not alternate visual direction.

## Fixed during review

- Restored dependency verification after Docker/resource recovery without
  rewriting Git history.
- Kept the strict peer gate and selected the supported ESLint major.
- Patched deep brace recursion and replaced the vulnerable legacy esbuild version
  under Drizzle's development loader.
- Fixed Drizzle timestamp test boundaries using the actual ORM codec path.
- Fixed Next development environment loading and the standalone production
  launcher/static asset placement.
- Corrected the browser error selector to avoid Next's route-announcer node.
- Removed mobile tape overflow.
- Included the dependency patch in the Docker install layer.
- Corrected CI's database-port assertion: actual port bindings are inspected
  instead of assuming Compose's unpublished-port text is empty. Application
  readiness had already passed before that assertion failed.

## Remaining limitations

No live market providers, ingestion, charting, asset selection, scoring, wallet
intelligence, events, or AI analysis exist yet. Authentication, public TLS,
automatic backups/retention, and VPS deployment are not part of this phase.
The development advisory patch needs upstream follow-up. Browser coverage uses
Chromium; additional browsers and production load remain unverified.

## Recommendation

READY TO COMMIT. Push reviewed Phase 0 changes and require green GitHub checks.
STOP for the user's approval before Phase 1; do not merge or deploy automatically.
