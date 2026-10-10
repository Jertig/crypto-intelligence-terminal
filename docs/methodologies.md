# Research methodologies

All calculations are descriptive, uncalibrated research tools. They do not give
trade instructions or probabilities. Missing evidence stays null. Times are
stored in UTC and shown in WIB. Input references, calculation time, quality and
formula version are exposed in the inspector.

## Market features v1

`market-features:v1` consumes only bars closed before the calculation time.
Returns require contiguous endpoint windows and a latest close within two bar
intervals. Population standard deviation uses Welford's algorithm; division by
zero variance is unavailable.

| Feature                    | Formula and evidence                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 5m / 1h / 24h / 7d returns | 100 × (last close / endpoint close − 1); 2 five-minute bars, or 2 / 25 / 169 hourly bars                                             |
| BTC relative strength      | Asset 24h return − BTC 24h return in percentage points; aligned last hourly timestamp                                                |
| Sector relative strength   | Asset return − weighted peer return; shared curated allocation dot product, aligned timestamps, self excluded                        |
| Volume acceleration        | Last 24 closed hourly base volumes / previous 24; 48 contiguous recent hours, positive denominator                                   |
| Volume z-score             | (Latest hourly base volume − preceding 24 mean) / preceding 24 population deviation; conservatively gated on the same 48-hour window |
| Realized volatility 24h    | Population deviation of 24 hourly log returns × sqrt(24) × 100; same 48-hour quality gate, not annualized                            |
| OI change 1h / 24h         | 100 × (latest base-unit OI / prior OI − 1); latest age ≤10 minutes, prior at/before target within 10 minutes                         |
| Funding z-score            | Latest observed rate versus prior observed rates, maximum 96 samples, minimum 30 including latest; latest age ≤10 minutes            |
| BTC correlation 30d        | Pearson of 30 daily log returns from 31 aligned contiguous daily bars; latest close age ≤48 hours                                    |
| Perpetual basis            | 100 × (mark price / spot price − 1); mark age ≤10 minutes, spot age ≤90 seconds; clock skew ≤5 seconds                               |

Funding uses observed indicative-rate snapshots, not a fabricated settled-rate
history. Each feature records bounded provider references and sample counts.
Insufficient history, gaps, stale inputs, absent inputs and zero variance are
explicit states. Cached calculated evidence ages after 15 minutes.

## Curated taxonomy v1

Fifteen categories match the specification. Initial mappings cover four
exchange-scoped assets. ETH allocations: L1 0.8, DeFi 0.2. DOGE, AAVE and LINK
are respectively Meme, DeFi and Oracle with weight 1. Weights are editorial
research choices, not measured economic exposures or source claims.
Primary descriptions: [Ethereum](https://ethereum.org/what-is-ethereum/),
[Dogecoin](https://dogecoin.com/), [Aave](https://aave.com/),
[Chainlink](https://chain.link/). Other assets remain unmapped.
Allocations must be positive, unique, total at most 1 per asset and cite
credential-free HTTPS URLs. The worker inserts missing classifications without
overriding edits. Small/single-asset cohorts are disclosed.

## Narrative rotation v1

`narrative-rotation:v1` component weights: relative strength 0.30, volume 0.20,
OI 0.15, funding 0.10, wallet inflow 0.15, protocol activity 0.10.
Per-asset transforms clipped to [0,100]:

- RS: 50 + 5 × BTC relative strength in percentage points.
- Volume: 50 × volume acceleration.
- OI: 50 + 2.5 × OI 24h growth in percent.
- Funding: 100 − 100 × abs(funding z-score) / 3.

Component value uses available curated asset weights. Component coverage =
available asset weight / all classified asset weight. Coverage =
Σ(component weight × component coverage). Contribution =
Σ(component value × component weight × component coverage).
Full score = contribution only at complete coverage, otherwise null.
Partial score = contribution / coverage, with coverage displayed separately.
Missing classified assets remain in the denominator. Features in the future or
older than 15 minutes do not contribute. Narratives run every 15 minutes and
show stale after 30 minutes. Source time uses only the selected tag's feature types.

Wallet inflow and protocol activity are unavailable in Phase 2. Their absent
25% is never replaced by zero or invented observations. Full scores therefore
remain unavailable. Partial scores are not complete scores or probabilities.

## Sampled breadth and regime v1

`market-regime:v1+market-features:v1`: breadth is the fraction of available
configured assets with positive 24h returns. Require at least three observations
and 80% configured-universe coverage. It is not whole-market breadth.
Regime requires five available factors calculated within 15 minutes: BTC 7d
return, breadth, BTC OI 24h growth, BTC funding z-score and mean available
base-volume acceleration.

- Trend >2% and breadth ≥0.6: RISK_ON_LEVERAGED if abs(funding z) ≥2 or OI
  growth ≥10%; otherwise RISK_ON_HEALTHY.
- Trend <−2% and breadth ≤0.4: RISK_OFF_STRESSED if turnover proxy <0.5;
  otherwise RISK_OFF_LIQUID.
- Other complete inputs: TRANSITION. Any missing factor: UNAVAILABLE.

Names are heuristic labels. Turnover is not executable order-book liquidity;
the regime excludes macro/on-chain inputs and is not causal. Each state exposes
factors and limitations. Signal IDs include formula version.

## Storage and cadence

One worker computes features/signals every five minutes and narratives every
fifteen. One typed wide row holds all 14 metrics per market/bucket/version;
secondary metadata is bounded. Query maximum: 420 feature values, 15 narratives,
two signals. Queries read active versions; old versions remain auditable.
No request-time provider fan-out. History expires after 180 days with bounded
hourly deletion. One version at 12 assets produces 622,080 feature rows;
at maximum 30, 1,555,200. Compression helps but this is not a size guarantee.
Phase 8 enforces the final disk budget.
