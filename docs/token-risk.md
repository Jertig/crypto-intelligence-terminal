# Token risk and liquidity

Phase 3 adds DEX Screener and optional GoPlus evidence to the existing single
worker. `/api/tokens` reads PostgreSQL only; opening a workspace never fans out to
providers. Default configured mints are wrapped SOL and USDC on Solana, verified
against [Solana](https://solana.com/docs/tokens/basics/sync-native) and
[Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses).
These are a bounded demonstration universe, not a token discovery index.

Set `TOKEN_UNIVERSE` to comma-separated `chain:address` entries (maximum eight,
unique identities). Solana addresses must decode to 32 bytes; EVM addresses must
be 20-byte hexadecimal. Supported chains: solana, ethereum, base, bsc.
`TOKEN_INGESTION_ENABLED=false` disables this coordinator. Setting
`MARKET_INGESTION_ENABLED=false` also disables it unless explicitly enabled.
`GOPLUS_ENABLED=false` disables optional security collection. The public endpoints
currently accept unauthenticated calls; an optional `GOPLUS_API_KEY` stays in the
worker environment and is never sent to DEX Screener or the browser.

The [DEX Screener API](https://docs.dexscreener.com/api/reference) is polled every
15 minutes with one request per configured chain, at most four. Only selected
base-token pairs qualify; quote-token prices are never inverted. Keep the three
largest reported-liquidity pools per token. The largest current pool supplies
liquidity indicators. Market cap and FDV remain separate nullable fields. If
reported market cap exceeds reported FDV, a supply/scope discrepancy is shown and
the liquidity/market-cap component stays unavailable. We do not reconcile those
aggregates or infer that either value has verified token-supply scope.
GoPlus polls each selected token hourly, sequentially with one-second spacing;
missing tokens produce partial coverage. Failures back off, respect bounded
Retry-After, and cannot make a previous observation fresh.

Requests allow only the two official HTTPS origins, reject redirects, time out
after eight seconds and bound responses to 2 MiB. Malformed selected records fail
the batch. Providers expose aggregate polling timestamps, not upstream event
timestamps: the UI calls these collection times. DEX freshness is 30 minutes,
GoPlus two hours. Old observations remain visibly stale before the bounded
24-hour query window excludes them. Provider and calculation freshness differ.

## Four explainable categories

`token-risk:v1` computes separate CONTRACT, OWNERSHIP, LIQUIDITY and
MARKET_STRUCTURE indicators, never an opaque combined risk number. Every
component exposes weight, input value, unit, availability, reason and provenance.
All component indicators clip to [0,100]. Coverage is the sum of observed
component weights. A full category indicator exists only at complete coverage;
partial indicator = sum(weight × indicator) / coverage. Zero coverage is null.
These descriptive indicators are uncalibrated and are not probabilities.

| Category         | Inputs, weights and transforms                                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract         | Mint .20; freeze .20; mutable balance .20; close .10; fee upgrade .10; hook upgrade .10; nontransferable .05; default-state upgrade .05. Known provider booleans map false→0, true→100. Omitted/unsupported flags stay null.                                         |
| Ownership        | Top-ten reported supply concentration .40 × share ×100. Creator, connected-wallet and fresh-wallet concentration .20 each remain unavailable without observations.                                                                                                   |
| Liquidity        | Same-pool 1h liquidity change .40 × clip(-2 × change%); rolling 24h volume/current liquidity .25 × clip(10 × ratio); liquidity/reported market cap .20 × clip(100 - ratio/.05 ×100); selected-pool LP concentration .15 remains unavailable.                         |
| Market structure | OI growth .30 × clip(2 ×24h change%); funding extreme .20 × clip(abs(z)/3 ×100); falling 24h price plus positive OI divergence .30 × clip(2 × OI change%), otherwise zero only if both inputs exist; base-volume collapse .20 × clip((1 - acceleration ratio) ×100). |

Only the verified wrapped SOL mint maps explicitly to existing SOLUSDT features;
all other tokens retain missing CEX inputs. No symbol matching invents identity.
Feature calculations must be available and at most 15 minutes old.

GoPlus [Solana fields](https://docs.gopluslabs.io/reference/response-detail-1)
describe authorities. Issuer mint/freeze controls can be legitimate: a true flag
is not an allegation. EVM mint, owner-balance, selfdestruct and slippage flags use
their reported meanings; EVM freeze/hook/nontransfer/default-state flags stay
unavailable where equivalent capabilities are not documented. Provider token
recognition is never presented as a guarantee. Top-ten supply share requires
positive total supply and ten valid fractional shares, or a documented total
holder count no larger than the returned list. Incomplete lists and zero supply
stay null. Addresses can be custodians or pools, not independent beneficial owners.
GoPlus largest-pool LP holders cannot reliably be attributed to the selected DEX
pool, so selected-pool LP concentration remains null.

## Liquidity vacuum v1

`liquidity-vacuum:v1` is explicitly a DEX-pool proxy. It requires a fresh current
pool, nonzero liquidity, reported rolling volume, and the same pool's latest
observation between 60 and 75 minutes before the current collection. Recalculating
cached evidence cannot shorten this window. Switching pools cannot
substitute for history. Change =100 × (current liquidity/prior liquidity -1);
turnover = rolling 24h volume/current liquidity.

| State          | Rule, evaluated in this order            |
| -------------- | ---------------------------------------- |
| UNAVAILABLE    | Missing valid history or turnover inputs |
| CRITICAL       | Change ≤ -30% and turnover ≥5            |
| VACUUM_FORMING | Change ≤ -10% and turnover ≥3            |
| THINNING       | Change ≤ -5% or turnover ≥2              |
| HEALTHY        | Other observed same-pool combinations    |

HEALTHY describes this limited proxy, not token safety. USD changes can reflect
token valuation as well as pool balances; they do not establish LP withdrawals.
USD pool liquidity is not
executable depth. CEX spread/depth, exchange inflows, wallet distribution and
verified LP attribution remain absent. Newly collected tokens need an hour of
real persisted history; no warm-up values are manufactured.

## Storage and resource bounds

Five additional tables retain configured identity, selected pools, typed 15-minute
DEX observations, typed hourly security snapshots, and versioned 15-minute risk
snapshots. Timestamp-guarded upserts prevent late ingestion from inflating or
replacing newer history. Transactions preserve identity and rollback failures.
Changing the universe deactivates old identities while preserving observations.
Current queries return at most eight tokens, 24 pools, eight security snapshots
and eight risk snapshots. All observation retention is 180 days, deleted hourly
in batches of at most 5,000 per table. Component JSON is limited to 64 KiB.
No extra runtime, full-chain index, signing capability or trading endpoint exists.
At the maximum universe, DEX rows are bounded by 24 pools ×96/day ×180 days
before pool turnover; actual resource use and identity growth need operational
monitoring. The resource review is a local snapshot, not VPS capacity certification.
