# Data sources

Binance public spot REST and streams are connected in Phase 1 without keys.
Futures is independently unavailable when the public host times out. No fixtures
or fabricated values are used in the production application.

| Provider     | Purpose                                      | Current capability                                         |
| ------------ | -------------------------------------------- | ---------------------------------------------------------- |
| Binance      | Spot, derivatives, candles, selected streams | Spot observed; futures adapter tested, locally unavailable |
| CoinGecko    | Global identity, metadata, categories        | Not connected                                              |
| DEX Screener | Selected base pools, liquidity, volume       | Bounded public adapter; 15-minute polling                  |
| Helius       | Explicitly tracked Solana wallets            | Adapter tested; credential and wallet list absent          |
| DefiLlama    | Selected protocol/chain metrics              | Not connected                                              |
| FRED         | Macro observations and revisions             | Bounded adapter tested; credential absent                  |
| GoPlus       | Optional authority and holder evidence       | Bounded public adapter; hourly polling                     |

Adapters validate before core logic. Tests cover malformed, empty, rate-limited,
timed-out, stale and disconnected responses without live API dependencies.
Provider source timestamps survive persistence and query DTOs. Spot and
funding/OI have independent freshness windows. Missing data stays unavailable.
Cached data ages during query failure. Production keys remain server-side only.

DEX/GoPlus return aggregates without an upstream observation timestamp. We retain
and label collection time explicitly. See [token scope and source documentation](token-risk.md).

The optional OpenAI analyst adapter is separate from market data. It is disabled
by default, requires explicit key/model/enablement, and has not been tested live.
Its bounded tools query existing terminal evidence; no AI-generated facts are
stored as provider observations. See [privacy and grounding](ai-analyst.md).

## Operational provider review

Every connected adapter uses fixed HTTPS origins, rejects redirects, validates
bounded responses, and preserves source/collection times. Credentials belong only
to the worker, except the optional model key which belongs only to the web server.
No provider credential appears in client configuration or published screenshots.

| Adapter      | Request and storage bounds                                                                                                                                  | Failure behavior                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binance      | Default 12 spot markets, maximum 30; combined stream and serial REST; closed bars with retention                                                            | Spot and futures have independent health/freshness; no substituted funding/OI                                                                     |
| DEX Screener | Eight selected tokens/four chains, at most three pools per token, 15-minute polling                                                                         | Missing pools/fields remain unavailable; collection time is explicit                                                                              |
| GoPlus       | Optional hourly selected-contract evidence                                                                                                                  | Unsupported fields stay absent; no inferred authority/ownership                                                                                   |
| Helius       | Eight explicitly tracked wallets; at most two pages of 50; four durable attempted calls per UTC day; eight-second/2 MiB request limit                       | Empty configuration/absent key is unavailable; failed attempts still consume budget; no full-chain indexing                                       |
| FRED         | Twelve series, hourly serial requests; 2,000 observations/response; eight-second/2 MiB limit; five years and twelve changed versions per period date        | No key means unavailable; retention still runs; revisions are observed versions, not reconstructed release history                                |
| AI adapter   | Explicit submission only; seven fixed read-only tools, 24 rows/tool; 30-second/256 KiB response limit; eight function calls; output bounded to 1,500 tokens | No key/model leaves an honest structured evidence brief; missing/conflicting/stale evidence is excluded or labeled; no trading or provider writes |

Public access observed on this workstation is not a free-tier availability
guarantee. Respect provider terms and current quotas before enabling credentials.
Global identity/protocol metrics, exact TOTAL3/DXY/gold, full CEX/DEX flow and news
remain unavailable. Data Status is the source of current runtime health.
