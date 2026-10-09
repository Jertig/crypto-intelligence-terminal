# Data sources

No external provider is connected in Phase 0. No provider keys are required to
view the shell. There are no market fixtures in the production application.

| Planned provider | Purpose                                                   | Phase 0 status |
| ---------------- | --------------------------------------------------------- | -------------- |
| Binance          | Spot, derivatives, candles, selected streams              | Not connected  |
| CoinGecko        | Identity, metadata, categories, fallback aggregate values | Not connected  |
| DEX Screener     | Pair discovery, liquidity, volume                         | Not connected  |
| Helius           | Explicitly tracked Solana entities                        | Not connected  |
| DefiLlama        | Selected protocol, chain, stablecoin metrics              | Not connected  |
| FRED             | Macro observations with release/revision semantics        | Not connected  |
| GoPlus           | Optional third-party risk signals                         | Not connected  |

Future adapters must normalize responses before core logic and test malformed,
empty, rate-limited, timed-out, stale, and disconnected responses. Unit tests must
not call live APIs. Requests and retries must remain bounded.
