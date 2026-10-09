import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import {
  createDatabase,
  type DatabaseConnection,
} from '../../packages/db/src/index';
import { runMigrations } from '../../packages/db/src/migrate';
import {
  persistMarkets,
  persistObservations,
  queryMarkets,
  queryCandles,
  runMarketRetention,
  recordProviderRun,
} from '../../packages/db/src/market';
import { marketSnapshots, ohlcv } from '../../packages/db/src/schema';
import {
  BinanceProvider,
  normalizeTicker,
} from '../../packages/providers/src/binance';
import type { Market, Candle } from '../../packages/domain/src/market';

let connection: DatabaseConnection;
const now = new Date('2026-01-01T00:10:00Z');
const market: Market = {
  id: 'binance:spot:FIXTUREUSDT',
  assetId: 'binance:FIXTURE',
  venueId: 'binance',
  symbol: 'FIXTUREUSDT',
  base: 'FIXTURE',
  quote: 'USDT',
  kind: 'SPOT',
};
const perp: Market = {
  ...market,
  id: 'binance:perpetual:FIXTUREUSDT',
  kind: 'PERPETUAL',
};
const snapshot = normalizeTicker(
  {
    symbol: market.symbol,
    lastPrice: '10',
    priceChangePercent: '2',
    quoteVolume: '100',
    closeTime: now.getTime(),
  },
  market,
  now,
);
const candle: Candle = {
  marketId: market.id,
  timeframe: '1m',
  openTime: new Date(now.getTime() - 120000).toISOString(),
  closeTime: new Date(now.getTime() - 60001).toISOString(),
  open: 10,
  high: 12,
  low: 9,
  close: 11,
  volume: 100,
  provenance: snapshot.provenance,
};
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL required');
  const target = new URL(url);
  if (
    target.pathname !== '/terminal_test' ||
    !['127.0.0.1', 'localhost'].includes(target.hostname)
  )
    throw new Error('Local disposable terminal_test required');
  connection = createDatabase(url);
  await runMigrations(url);
});
beforeEach(async () => {
  await connection.client`TRUNCATE ingestion_runs, provider_health, funding_rates, open_interest, ohlcv, market_snapshots, markets, assets, venues CASCADE`;
  await persistMarkets(connection, [market, perp], now);
});
afterAll(async () => {
  if (connection) await connection.client.end({ timeout: 3 });
});
describe('market persistence and query pipeline', () => {
  it('preserves fixture adapter provenance through normalization, persistence and API DTO', async () => {
    const provider = new BinanceProvider({
      now: () => now,
      fetcher: vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                symbol: market.symbol,
                lastPrice: '10',
                priceChangePercent: '2',
                quoteVolume: '100',
                closeTime: now.getTime(),
              },
            ]),
          ),
      ),
    });
    const observations = await provider.getSnapshots([market]);
    await persistObservations(connection, {
      snapshots: observations,
      candles: [candle],
    });
    const result = await queryMarkets(connection, now);
    expect(result.rows[0]?.provenance).toEqual(snapshot.provenance);
    expect(result.rows[0]?.freshness).toBe('FRESH');
    expect(
      (await queryCandles(connection, market.id, '1m'))[0]?.provenance,
    ).toEqual(snapshot.provenance);
  });
  it('keeps repeated ingestion idempotent across all market datasets', async () => {
    const observations = {
      snapshots: [snapshot],
      candles: [candle],
      funding: [
        {
          marketId: perp.id,
          markPrice: 10,
          rate: 0.0001,
          nextFundingAt: new Date(now.getTime() + 1000).toISOString(),
          provenance: {
            ...snapshot.provenance,
            providerId: 'binance:perpetual',
          },
        },
      ],
      oi: [
        {
          marketId: perp.id,
          quantity: 100,
          unit: 'FIXTURE',
          provenance: {
            ...snapshot.provenance,
            providerId: 'binance:perpetual',
          },
        },
      ],
    };
    await persistObservations(connection, observations);
    await persistObservations(connection, observations);
    const counts =
      await connection.client`SELECT (SELECT count(*) FROM market_snapshots)::int AS snapshots, (SELECT count(*) FROM ohlcv)::int AS candles, (SELECT count(*) FROM funding_rates)::int AS funding, (SELECT count(*) FROM open_interest)::int AS oi`;
    expect(counts[0]).toEqual({ snapshots: 1, candles: 1, funding: 1, oi: 1 });
    const row = (await queryMarkets(connection, now)).rows[0];
    expect(row?.openInterest?.unit).toBe('FIXTURE');
    expect(row?.funding?.provenance.providerId).toBe('binance:perpetual');
  });
  it('does not let late snapshots overwrite newer observations', async () => {
    await persistObservations(connection, { snapshots: [snapshot] });
    await persistObservations(connection, {
      snapshots: [
        {
          ...snapshot,
          price: 8,
          provenance: {
            ...snapshot.provenance,
            sourceTimestamp: new Date(now.getTime() - 1000).toISOString(),
          },
        },
      ],
    });
    expect((await queryMarkets(connection, now)).rows[0]?.price).toBe(10);
  });
  it('rolls back an entire batch when one foreign key is invalid', async () => {
    await expect(
      persistObservations(connection, {
        snapshots: [snapshot, { ...snapshot, marketId: 'unknown-market' }],
      }),
    ).rejects.toThrow();
    expect(await connection.db.select().from(marketSnapshots)).toHaveLength(0);
  });
  it('enforces positive prices and closed OHLC constraints at the database boundary', async () => {
    const provenance = {
      source: 'fixture-only',
      providerId: 'fixture-only',
      sourceTimestamp: now,
      ingestedAt: now,
      quality: 'DIRECT' as const,
    };
    await expect(
      connection.db.insert(marketSnapshots).values({
        marketId: market.id,
        price: '-1',
        change24h: '0',
        quoteVolume24h: '1',
        ...provenance,
      }),
    ).rejects.toThrow();
    await expect(
      connection.db.insert(ohlcv).values({
        marketId: market.id,
        timeframe: '1m',
        openTime: new Date(candle.openTime),
        closeTime: new Date(candle.closeTime),
        open: '10',
        high: '8',
        low: '9',
        close: '11',
        volume: '100',
        ...provenance,
      }),
    ).rejects.toThrow();
  });
  it('requires source identity and methodology for derivatives at the database boundary', async () => {
    await expect(
      connection.client`INSERT INTO funding_rates (market_id, rate, mark_price, next_funding_at, provider_id, source, source_timestamp, ingested_at, quality) VALUES (${perp.id}, 0.0001, 10, ${now.toISOString()}::timestamptz, '', 'fixture-only', ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz, 'DIRECT')`,
    ).rejects.toThrow();
    await expect(
      connection.client`INSERT INTO open_interest (market_id, quantity, unit, provider_id, source, source_timestamp, ingested_at, quality) VALUES (${perp.id}, 100, 'FIXTURE', 'fixture-only', 'fixture-only', ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz, 'DERIVED')`,
    ).rejects.toThrow();
  });
  it('expires bounded historical datasets while preserving the cutoff and daily history', async () => {
    const values: Candle[] = (
      [
        ['1m', 31],
        ['5m', 181],
        ['1h', 731],
        ['1d', 1000],
        ['1m', 30],
      ] as const
    ).map(([timeframe, days]) => ({
      ...candle,
      timeframe,
      openTime: new Date(now.getTime() - days * 86400000).toISOString(),
      closeTime: new Date(
        now.getTime() - days * 86400000 + 59999,
      ).toISOString(),
    }));
    await persistObservations(connection, { candles: values });
    const result = await runMarketRetention(connection, now);
    expect(result.removed).toBe(3);
    expect(result.batchLimit).toBe(5000);
    expect(await connection.db.select().from(ohlcv)).toHaveLength(2);
    expect(await queryCandles(connection, market.id, '1d')).toHaveLength(1);
  });
  it('preserves provider outage history and detects stale last-success observations', async () => {
    await recordProviderRun(
      connection,
      'fixture-only',
      now,
      'FAILED',
      0,
      'TIMEOUT',
      now,
    );
    expect((await queryMarkets(connection, now)).providers[0]).toMatchObject({
      status: 'DOWN',
      lastSuccessAt: null,
    });
    await recordProviderRun(
      connection,
      'fixture-only',
      now,
      'SUCCESS',
      1,
      null,
      now,
    );
    await recordProviderRun(
      connection,
      'fixture-only',
      now,
      'FAILED',
      0,
      'RATE_LIMIT',
      now,
    );
    expect((await queryMarkets(connection, now)).providers[0]?.status).toBe(
      'DEGRADED',
    );
    expect(
      (await queryMarkets(connection, new Date(now.getTime() + 90001)))
        .providers[0]?.status,
    ).toBe('STALE');
  });
  it('marks retained prices stale and rejects unbounded chart requests', async () => {
    await persistObservations(connection, { snapshots: [snapshot] });
    expect(
      (await queryMarkets(connection, new Date(now.getTime() + 90001))).rows[0]
        ?.freshness,
    ).toBe('STALE');
    await expect(
      queryCandles(connection, market.id, '1m', 1001),
    ).rejects.toThrow('INVALID_CANDLE_LIMIT');
  });
});
