# ARCHITECTURE AND DATA SPECIFICATION

## 1. System topology

External Sources
→ Provider Adapters
→ Ingestion / Streaming Worker
→ Normalization
→ PostgreSQL
→ Feature Engine
→ Signal / Intelligence Engine
→ Query/API Layer
→ Web Terminal + AI Tools

Keep infrastructure intentionally small.

Initial runtime services:

- `web`
- `worker`
- `postgres`
- `caddy`

---

# 2. Data providers

## Binance

Primary market and derivatives provider.

Use for:

- spot prices
- perpetual prices
- candles
- mark price
- funding
- open interest
- 24h statistics
- selected realtime streams

Requirements:

- WebSocket reconnect
- resubscribe after reconnect
- heartbeat/staleness checks
- backoff strategy
- provider health state
- rate-limit awareness

Do not rely exclusively on request-time REST fan-out for the UI.

---

## CoinGecko

Use mainly for:

- canonical asset identity
- token metadata
- market cap
- circulating supply
- categories
- aggregate fallback values

Not the primary realtime feed.

Cache aggressively according to data freshness requirements.

---

## DEX Screener

Use for:

- DEX pairs
- liquidity
- DEX price
- DEX volume
- pair age/creation
- low-cap market discovery

Avoid high-frequency unnecessary polling.

---

## Helius

Solana-first on-chain provider.

Use for selected:

- tracked wallet transactions
- token transfers
- account activity
- asset metadata
- subscriptions for explicitly tracked entities

Do not index the entire Solana chain.

The tracked universe must remain bounded.

---

## DefiLlama

Use free/public endpoints initially for:

- protocol TVL
- chain TVL
- stablecoin metrics
- selected protocol/activity metrics
- yield/fees where practical

Do not pay for premium endpoints in the initial phase.

---

## FRED

Use for macro research:

- Fed policy series
- Treasury yields
- CPI
- PCE
- unemployment
- financial conditions
- liquidity-related series
- historical economic observations

Preserve observation dates and release/revision semantics where relevant.

---

## GoPlus

Optional security/risk provider.

Treat returned values as provider-derived signals.

Never convert third-party security flags into definitive allegations.

---

# 3. Provider contracts

Use explicit domain interfaces.

Example:

```ts
interface MarketProvider {
  health(): Promise<ProviderHealth>;
  getMarkets(): Promise<Market[]>;
  getCandles(input: CandleRequest): Promise<Candle[]>;
  subscribeTickers(input: TickerSubscription): AsyncIterable<Ticker>;
}
```

Create equivalent interfaces for:

- on-chain providers
- protocol providers
- macro providers
- security providers

Provider-specific schemas must be normalized before entering core domain logic.

---

# 4. PostgreSQL schema

Initial conceptual tables:

## Core identity

- assets
- venues
- markets

## Market

- ohlcv
- market_snapshots
- funding_rates
- open_interest
- dex_pairs

## Wallet intelligence

- wallets
- wallet_labels
- wallet_transactions
- wallet_positions
- wallet_clusters
- wallet_cluster_edges

## Protocol/chain

- protocol_metrics
- chain_metrics

## Events

- events
- event_impacts

## Narratives

- narratives
- asset_narratives
- narrative_snapshots

## Intelligence

- risk_snapshots
- signal_snapshots
- signal_explanations
- feature_snapshots

## Reliability

- provider_health
- ingestion_runs

## User/product

- watchlists
- watchlist_items
- alerts
- research_notes
- ai_queries

Use database migrations.

Do not store large JSON blobs when typed columns are more appropriate.

JSONB is acceptable for provider metadata or flexible secondary attributes.

---

# 5. Provenance model

Important datapoints must support:

- source
- provider identifier
- source timestamp
- ingestion timestamp
- quality class
- methodology version if derived
- revision if appropriate

Quality classes:

- DIRECT
- AGGREGATED
- DERIVED
- ESTIMATED
- AI_INTERPRETATION

The UI must make this visible where useful.

---

# 6. Data retention

Prevent another disk-growth incident.

Suggested initial retention:

| Dataset | Retention |
|---|---|
| transient raw websocket messages | memory / minutes |
| 1m OHLCV | 30 days |
| 5m OHLCV | 180 days |
| 1h OHLCV | 2 years |
| daily OHLCV | permanent |
| funding snapshots | 1 year |
| OI snapshots | 1 year |
| tracked-wallet events | retained but compacted |
| feature snapshots | 180 days |
| signal snapshots | 180 days |
| application logs | 14 days |
| ingestion logs | 14 days |

Retention jobs must be explicit, tested, and observable.

Target initial database size:

< 8 GB

Disk thresholds:

- 70%: warning
- 80%: urgent warning
- 90%: ingestion degradation / protective action

Do not silently let storage reach 100%.

---

# 7. Feature engine

Examples:

- return_5m
- return_1h
- return_24h
- volume_zscore
- volume_acceleration
- oi_change_1h
- oi_change_24h
- funding_zscore
- perp_basis
- relative_strength_btc
- relative_strength_sector
- btc_corr_30d
- dex_liquidity_change
- cex_dex_spread
- wallet_net_flow
- tracked_smart_wallet_count
- protocol_tvl_change
- stablecoin_supply_change

Every derived feature must have:

- name
- version
- inputs
- formula
- unit
- test cases

Example:

`relative_strength_btc:v1`

---

# 8. Narrative Rotation Engine

Initial taxonomy:

- AI
- Meme
- RWA
- DeFi
- L1
- L2
- DePIN
- Gaming
- Privacy
- DEX
- Perp DEX
- Restaking
- Stablecoin
- Modular
- Oracle

Allow weighted exposure.

Example:

RNDR:
- AI 0.70
- DePIN 0.30

Initial conceptual score:

30% relative price strength  
20% volume acceleration  
15% OI growth  
10% funding positioning  
15% wallet inflow  
10% protocol/on-chain activity

Do not hardcode the score as eternal truth.

Implement methodology versioning and component-level explanations.

A user should be able to inspect why a narrative scored highly.

---

# 9. Wallet Intelligence

Solana first.

Tracked wallet fields may include:

- address
- label
- cluster_id
- first_seen
- activity style
- realized PnL estimate
- unrealized PnL estimate
- win rate
- median entry lead
- rug exposure
- reputation score
- confidence

Possible behavior classes:

- EARLY_BUYER
- MOMENTUM_CHASER
- ROTATOR
- LIQUIDITY_PROVIDER
- DISTRIBUTOR
- SNIPER_LIKE
- MARKET_MAKER_LIKE
- PASSIVE_HOLDER

Avoid definitive "insider" claims.

Use "insider-like behavior" only if methodology supports it and clearly mark as an inference.

---

# 10. Wallet Reputation

Conceptual components:

25% realized performance  
20% early-entry quality  
15% consistency  
15% capital efficiency  
10% rug avoidance  
10% holding discipline  
5% cluster confidence

Backtest and calibrate before presenting as meaningful.

Always expose the underlying components.

---

# 11. Wallet Relationship Graph

Graph edges must correspond to actual relationships:

- funded_by
- frequent_counterparty
- co_buys
- same_initial_funder
- same_exit_destination
- LP interaction
- simultaneous trading pattern

Do not add graph visualizations merely for aesthetics.

---

# 12. Token Risk Engine

Keep risk categories separate.

## Contract risk

External security provider / contract metadata.

## Ownership risk

- top-holder concentration
- creator concentration
- connected-wallet concentration
- fresh-wallet concentration

## Liquidity risk

- liquidity change
- LP concentration
- liquidity/market-cap ratio
- spread/depth proxy

## Market-structure risk

- OI spike
- funding extreme
- price/OI divergence
- exchange inflow
- volume collapse

Present component scores, not just one mysterious number.

---

# 13. Liquidity Vacuum Detector

Goal:

Detect deterioration in market ability to absorb orders before price necessarily collapses.

Signals may include:

- DEX liquidity falling
- volume/liquidity ratio rising
- spread proxy worsening
- CEX depth worsening if available
- OI remaining elevated
- tracked-wallet distribution increasing

States:

- HEALTHY
- THINNING
- VACUUM_FORMING
- CRITICAL

Methodology must be documented and versioned.

---

# 14. Market Regime Engine

State vector may include:

- trend
- breadth
- liquidity
- leverage
- macro
- volatility
- on-chain

Regimes:

- RISK_ON_HEALTHY
- RISK_ON_LEVERAGED
- TRANSITION
- RISK_OFF_LIQUID
- RISK_OFF_STRESSED

Expose underlying factors.

---

# 15. Event Impact Database

Event record:

- timestamp
- category
- title
- expected
- actual
- surprise
- affected assets
- source

Post-event windows:

- +5m
- +1h
- +4h
- +24h

Metrics:

- return
- volume abnormality
- OI change
- funding change

Support research questions such as:

"How has BTC historically reacted to upside CPI surprises?"

---

# 16. Cross-Market Research

Initial instruments:

- BTC
- ETH
- SOL
- TOTAL3
- SPX
- NASDAQ
- DXY
- US10Y
- US2Y
- GOLD
- OIL

Research tools:

- rolling correlation
- beta
- cross-correlation
- lead/lag
- regression
- event studies
- Granger-style predictive tests where appropriate

Never label statistical association as proven causality.

Use terminology such as:

- lead-lag evidence
- predictive association
- historical relationship

---

# 17. Worker scheduling

Start with one bounded worker.

Possible jobs:

- realtime Binance streams
- 1m market aggregation
- 5m feature calculation
- 15m narrative calculation
- 15m tracked-wallet sync
- 1h protocol sync
- 1h macro sync
- daily compaction
- daily backup
- retention cleanup

Avoid creating many independent daemons without a reason.

---

# 18. Reliability

Provider status:

- HEALTHY
- DEGRADED
- STALE
- DOWN

Important responses should expose:

- source
- freshness/age
- quality

Never display stale data as if live.

Design fallback behavior explicitly.

---

# 19. Backups

Use PostgreSQL backups.

Suggested:

- 7 daily
- 4 weekly
- 3 monthly

Backups must eventually leave the VPS.

A backup stored only on the same disk is not sufficient disaster recovery.

---

# 20. Observability

Keep lightweight.

Provide:

- `/health`
- provider health
- worker heartbeat
- DB size
- disk usage
- ingestion failures
- API latency
- backup status

Alert channels can later include Telegram.

Avoid running a heavy monitoring stack on this VPS unless necessary.
