# Market core

Binance public market-only REST and WebSocket sources are used without API keys.
Spot metadata and 24-hour ticker requests select a bounded symbol list. Instrument
identities are exchange-scoped (`binance:BTC`), not asserted global identities.
USDT quote volume and price are labeled USDT. Open interest is base-asset quantity,
not an inferred USD notional. Funding rates are fractions, multiplied by 100 only
for percent presentation. All observations retain source and ingestion times.

The default universe is BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK, SUI, AAVE
and NEAR against USDT. `MARKET_SYMBOLS` accepts at most 30 unique ASCII symbols.
`MARKET_INGESTION_ENABLED=false` disables calls for offline operation and CI.
Only closed bars are stored. Late REST observations cannot replace newer stream
prices. Composite keys make candle/funding/OI duplicates idempotent; failed batch
transactions roll back. Web requests query bounded PostgreSQL results only.

Startup warms 240 closed bars per interval and 1,000 hourly bars. Each minute one
market is repaired with up to 1,000 minute bars and ten larger bars. This bounds
recovery to approximately 16 hours of minute history per request; longer outages
can leave history gaps. Retention does not guarantee complete historical coverage.
Chart queries return at most 240 stored bars by default.

TanStack Query shares cached requests and polls visible market data every ten
seconds and candles every minute. Hidden tabs stop scheduled polling. TanStack
Table 9's exported legacy adapter retains the stable table API. Lightweight
Charts 5 includes its attribution logo and TradingView link. Source timestamps
appear in WIB. No aggregate market cap or breadth is invented.

Official references: [public hosts](https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md),
[stream lifecycle](https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md),
[futures data](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data),
[chart API](https://tradingview.github.io/lightweight-charts/docs).

Local live verification observed spot REST, ticker streams and closed candles.
Futures timed out locally; funding/OI adapters are fixture-tested and degrade
independently. This does not prove global availability or VPS capacity.
No trading credentials, execution permissions or wallet keys exist.
