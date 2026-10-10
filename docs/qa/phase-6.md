# Phase 6 QA review

## Status

PASS — complete local gate, including populated evidence, bounded cancellation
and refreshed desktop/mobile inspection. No live model call or VPS deployment.

## Checks

Frozen dependencies, migration consistency, format, lint, strict workspace/test
types, 125 unit tests, 57 real PostgreSQL integration tests, all 29 browser smoke
tests and clean production builds passed. Prior tests and deadlines are intact.
Provider fixtures cover bounded strict tool calls, valid and forged citations,
unsupported tools/assets/extra parameters, repeated/parallel calls, refusals,
incomplete output, malformed bodies, oversized responses, HTTP/rate-limit/network
errors and aborts. No model credentials or live external calls are needed.

Database tests exercise read-only row counts, scoped small projections, observation
period versus collection time, future exclusion, stale providers, canonical mint
identity and bounded wallet summaries. No tables or migrations were added; ten
existing migrations remain. Browser coverage checks all six memo sections,
missing keys/database, origin/body validation, retry, keyboard interaction and
390px mobile overflow. A cold integration run exceeded an existing test deadline;
a fresh complete sequential run passed unchanged deadlines and assertions.

## Defects

No known unresolved Critical or High defect. Meaningful defects below were fixed.

## Security findings

Allowlisted fixed parameterized SELECT queries only; no SQL/URL/command/file or
write tool. Model credentials are web-server-only, never public environment
variables or worker settings. Fixed api.openai.com HTTPS, redirect rejection,
30-second total deadline, bounded response/context/output and explicit opt-in.
One concurrent analysis and six submissions/minute per process; these limits reset
on restart and do not guarantee account spend. No automatic model calls. Strict
Origin/Host validation rejects foreign and rebound hosts; local requests require
HTTP loopback. Final production origin/auth is Phase 8. Public event citations are
displayed as text, never fetched. Errors omit questions, credentials and bodies.
Known-secret and recognizable-key scans passed across 28 historical revisions and
current files; no forbidden environment/dump/private-key file. All 22 example
values blank. Specification/reference preserved. Production dependency audit clean.

## Data-quality findings

Facts, Derived Signals, Interpretation, Counter-evidence, Confidence and Sources
are separate. Values/units/lineage are server formatted; the model selects only
known eligible IDs, never free factual prose. Future evidence is excluded, all
members of conflicting provider cohorts are marked, missing values stay null and
zero is preserved. Stale/missing/conflicting/forged IDs cannot support interpretation.
Confidence remains LIMITED or INSUFFICIENT, not a probability. No causal, pump,
ownership or insider claim. Each memo freezes an as-of time and must be rebuilt
for current evidence. Model failure preserves the deterministic evidence brief.

Risk uses only canonical wrapped-SOL mint identity; BTC/ETH risk mapping remains
unavailable. The four categories and same-pool DEX USD proxy retain prior limits.
Wallet tool returns retained observed counts, not raw histories, flows, valuations,
lifetime PnL or reputation claims. Macro periods are distinct from collection and
publication times. Evidence bounds and interpretation vocabulary are documented
in ai-analyst.md; no giant database dump is sent to a model.

## Resource concerns

Four services, one worker, no new table or third-party dependency. Seven selected
families × 24 evidence rows maximum, cached per memo. Fixed queries project small
data; no automatic analyst polling. Optional model uses at most seven reads plus
one final call, 1,500 output tokens/call, 64,000-character history and 256 KiB
response. A synthetic 168-row maximum envelope measured 103,157 bytes, 45.9 ms,
72,138,752-byte RSS and 3,448,120-byte heap growth locally. This is a synthetic
contract bound, not a live workload or a VPS capacity certification.
Both final production container builds passed. Four services became healthy;
two successive live-ingestion shutdown/recovery gates passed after the cancellation
fix. Worker exit was zero without OOM and its heartbeat was removed; database
outage returned sanitized 503, recreation preserved data and readiness recovered.
No PostgreSQL host port, non-root Node users, limits, restart policies and bounded
logs verified. Final short snapshot: Caddy 17.55 MiB, PostgreSQL 30.69 MiB, web
55.36 MiB, worker 47.34 MiB (about 151 MiB). Database 31,636,503 bytes; worker/web
images 61,967,639/77,159,689 bytes. This is not sustained VPS load evidence.

## Design deviations

Final actual and explicitly labeled fixture captures were visually inspected on
desktop and 390px mobile. Four combinations have no page overflow or uncaught
errors. Purposeful actual capture: design/phase6-analyst.png; synthetic captures
remain outside Git. Ivory shell, dense tables, restrained serif
headings, thin separators, muted accents and existing inspector are preserved.
The bounded question form has no giant chat panel, avatar or decorative chart.

## Fixed during review

Three-way provider conflict handling, future null exclusion, venue-specific market
IDs, canonical risk mint mapping, distinct liquidity-category/proxy IDs,
race-safe busy checks after body parsing, WIB
timestamp display and browser-facing origin matching. Next's internal normalized
URL caused a real valid-origin 403; fixed with regression coverage, preserving all
original browser assertions. No relaxed deadlines, ignored types or disabled tests.
The actual populated container exposed a duplicate risk evidence ID that an empty
database could not reveal. The real PostgreSQL test now verifies five unique risk
IDs and builds the full memo, so the failure cannot be hidden by query fallback.
Release titles use textual units rather than borrowing the event's numeric unit.
Risk-category projections preserve contributing source lineage and conservatively
age the oldest input; a fresh DEX observation cannot renew old GoPlus evidence.
The PostgreSQL regression covers a 45-minute-old security input with a fresh pool.
Visual review separated evidence IDs, states and input times onto compact lines
and wrapped long caveats, preserving internal mobile table scrolling.
Live startup work exposed a shutdown that exceeded Docker's grace period without
an OOM. Shutdown now closes the health listener and cancels the ingestion pool
before draining tasks, then removes only its own heartbeat on an independent
bounded cleanup connection. The original eight-second exit deadline and ten-second
Docker grace period remain. A real PostgreSQL regression proves pending work rolls
back, the worker heartbeat is removed and a peer heartbeat is preserved.

## Remaining limitations

Optional model credentials/model selection are absent; live model compatibility,
latency and grounding remain unverified. The deliberately constrained analyst is
not a general conversational agent. Helius/FRED credentials and sourced event
records remain absent; missing families are explicit. Memos are memory-only until
Phase 7 snapshots. Loopback local access is not production authentication. No VPS
deployment performed.

## Recommendation

READY TO COMMIT. Push coherent Phase 6 commits; merge only all latest green CI
checks on the exact pushed head before Phase 7.
