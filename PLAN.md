# Active implementation plan

The attached work package is the authoritative specification. The user's explicit
scope and model request take precedence over its recommendations.

## Approved sequence

Phase 0 is approved and merged. Complete Phases 1–8 sequentially, running each
phase's full QA gate and merging only green CI. Do not purchase services, handle
private keys, automate trading, fabricate market facts, or deploy to the VPS
without deployment authorization. Missing optional credentials do not block
independent work; document them and preserve explicit unavailable states.

## Completed Phase 8 bounded plan

Phase 7 merged through PR #8 after fourteen exact-head green checks. Preserve all
prior contracts and coverage. Add four-service production Compose, secure gateway
HTTPS, restricted runtime roles, explicit administrator migrations, resource/log
bounds, storage protection, credential-independent cleanup, bounded backup/timer
and disposable restore verification. Add operational status to the existing ivory
terminal, complete provider/AI/resource/security/visual reviews, document recovery
and finish the portfolio. Require full QA and exact-head green CI before merge,
then audit main. No VPS deployment, purchases or new heavy infrastructure.

## Completed Phase 7 plan

Preserve all merged work. Add typed bounded watchlists, notes with edit conflicts,
structured saved queries, functional scanner views, frozen evidence reports and
deterministic in-app alerts. Reuse the existing worker and analyst renderer;
UNKNOWN preserves missing inputs and never generates a recovery. Credential-free
retention, no model calls for capture, no external notifications or execution.
Complete all QA/security/resource/visual checks and exact-head green CI before
merging and starting Phase 8 production hardening. No VPS deployment authorized.

## Completed Phase 6 plan

Preserve the merged Phase 5 architecture and all coverage. Add read-only scoped
query contracts over small structured evidence, deterministic provenance/freshness
and conflict gates, an optional fixed-origin Responses adapter, and the six-part
analyst memo. Model output selects validated evidence IDs; server-derived factual
values and bounded interpretation templates cannot be replaced by free prose.
No new runtime service or third-party dependency. Missing model credentials keep
the evidence brief useful and explicitly withhold AI interpretation. Verify missing,
stale, conflicting, unavailable and adversarial inputs; complete all QA, documents,
visual/security/resource review and latest-head CI before Phase 7.

## Completed Phase 5 plan

Preserve the merged architecture and prior coverage. Add bounded FRED observations
and locally observed revisions, immutable public-source manual events, transparent
impact windows, descriptive cross-market statistics and ivory research tables.
Missing credentials and incomplete release/market evidence remain unavailable.
Run the complete gate, commit coherently, push, PR and merge only latest green CI
before Phase 6. Production deployment remains outside the authorized scope.

## Completed Phase 4 plan

1. Complete Phase 4 only on feat/wallet-intelligence: bounded Helius adapter,
   tracked wallets, transaction/transfer persistence and compaction, labels,
   explainable behavior/reputation methodology, actual relationships, explorer.
2. Preserve unavailable evidence, uncalibrated scores and missing credentials;
   no full-chain indexing, ownership/insider allegations or signing/trading.
3. Run the complete 05_TESTING_QA_PROMPT.md gate, fix defects, inspect ivory UI,
   document limitations/resource/security findings, commit coherently and push.
4. Open PR and merge only all latest green CI checks on the exact branch head.
5. Continue Phases 5, 6, 7 and 8 in order, with one bounded branch and full QA
   each. No paid purchases, secret commits, destructive history rewrites or VPS
   deployment. Finish with the repository-wide audit and final report.

## Completed Phase 3 plan

1. Reuse existing domain/provider/database contracts and the single worker.
   Add fixed-origin DEX Screener and optional GoPlus adapters, timeouts, rate-limit
   handling, bounded responses and explicit missing fields.
2. Track maximum eight configured Solana/EVM tokens and three selected pools per
   token, defaulting to verified wrapped SOL and native Solana USDC. Persist typed
   pool/security observations and versioned risk snapshots; no whole-chain crawl.
3. Keep contract capability, ownership, liquidity and market-structure indicators
   separate. Expose weights, coverage, provenance, limitations and partial values.
   Never turn provider flags into allegations or missing fields into safety.
4. Define liquidity-vacuum v1 using same-pool historical liquidity/turnover;
   require observed history and disclose absent depth/spread/wallet evidence.
5. Deliver dense Tokens/Risk workspaces and an evidence inspector. Run full QA,
   review resources/security/design, document, commit coherently, push, PR and
   merge only latest green CI before Phase 4.

## Completed Phase 2 plan

Compute closed-bar features and sampled breadth/regime with strict evidence
gates. Persist versioned typed snapshots, curated weighted taxonomy and
explanations. Reuse the single worker and query layer. Deliver dense narrative
matrix/detail and selected feature inspection. Document all formulas and missing
inputs. Complete the full QA gate, push coherent commits, open a PR, merge only
latest green CI, then begin Phase 3. Wallet/protocol component inputs remain
unavailable until their later bounded implementation.

## Completed Phase 1 plan

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
