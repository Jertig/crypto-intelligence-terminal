# Data sources

Binance public spot REST and streams are connected in Phase 1 without keys.
Futures is independently unavailable when the public host times out. No fixtures
or fabricated values are used in the production application.

| Provider     | Purpose                                      | Current capability                                         |
| ------------ | -------------------------------------------- | ---------------------------------------------------------- |
| Binance      | Spot, derivatives, candles, selected streams | Spot observed; futures adapter tested, locally unavailable |
| CoinGecko    | Global identity, metadata, categories        | Not connected                                              |
| DEX Screener | Pair discovery, liquidity, volume            | Phase 3                                                    |
| Helius       | Explicitly tracked Solana wallets            | Phase 4                                                    |
| DefiLlama    | Selected protocol/chain metrics              | Not connected                                              |
| FRED         | Macro observations and revisions             | Phase 5                                                    |
| GoPlus       | Optional risk evidence                       | Phase 3                                                    |

Adapters validate before core logic. Tests cover malformed, empty, rate-limited,
timed-out, stale and disconnected responses without live API dependencies.
Provider source timestamps survive persistence and query DTOs. Spot and
funding/OI have independent freshness windows. Missing data stays unavailable.
Cached data ages during query failure. Production keys remain server-side only.
