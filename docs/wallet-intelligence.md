# Solana wallet intelligence

The worker reads only explicitly configured public addresses. There is no full-chain
indexing, account signing, transaction submission, private-key handling, or trading.
Helius is optional. Its missing credential does not interrupt market/token ingestion.

## Configuration and provider boundary

Set `HELIUS_API_KEY` only in the ignored server environment. Set `TRACKED_WALLETS`
to a JSON array with up to eight unique Solana addresses and optional `label` and
`labelSource` strings. Default is an empty array; no example wallet is activated.
Operator labels are annotations, not verified identities. Invalid configuration
fails validation; malformed provider responses never become persisted observations.

The adapter implements `WalletProvider` using the documented Helius Enhanced
Transactions address endpoint at `https://api.helius.xyz`. This is currently a legacy
API, isolated behind the interface so another documented endpoint can replace it.
Requests include finalized commitment, related token accounts with balance changes,
50 rows/page, and a validated signature cursor. There are at most two sequential
pages per address, 128 transfers per transaction, a 2 MiB response limit, an eight
second timeout, and no redirects. No arbitrary origin or request-time provider
fan-out is exposed. API-key query parameters are never copied into provenance or
logs; failures use sanitized codes. Provider parsed types/transfers are AGGREGATED,
with on-chain block time as source timestamp and separate collection time.

Reference: [Helius address history](https://www.helius.dev/docs/api-reference/enhanced-transactions/gettransactionsbyaddress).
Plan availability and billing can change; inspect the account quota before enabling
live ingestion. The project never purchases or enables paid plans.

## Sampling and resource policy

The scheduler checks every 15 minutes. A persistent PostgreSQL budget allows **four
requests per UTC day across all tracked addresses**, including failed requests.
Least-recently attempted addresses run first, so a small budget rotates
the tracked universe, including when some addresses fail repeatedly. Attempt time
is separate from successful poll freshness. Budget exhaustion is an explicit provider failure/degradation,
not a claim that activity stopped. The conservative default permits at most 124
requests in a 31-day month. It does not guarantee a provider bill or account quota;
page prices and other account usage are external to this project.

If page two fails, valid page-one evidence is retained with TRUNCATED coverage.
Saturated two-page samples also set TRUNCATED. Once a gap is observed, the wallet
remains marked TRUNCATED; a later small page cannot prove the gap was backfilled.
Initial coverage BOUNDED is deliberately not COMPLETE or chain-wide coverage.
No balances, net USD flow, cost basis, or historical performance are reconstructed
from this limited sample. Token transfers use provider-reported token units and
native transfers use exact safe-integer lamports; mixed assets are never summed.

Each address retains at most 500 transactions with a 90-day raw-history policy, with a response
limit of 100 transaction details. Indexed hourly pruning runs independently of
credentials or successful polls, including inactive addresses; up to eight expired
addresses and 1,000 rows per address per cycle. Backlogs drain in subsequent cycles.
Compaction and deletion share one transaction and a per-address transaction lock
prevents concurrent pruners from recounting the same observations.
Monthly summaries retain only observed transaction/failed counts and time bounds,
not synthetic balances or chain-wide totals. Replays below the compaction watermark
are excluded rather than counted again; late unseen transactions below it may be
omitted. The first-observed time is preserved and never labeled account creation.
Inactive configurations preserve historical evidence. Phase 8 extends global
retention/disk protections; inactive identities and monthly summaries must also be
covered by those operational limits.

## Behavior and reputation

`wallet-evidence:v1` uses unique successful transactions in the retained 30-day
sample, excludes future/failed records, and requires at least five observations.
At least three events and a dominant share of 50% produce LIQUIDITY_PROVIDER for
ADD_LIQUIDITY, REMOVE_LIQUIDITY, ADD_BALANCE_LIQUIDITY, ADD_IMBALANCE_LIQUIDITY,
or ADD_LIQUIDITY_ONE_SIDE; SWAP_ACTIVE for SWAP, or TRANSFER_ACTIVE for TRANSFER.
Unknown provider type names do not become liquidity behavior merely because they
contain a matching word.
Otherwise the result is UNCLASSIFIED. These are descriptive sample inferences.
Derived analysis carries the shared provenance contract: computation as-of time,
DERIVED quality and methodology version, with the latest eligible input block time
shown separately. A recent computation does not refresh an old provider poll.
There is no unsupported sniper, early-buyer, passive-holder, insider, or profitability
classification. No USD buy/sell intent is inferred from transfer direction.

`wallet-reputation:v1` preserves the specification's conceptual weights: realized
performance 25%, early-entry quality 20%, consistency 15%, capital efficiency 15%,
rug avoidance 10%, holding discipline 10%, cluster confidence 5%. All values and the
aggregate score are unavailable, coverage zero, state UNCALIBRATED. Each component
explains its missing evidence. Cost basis, outcomes, position lifecycles, launch
timing, and validated ownership/performance datasets are absent. The specification
requires backtesting/calibration before a meaningful reputation score; these are
deferred explicitly rather than replaced with an activity count proxy.

## Relationships and explorer

An edge `frequent_counterparty` requires positive direct transfers in at least
three distinct successful transactions. Duplicate legs count once per signature;
zero values and self transfers do not create evidence. At most 20 edges are returned
per wallet, with three supporting public transaction links. `wallet-relationships:v1`
groups tracked addresses that share a supported frequent counterparty. A shared
counterparty may be a router, exchange, or service, and is not common-owner proof.
Other graph edge types remain unavailable without their required evidence.

The Wallets/On-chain workspace provides filtering, activity sorting, arrow-key
selection, activity and transfer tables, relationship groups, component weights,
public explorer links, labels/provenance, coverage and last-poll freshness. Stale,
empty, loading, partial and unavailable states are explicit. Mobile tables scroll
internally, with the evidence inspector below the workspace. No decorative graph.

## Current limitation

No Helius credential or tracked-wallet list was supplied locally. The actual
production interface shows unavailable configuration and no fabricated activity.
Provider/ingestion/classification/relationship/retention tests use explicit synthetic
fixtures. This validates implementation behavior, not a successful live Helius
integration or calibrated wallet performance. Existing token risk remains separate;
these relationship samples do not supply connected-holder concentration estimates.
