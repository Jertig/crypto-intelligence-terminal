import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Provenance } from '@terminal/domain';
import { providerFreshnessMs } from '@terminal/domain/health';
import {
  marketSchema,
  snapshotSchema,
  candleSchema,
  fundingSchema,
  openInterestSchema,
  freshness,
  retentionCutoff,
  type Market,
  type Snapshot,
  type Candle,
  type Funding,
  type OpenInterest,
  type MarketResponse,
  type Timeframe,
} from '@terminal/domain/market';
import type { DatabaseConnection } from './index';
import {
  assets,
  venues,
  markets,
  marketSnapshots,
  ohlcv,
  fundingRates,
  openInterest,
  providerHealth,
  ingestionRuns,
} from './schema';

const writeProvenance = (value: Provenance) => ({
  source: value.source,
  providerId: value.providerId,
  sourceTimestamp: new Date(value.sourceTimestamp),
  ingestedAt: new Date(value.ingestedAt),
  quality: value.quality,
  methodologyVersion: value.methodologyVersion ?? null,
});
const readProvenance = (row: {
  source: string;
  providerId: string;
  sourceTimestamp: Date;
  ingestedAt: Date;
  quality: Provenance['quality'];
  methodologyVersion: string | null;
}): Provenance => ({
  source: row.source,
  providerId: row.providerId,
  sourceTimestamp: row.sourceTimestamp.toISOString(),
  ingestedAt: row.ingestedAt.toISOString(),
  quality: row.quality,
  ...(row.methodologyVersion
    ? { methodologyVersion: row.methodologyVersion }
    : {}),
});

export async function persistMarkets(
  connection: DatabaseConnection,
  values: Market[],
  now = new Date(),
) {
  if (values.length > 60) throw new Error('MARKET_UNIVERSE_LIMIT');
  const parsed = values.map((value) => marketSchema.parse(value));
  await connection.db.transaction(async (tx) => {
    for (const market of parsed) {
      await tx
        .insert(venues)
        .values({ id: market.venueId, name: market.venueId })
        .onConflictDoNothing();
      await tx
        .insert(assets)
        .values({
          id: market.assetId,
          symbol: market.base,
          name: market.base,
          identitySource: `${market.venueId}:exchangeInfo`,
          observedAt: now,
        })
        .onConflictDoNothing();
      await tx
        .insert(markets)
        .values(market)
        .onConflictDoUpdate({
          target: markets.id,
          set: { ...market, active: true },
        });
    }
  });
}
export async function persistObservations(
  connection: DatabaseConnection,
  observations: {
    snapshots?: Snapshot[];
    candles?: Candle[];
    funding?: Funding[];
    oi?: OpenInterest[];
  },
) {
  const snapshots = (observations.snapshots ?? []).map((value) =>
    snapshotSchema.parse(value),
  );
  const candles = (observations.candles ?? []).map((value) =>
    candleSchema.parse(value),
  );
  const funding = (observations.funding ?? []).map((value) =>
    fundingSchema.parse(value),
  );
  const interests = (observations.oi ?? []).map((value) =>
    openInterestSchema.parse(value),
  );
  if (
    snapshots.length > 60 ||
    candles.length > 1000 ||
    funding.length > 30 ||
    interests.length > 30
  )
    throw new Error('OBSERVATION_BATCH_LIMIT');
  await connection.db.transaction(async (tx) => {
    for (const value of snapshots) {
      const row = {
        marketId: value.marketId,
        price: String(value.price),
        change24h: String(value.change24h),
        quoteVolume24h: String(value.quoteVolume24h),
        ...writeProvenance(value.provenance),
      };
      await tx
        .insert(marketSnapshots)
        .values(row)
        .onConflictDoUpdate({
          target: marketSnapshots.marketId,
          set: row,
          setWhere: sql`excluded.source_timestamp >= ${marketSnapshots.sourceTimestamp}`,
        });
    }
    for (const value of candles) {
      const row = {
        marketId: value.marketId,
        timeframe: value.timeframe,
        openTime: new Date(value.openTime),
        closeTime: new Date(value.closeTime),
        open: String(value.open),
        high: String(value.high),
        low: String(value.low),
        close: String(value.close),
        volume: String(value.volume),
        ...writeProvenance(value.provenance),
      };
      await tx
        .insert(ohlcv)
        .values(row)
        .onConflictDoUpdate({
          target: [ohlcv.marketId, ohlcv.timeframe, ohlcv.openTime],
          set: row,
          setWhere: sql`excluded.source_timestamp >= ${ohlcv.sourceTimestamp}`,
        });
    }
    for (const value of funding) {
      const row = {
        marketId: value.marketId,
        rate: String(value.rate),
        markPrice: String(value.markPrice),
        nextFundingAt: new Date(value.nextFundingAt),
        ...writeProvenance(value.provenance),
      };
      await tx
        .insert(fundingRates)
        .values(row)
        .onConflictDoUpdate({
          target: [fundingRates.marketId, fundingRates.sourceTimestamp],
          set: row,
        });
    }
    for (const value of interests) {
      const row = {
        marketId: value.marketId,
        quantity: String(value.quantity),
        unit: value.unit,
        ...writeProvenance(value.provenance),
      };
      await tx
        .insert(openInterest)
        .values(row)
        .onConflictDoUpdate({
          target: [openInterest.marketId, openInterest.sourceTimestamp],
          set: row,
        });
    }
  });
  return snapshots.length + candles.length + funding.length + interests.length;
}

export async function recordProviderRun(
  connection: DatabaseConnection,
  providerId: string,
  startedAt: Date,
  status: 'SUCCESS' | 'FAILED',
  persistedRows: number,
  errorCode: string | null = null,
  now = new Date(),
) {
  await connection.db.transaction(async (tx) => {
    await tx.insert(ingestionRuns).values({
      id: randomUUID(),
      providerId,
      startedAt,
      completedAt: now,
      status,
      persistedRows,
      errorCode,
    });
    await tx
      .insert(providerHealth)
      .values({
        providerId,
        status: status === 'SUCCESS' ? 'HEALTHY' : 'DOWN',
        lastAttemptAt: now,
        lastSuccessAt: status === 'SUCCESS' ? now : null,
        updatedAt: now,
        errorCode,
      })
      .onConflictDoUpdate({
        target: providerHealth.providerId,
        set: {
          status:
            status === 'SUCCESS'
              ? 'HEALTHY'
              : sql`CASE WHEN ${providerHealth.lastSuccessAt} IS NULL THEN 'DOWN'::provider_status ELSE 'DEGRADED'::provider_status END`,
          lastAttemptAt: now,
          ...(status === 'SUCCESS' ? { lastSuccessAt: now } : {}),
          updatedAt: now,
          errorCode,
        },
      });
  });
}
export async function runMarketRetention(
  connection: DatabaseConnection,
  now = new Date(),
) {
  let removed = 0;
  for (const timeframe of ['1m', '5m', '1h'] as const) {
    const cutoff = retentionCutoff(timeframe, now);
    if (!cutoff) continue;
    const rows =
      await connection.client`DELETE FROM ohlcv WHERE ctid IN (SELECT ctid FROM ohlcv WHERE timeframe=${timeframe} AND open_time < ${cutoff.toISOString()}::timestamptz LIMIT 5000) RETURNING 1`;
    removed += rows.length;
  }
  const year = new Date(now.getTime() - 365 * 86400000).toISOString();
  const logs = new Date(now.getTime() - 14 * 86400000).toISOString();
  const funding =
    await connection.client`DELETE FROM funding_rates WHERE ctid IN (SELECT ctid FROM funding_rates WHERE source_timestamp < ${year}::timestamptz LIMIT 5000) RETURNING 1`;
  const oi =
    await connection.client`DELETE FROM open_interest WHERE ctid IN (SELECT ctid FROM open_interest WHERE source_timestamp < ${year}::timestamptz LIMIT 5000) RETURNING 1`;
  const runs =
    await connection.client`DELETE FROM ingestion_runs WHERE ctid IN (SELECT ctid FROM ingestion_runs WHERE completed_at < ${logs}::timestamptz LIMIT 5000) RETURNING 1`;
  return {
    removed: removed + funding.length + oi.length + runs.length,
    batchLimit: 5000,
    at: now.toISOString(),
  };
}

export async function queryMarkets(
  connection: DatabaseConnection,
  now = new Date(),
): Promise<MarketResponse> {
  const rows = await connection.db
    .select({ market: markets, snapshot: marketSnapshots })
    .from(marketSnapshots)
    .innerJoin(markets, eq(markets.id, marketSnapshots.marketId))
    .where(and(eq(markets.kind, 'SPOT'), eq(markets.active, true)))
    .orderBy(desc(marketSnapshots.quoteVolume24h))
    .limit(30);
  const derivativeMarkets = rows.length
    ? await connection.db
        .select()
        .from(markets)
        .where(
          and(
            inArray(
              markets.assetId,
              rows.map((item) => item.market.assetId),
            ),
            eq(markets.kind, 'PERPETUAL'),
          ),
        )
        .limit(30)
    : [];
  const ids = derivativeMarkets.map((row) => row.id);
  const funding = ids.length
    ? await connection.db
        .selectDistinctOn([fundingRates.marketId])
        .from(fundingRates)
        .where(inArray(fundingRates.marketId, ids))
        .orderBy(fundingRates.marketId, desc(fundingRates.sourceTimestamp))
        .limit(30)
    : [];
  const interests = ids.length
    ? await connection.db
        .selectDistinctOn([openInterest.marketId])
        .from(openInterest)
        .where(inArray(openInterest.marketId, ids))
        .orderBy(openInterest.marketId, desc(openInterest.sourceTimestamp))
        .limit(30)
    : [];
  const health = await connection.db
    .select()
    .from(providerHealth)
    .orderBy(providerHealth.providerId)
    .limit(30);
  return {
    state: rows.length ? 'READY' : 'EMPTY',
    observedAt: now.toISOString(),
    providers: health.map((row) => ({
      providerId: row.providerId,
      status:
        row.lastSuccessAt &&
        freshness(
          row.lastSuccessAt,
          now,
          providerFreshnessMs(row.providerId),
        ) === 'STALE'
          ? 'STALE'
          : row.status,
      lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
      errorCode: row.errorCode,
    })),
    rows: rows.map(({ market, snapshot }) => {
      const perp = derivativeMarkets.find(
        (row) => row.assetId === market.assetId,
      );
      const fund = funding.find((row) => row.marketId === perp?.id);
      const interest = interests.find((row) => row.marketId === perp?.id);
      return {
        ...marketSchema.parse(market),
        marketId: market.id,
        price: Number(snapshot.price),
        change24h: Number(snapshot.change24h),
        quoteVolume24h: Number(snapshot.quoteVolume24h),
        provenance: readProvenance(snapshot),
        freshness: freshness(snapshot.sourceTimestamp, now),
        funding: fund
          ? {
              marketId: fund.marketId,
              rate: Number(fund.rate),
              markPrice: Number(fund.markPrice),
              nextFundingAt: fund.nextFundingAt.toISOString(),
              provenance: readProvenance(fund),
            }
          : null,
        openInterest: interest
          ? {
              marketId: interest.marketId,
              quantity: Number(interest.quantity),
              unit: interest.unit,
              provenance: readProvenance(interest),
            }
          : null,
      };
    }),
  };
}
export async function queryCandles(
  connection: DatabaseConnection,
  marketId: string,
  timeframe: Timeframe,
  limit = 240,
): Promise<Candle[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('INVALID_CANDLE_LIMIT');
  const rows = await connection.db
    .select()
    .from(ohlcv)
    .where(and(eq(ohlcv.marketId, marketId), eq(ohlcv.timeframe, timeframe)))
    .orderBy(desc(ohlcv.openTime))
    .limit(limit);
  return rows.reverse().map((row) => ({
    marketId: row.marketId,
    timeframe: row.timeframe,
    openTime: row.openTime.toISOString(),
    closeTime: row.closeTime.toISOString(),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    provenance: readProvenance(row),
  }));
}
