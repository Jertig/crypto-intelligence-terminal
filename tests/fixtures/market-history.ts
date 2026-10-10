import type {
  Candle,
  Funding,
  MarketRow,
  OpenInterest,
} from '../../packages/domain/src/market';
export const fixtureNow = new Date('2026-01-31T01:00:00.000Z');
export const fixtureMarket = (base = 'ETH'): MarketRow => ({
  id: `binance:spot:${base}USDT`,
  marketId: `binance:spot:${base}USDT`,
  assetId: `binance:${base}`,
  venueId: 'binance',
  symbol: `${base}USDT`,
  base,
  quote: 'USDT',
  kind: 'SPOT',
  price: 100,
  change24h: 2,
  quoteVolume24h: 10000,
  funding: null,
  openInterest: null,
  freshness: 'FRESH',
  provenance: {
    providerId: 'test-fixture',
    source: 'synthetic-tests-only',
    sourceTimestamp: new Date(fixtureNow.getTime() - 1000).toISOString(),
    ingestedAt: fixtureNow.toISOString(),
    quality: 'DIRECT',
  },
});
export function fixtureBars(
  base = 'ETH',
  frame: Candle['timeframe'] = '1h',
  count = 200,
): Candle[] {
  const interval = { '1m': 60000, '5m': 300000, '1h': 3600000, '1d': 86400000 }[
    frame
  ];
  const end = Math.floor(fixtureNow.getTime() / interval) * interval;
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index + (index % 3);
    const closeTime = new Date(
      end - (count - index - 1) * interval - 1,
    ).toISOString();
    return {
      marketId: fixtureMarket(base).id,
      timeframe: frame,
      openTime: new Date(end - (count - index) * interval).toISOString(),
      closeTime,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100 + (index % 7) * 10,
      provenance: {
        ...fixtureMarket(base).provenance,
        sourceTimestamp: closeTime,
      },
    };
  });
}
export function fixtureInput(base = 'ETH') {
  const market = fixtureMarket(base);
  const funding: Funding[] = Array.from({ length: 96 }, (_, index) => ({
    marketId: `binance:perpetual:${base}USDT`,
    markPrice: 101,
    rate: 0.0001 + (index % 5) * 0.00002,
    nextFundingAt: new Date(fixtureNow.getTime() + 3600000).toISOString(),
    provenance: {
      ...market.provenance,
      sourceTimestamp: new Date(
        fixtureNow.getTime() - (95 - index) * 300000 - 1000,
      ).toISOString(),
    },
  }));
  const oi: OpenInterest[] = Array.from({ length: 289 }, (_, index) => ({
    marketId: `binance:perpetual:${base}USDT`,
    quantity: 100 + index,
    unit: base,
    provenance: {
      ...market.provenance,
      sourceTimestamp: new Date(
        fixtureNow.getTime() - (288 - index) * 300000 - 1000,
      ).toISOString(),
    },
  }));
  market.funding = funding.at(-1) ?? null;
  return {
    market,
    candles: [
      ...fixtureBars(base),
      ...fixtureBars(base, '5m', 2),
      ...fixtureBars(base, '1d', 31),
    ],
    btcCandles: [...fixtureBars('BTC'), ...fixtureBars('BTC', '1d', 31)],
    funding,
    oi,
  };
}
