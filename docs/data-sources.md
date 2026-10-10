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
