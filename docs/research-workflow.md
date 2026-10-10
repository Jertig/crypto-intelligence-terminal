# Research workflow

The four workspaces share PostgreSQL-backed single-operator records. Nothing is
seeded as live research. Notes are operator opinion, rendered as escaped plain
text. Watchlists use Binance base tickers; they do not establish on-chain identity
or expand the ingestion universe. An untracked ticker has unavailable pricing.
Saved queries contain an asset, question and selected analyst tools, never SQL.
Saving does not run the model. Running a loaded query explicitly uses the existing
analyst endpoint and its opt-in model configuration and rate limits.

Saved scanner views retain filter, sort direction and hidden columns. Their links
apply those settings to the existing screener. Asset identity cannot be hidden.
A deleted/unavailable view leaves the ordinary scanner usable.

## Immutable reports

Capture retrieves bounded structured evidence on the server without invoking AI.
Reports retain Facts, Derived Signals, Interpretation (explicitly unavailable
without a model call), Counter-evidence, Confidence and Sources. Each is frozen
at its as-of time: retained freshness states are historical, not live freshness.
Latest-only market observations can disappear between ingestion and retrieval;
absence is preserved, not reconstructed. The archive returns only typed headers;
opening one report fetches its bounded body and verifies a canonical SHA-256
digest independent of JSONB key order. A database trigger rejects all updates;
operator deletion and retention remain permitted. Digests detect inconsistency,
not a malicious database administrator who can alter both content and digest.

## Alert methodology — research-alerts:v1

The existing worker evaluates at most 20 enabled rules serially once per minute.
No external notification, model request, trade or signing action exists.

| Rule             | Evidence gate and condition                                                                                                                                                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Threshold        | Exactly one fresh numeric price (USDT), 24-hour change (%) or 1-hour return (%) from a successful scoped tool; strict above/below comparison.                                                                                                                                                                           |
| Data risk        | A successful empty query or missing/stale/conflicting evidence triggers the coverage condition. Storage failure or unconfigured tools remain UNKNOWN. Future-only inputs are excluded and count as absence.                                                                                                             |
| Provider down    | Recent recorded provider-health update; any observed non-HEALTHY state triggers. Missing/old/future updates are UNKNOWN. Missing credentials are configuration failure, not proof of remote outage.                                                                                                                     |
| Narrative change | Current narrative methodology, full coverage and input age at most 20 minutes. First observation establishes a baseline. Absolute score-point change against previous known input triggers at the configured threshold. Same-input reevaluation retains its result; incomplete inputs never replace the known baseline. |
| Risk             | One fresh, complete score in the explicitly selected contract, ownership, liquidity or market-structure category, at or above the threshold. No overall safety score. Existing canonical SOL mapping only; unmapped BTC/ETH evidence remains UNKNOWN.                                                                   |
| Liquidity        | Fresh SOL same-pool USD liquidity change at or below negative decline threshold. DEX proxy only, not executable depth, slippage, withdrawals or ownership evidence.                                                                                                                                                     |

Each evaluation records version, condition explanation, value/unit, input time,
evaluation time and bounded evidence references. Unknown numeric inputs remain
null. UNKNOWN never changes the last known clear/triggered state and never
produces recovery. Initial/repeated CLEAR is silent; entering TRIGGERED creates
one notification, and a subsequent known CLEAR creates RECOVERED. Repeated
TRIGGERED is silent. A gap in evidence does not produce repeat notifications.
Disabled rules are inert. A stale evaluator is labeled after two minutes; the
UI polls alert records at most once per minute. These are descriptive monitored
conditions, not calibrated forecasts or causal conclusions.

## Storage and concurrency

Eight additive typed tables preserve the prior schema and methodology. Limits:
20 lists × 30 tickers, 100 notes × 3,000 characters, 50 saved queries, 50 views,
50 reports (120,000-byte capture envelope; 128 KiB database bound), 20 rules,
and 1,000 notifications. List counts and mutations share a transaction-scoped
advisory lock; item requests are idempotent. Note edits require the loaded update
timestamp, returning conflict rather than silently overwriting an intervening
edit. Versions advance by at least one millisecond even on a repeated/backward
server clock. Alert persistence rechecks enabled/configuration state under the same lock.
The worker caches bounded analyst projections per asset for a batch (maximum
three assets), plus one provider-health and one bounded intelligence read.
Existing pool limits and query deadlines are unchanged.

Hourly credential-independent retention deletes reports older than 90 days and
notifications older than 30 days, then keeps the latest 1,000 notifications.
Notes, queries, views and watchlists remain until deleted within hard count caps.
The index returns at most 100 recent notifications and never report bodies.
Maximum compact report bodies alone are roughly 6 MiB; operator text and small
rules add bounded overhead, with PostgreSQL indexes/MVCC/backup overhead separate.

## Security and limits

Strict discriminated inputs, allowlisted parameterized queries, 16 KiB request
bodies, same-Origin/Host validation, one concurrent mutation and 30 attempts per
minute/process. Errors omit database details, note bodies and credentials. Rate
limits reset on restart; they are not a distributed abuse/spend guarantee.
Local Compose is loopback-only. Shared single-operator access needs Phase 8's
authenticated HTTPS gateway before public exposure; there is no multi-user
ownership or fine-grained account isolation. Backup retained reports before their
expiry if longer history is required. No external messaging service is configured.
