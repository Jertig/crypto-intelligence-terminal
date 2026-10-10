import type {
  ResearchEvent,
  MacroObservation,
  MacroResponse,
  EventsResponse,
} from '../../packages/domain/src/events';
import { macroSeries, eventImpact } from '../../packages/domain/src/events';
import type { Candle, Market } from '../../packages/domain/src/market';
export const eventTime = new Date('2026-09-01T12:00:00Z'),
  eventNow = new Date('2026-09-02T12:00:00Z');
export const eventFixture: ResearchEvent = {
  id: 'synthetic-qa-event',
  timestamp: eventTime.toISOString(),
  category: 'economic',
  title: 'SYNTHETIC QA EVENT — NOT LIVE',
  expected: 2,
  actual: 3,
  unit: 'percent',
  affectedAssets: ['BTC'],
  source: 'https://www.bls.gov/cpi/',
  ingestion: 'MANUAL_SOURCED',
  collectedAt: eventTime.toISOString(),
};
export const eventMarket: Market = {
  id: 'binance:spot:BTCUSDT',
  assetId: 'binance:BTC',
  venueId: 'binance',
  symbol: 'BTCUSDT',
  base: 'BTC',
  quote: 'USDT',
  kind: 'SPOT',
};
export function eventBar(minute: number): Candle {
  const open = new Date(eventTime.getTime() + minute * 60000),
    close = new Date(open.getTime() + 59999),
    price = 100 + minute / 100;
  return {
    marketId: eventMarket.id,
    timeframe: '1m',
    openTime: open.toISOString(),
    closeTime: close.toISOString(),
    open: price,
    high: price + 1,
    low: price - 1,
    close: price,
    volume: minute >= 0 ? 20 : 10,
    provenance: {
      providerId: 'binance:spot',
      source: 'fixture-only',
      sourceTimestamp: close.toISOString(),
      ingestedAt: eventNow.toISOString(),
      quality: 'DIRECT',
    },
  };
}
export function macroFixture(
  date = '2026-09-01',
  value: number | null = 100,
  now = eventNow,
): MacroObservation {
  return {
    seriesId: 'SP500',
    date,
    realtimeStart: now.toISOString().slice(0, 10),
    realtimeEnd: now.toISOString().slice(0, 10),
    value,
    provenance: {
      providerId: 'fred',
      source: '/fred/series/observations?series_id=SP500',
      sourceTimestamp: now.toISOString(),
      ingestedAt: now.toISOString(),
      quality: 'DIRECT',
      methodologyVersion: 'fred-observations:v1',
    },
  };
}
export function fredFixture(value = '100', date = '2026-09-01') {
  return {
    count: 1,
    offset: 0,
    observations: [
      { date, value, realtime_start: '2026-09-02', realtime_end: '2026-09-02' },
    ],
  };
}
export function eventResponse(): EventsResponse {
  return {
    state: 'READY',
    observedAt: eventNow.toISOString(),
    events: [eventFixture],
    impacts: [
      eventImpact(
        eventFixture,
        'BTC',
        5,
        {
          candles: Array.from({ length: 11 }, (_, i) => eventBar(i - 6)),
          oi: [],
          funding: [],
        },
        eventNow,
      ),
    ],
  };
}
export function macroResponse(): MacroResponse {
  return {
    state: 'READY',
    observedAt: eventNow.toISOString(),
    provider: {
      status: 'DEGRADED',
      lastSuccessAt: eventNow.toISOString(),
      errorCode: 'PARTIAL_COVERAGE',
    },
    series: macroSeries.map((s) => ({
      ...s,
      observations:
        s.id === 'SP500'
          ? Array.from({ length: 35 }, (_, i) =>
              macroFixture(
                new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10),
                100 + i + (i * i) / 100,
              ),
            )
          : [],
    })),
    crypto: [
      {
        asset: 'BTC',
        points: Array.from({ length: 35 }, (_, i) => ({
          date: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10),
          value: 200 + i * 3 + (i * i) / 100,
        })),
      },
    ],
  };
}
