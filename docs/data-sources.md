# Data sources

The worker collects market, token, wallet and macro observations. The optional
model adapter runs in the web process only after an analyst submission.
Credentials are server-side; provider configuration is independent of runtime health.

## Public endpoints

| Provider     | Data                                                    | Configuration and verification                                                                                |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Binance      | Spot tickers, closed candles, funding and open interest | Spot REST/stream exercised live. Futures adapter tested; requests timed out in local verification.            |
| DEX Screener | Selected pools, liquidity and volume                    | Public observations exercised live for the default wrapped SOL/USDC mints.                                    |
| GoPlus       | Contract capabilities and supported holder evidence     | Public observations exercised live; unsupported fields stay absent. Optional `GOPLUS_API_KEY` is worker-only. |

`MARKET_SYMBOLS` selects at most 30 USDT spot symbols; the default universe has
twelve. `MARKET_INGESTION_ENABLED=false` disables public market collection.
`TOKEN_UNIVERSE` selects at most eight `chain:address` identities;
`TOKEN_INGESTION_ENABLED` and `GOPLUS_ENABLED` control token/security collection.
See [market data](market-core.md) and [token risk](token-risk.md) for identity,
units, warm-up and freshness rules.

## Optional credentials

| Integration | Settings                                               | Verification                                                                                       |
| ----------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Helius      | `HELIUS_API_KEY`, `TRACKED_WALLETS`                    | Adapter and persistence tested with fixtures; no live credential/address configuration verified.   |
| FRED        | `FRED_API_KEY`                                         | Adapter, observed revisions and retention tested with fixtures; live ingestion unverified.         |
| OpenAI      | `AI_ANALYST_ENABLED`, `OPENAI_API_KEY`, `OPENAI_MODEL` | Disabled by default; structured evidence briefs work without a model. No live model call verified. |

Wallet configuration is a JSON list of up to eight addresses with optional labels.
FRED selects twelve curated series. Events are separately imported, sourced
records; a FRED key does not provide an automatic news/release calendar.
The model is an interpretation service, not a source of market observations.
See [wallets](wallet-intelligence.md), [events/macro](events-macro.md) and
[analyst privacy](ai-analyst.md#optional-model-and-privacy).

## Not connected

CoinGecko and DefiLlama appear in the source catalog but have no active adapters.
Global identity/market-cap metadata, exact TOTAL3/DXY/gold, dedicated news and
CEX/DEX-flow feeds are not available. The News route displays sourced events.
Manual events require their own citations and are not prepopulated.

## Request limits and failure behavior

| Adapter      | Limits                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Binance      | One combined spot stream; serial REST; default twelve markets, maximum thirty                                                           |
| DEX Screener | Up to eight tokens across four supported chains, three selected pools/token, polling every fifteen minutes                              |
| GoPlus       | Selected-contract evidence hourly                                                                                                       |
| Helius       | Four attempted requests per UTC day across tracked wallets; up to two pages of fifty/address; eight-second/2 MiB request limits         |
| FRED         | Twelve serial hourly requests; 2,000 observations/series; eight-second/2 MiB limits; five years and twelve changed versions/period date |
| Model        | Seven fixed read-only tools, 24 rows/tool; thirty-second/256 KiB response limits; at most eight calls and 1,500 output tokens/call      |

Adapters use fixed HTTPS origins, reject redirects, validate responses and sanitize
errors. Provider tests cover malformed, empty, rate-limited, timed-out and
disconnected responses. Source timestamps survive persistence and query projection;
cached evidence ages during failures. DEX/GoPlus use labeled collection time because
their aggregates lack a uniform upstream timestamp.

A missing credential is not proof that the remote provider is down. Data Status
shows the stored health state and configuration error. Public access and quotas
can vary by region/account; check the provider's current terms before enabling it.
