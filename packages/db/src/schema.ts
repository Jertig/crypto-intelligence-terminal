import { sql } from 'drizzle-orm';
import {
  check,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  integer,
  boolean,
  primaryKey,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';
import type { Feature, Component } from '@terminal/domain/intelligence';

export const providerStatus = pgEnum('provider_status', [
  'HEALTHY',
  'DEGRADED',
  'STALE',
  'DOWN',
]);
export const dataQuality = pgEnum('data_quality', [
  'DIRECT',
  'AGGREGATED',
  'DERIVED',
  'ESTIMATED',
  'AI_INTERPRETATION',
]);

export const providerHealth = pgTable(
  'provider_health',
  {
    providerId: text('provider_id').primaryKey(),
    status: providerStatus('status').notNull(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    errorCode: text('error_code'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check('provider_id_nonempty', sql`length(trim(${table.providerId})) > 0`),
    check(
      'observed_status_requires_success',
      sql`${table.status} NOT IN ('HEALTHY', 'STALE') OR ${table.lastSuccessAt} IS NOT NULL`,
    ),
  ],
);

export const workerHeartbeats = pgTable(
  'worker_heartbeats',
  {
    name: text('name').primaryKey(),
    instanceId: uuid('instance_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check('worker_name_nonempty', sql`length(trim(${table.name})) > 0`),
    check(
      'heartbeat_after_start',
      sql`${table.lastSeenAt} >= ${table.startedAt}`,
    ),
  ],
);

export const candleInterval = pgEnum('candle_interval', [
  '1m',
  '5m',
  '1h',
  '1d',
]);
export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    identitySource: text('identity_source').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'asset_identity_nonempty',
      sql`length(${table.id}) > 0 AND length(${table.symbol}) > 0`,
    ),
  ],
);
export const venues = pgTable('venues', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});
export const markets = pgTable(
  'markets',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id),
    venueId: text('venue_id')
      .notNull()
      .references(() => venues.id),
    symbol: text('symbol').notNull(),
    base: text('base').notNull(),
    quote: text('quote').notNull(),
    kind: text('kind').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    check('market_kind_valid', sql`${table.kind} IN ('SPOT', 'PERPETUAL')`),
  ],
);
const observationColumns = () => ({
  source: text('source').notNull(),
  providerId: text('provider_id').notNull(),
  sourceTimestamp: timestamp('source_timestamp', {
    withTimezone: true,
  }).notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull(),
  quality: dataQuality('quality').notNull(),
  methodologyVersion: text('methodology_version'),
});
export const marketSnapshots = pgTable(
  'market_snapshots',
  {
    marketId: text('market_id')
      .primaryKey()
      .references(() => markets.id),
    price: numeric('price', { precision: 38, scale: 18 }).notNull(),
    change24h: numeric('change_24h', { precision: 20, scale: 8 }).notNull(),
    quoteVolume24h: numeric('quote_volume_24h', {
      precision: 38,
      scale: 8,
    }).notNull(),
    ...observationColumns(),
  },
  (table) => [
    check(
      'snapshot_positive_values',
      sql`${table.price} > 0 AND ${table.quoteVolume24h} >= 0`,
    ),
    check(
      'snapshot_provenance_valid',
      sql`length(${table.source}) > 0 AND length(${table.providerId}) > 0 AND (${table.quality} NOT IN ('DERIVED', 'ESTIMATED') OR ${table.methodologyVersion} IS NOT NULL)`,
    ),
  ],
);
export const ohlcv = pgTable(
  'ohlcv',
  {
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    timeframe: candleInterval('timeframe').notNull(),
    openTime: timestamp('open_time', { withTimezone: true }).notNull(),
    closeTime: timestamp('close_time', { withTimezone: true }).notNull(),
    open: numeric('open', { precision: 38, scale: 18 }).notNull(),
    high: numeric('high', { precision: 38, scale: 18 }).notNull(),
    low: numeric('low', { precision: 38, scale: 18 }).notNull(),
    close: numeric('close', { precision: 38, scale: 18 }).notNull(),
    volume: numeric('volume', { precision: 38, scale: 18 }).notNull(),
    ...observationColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.marketId, table.timeframe, table.openTime] }),
    index('ohlcv_retention_idx').on(table.timeframe, table.openTime),
    check(
      'ohlcv_valid',
      sql`${table.open} > 0 AND ${table.close} > 0 AND ${table.low} > 0 AND ${table.high} >= greatest(${table.open}, ${table.close}, ${table.low}) AND ${table.low} <= least(${table.open}, ${table.close}) AND ${table.volume} >= 0 AND ${table.closeTime} > ${table.openTime}`,
    ),
    check(
      'ohlcv_provenance_valid',
      sql`length(${table.source}) > 0 AND length(${table.providerId}) > 0 AND (${table.quality} NOT IN ('DERIVED', 'ESTIMATED') OR ${table.methodologyVersion} IS NOT NULL)`,
    ),
  ],
);
export const fundingRates = pgTable(
  'funding_rates',
  {
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    rate: numeric('rate', { precision: 20, scale: 12 }).notNull(),
    markPrice: numeric('mark_price', { precision: 38, scale: 18 }).notNull(),
    nextFundingAt: timestamp('next_funding_at', {
      withTimezone: true,
    }).notNull(),
    ...observationColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.marketId, table.sourceTimestamp] }),
    index('funding_retention_idx').on(table.sourceTimestamp),
    check('funding_positive_price', sql`${table.markPrice} > 0`),
    check(
      'funding_provenance_valid',
      sql`length(${table.source}) > 0 AND length(${table.providerId}) > 0 AND (${table.quality} NOT IN ('DERIVED', 'ESTIMATED') OR ${table.methodologyVersion} IS NOT NULL)`,
    ),
  ],
);
export const openInterest = pgTable(
  'open_interest',
  {
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    quantity: numeric('quantity', { precision: 38, scale: 18 }).notNull(),
    unit: text('unit').notNull(),
    ...observationColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.marketId, table.sourceTimestamp] }),
    index('oi_retention_idx').on(table.sourceTimestamp),
    check(
      'oi_nonnegative',
      sql`${table.quantity} >= 0 AND length(${table.unit}) > 0`,
    ),
    check(
      'oi_provenance_valid',
      sql`length(${table.source}) > 0 AND length(${table.providerId}) > 0 AND (${table.quality} NOT IN ('DERIVED', 'ESTIMATED') OR ${table.methodologyVersion} IS NOT NULL)`,
    ),
  ],
);
export const ingestionRuns = pgTable(
  'ingestion_runs',
  {
    id: uuid('id').primaryKey(),
    providerId: text('provider_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
    status: text('status').notNull(),
    errorCode: text('error_code'),
    persistedRows: integer('persisted_rows').notNull().default(0),
  },
  (table) => [
    index('ingestion_retention_idx').on(table.completedAt),
    check(
      'ingestion_run_valid',
      sql`${table.status} IN ('SUCCESS', 'FAILED') AND ${table.persistedRows} >= 0 AND ${table.completedAt} >= ${table.startedAt}`,
    ),
  ],
);

export type FeatureMetadata = Omit<
  Feature,
  'marketId' | 'value' | 'bucketAt' | 'calculatedAt'
>;
export const featureSnapshots = pgTable(
  'feature_snapshots',
  {
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id),
    bucketAt: timestamp('bucket_at', { withTimezone: true }).notNull(),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull(),
    return5m: numeric('return_5m', { precision: 38, scale: 18 }),
    return1h: numeric('return_1h', { precision: 38, scale: 18 }),
    return24h: numeric('return_24h', { precision: 38, scale: 18 }),
    return7d: numeric('return_7d', { precision: 38, scale: 18 }),
    relativeStrengthBtc: numeric('relative_strength_btc', {
      precision: 38,
      scale: 18,
    }),
    relativeStrengthSector: numeric('relative_strength_sector', {
      precision: 38,
      scale: 18,
    }),
    volumeZscore: numeric('volume_zscore', { precision: 38, scale: 18 }),
    volumeAcceleration: numeric('volume_acceleration', {
      precision: 38,
      scale: 18,
    }),
    oiChange1h: numeric('oi_change_1h', { precision: 38, scale: 18 }),
    oiChange24h: numeric('oi_change_24h', { precision: 38, scale: 18 }),
    fundingZscore: numeric('funding_zscore', { precision: 38, scale: 18 }),
    btcCorrelation30d: numeric('btc_corr_30d', { precision: 38, scale: 18 }),
    perpBasis: numeric('perp_basis', { precision: 38, scale: 18 }),
    realizedVolatility24h: numeric('realized_volatility_24h', {
      precision: 38,
      scale: 18,
    }),
    metadata: jsonb('metadata').$type<FeatureMetadata[]>().notNull(),
    ...observationColumns(),
  },
  (table) => [
    primaryKey({
      columns: [table.marketId, table.bucketAt, table.methodologyVersion],
    }),
    index('feature_retention_idx').on(table.bucketAt),
    check(
      'feature_provenance_valid',
      sql`${table.quality} = 'DERIVED' AND length(${table.methodologyVersion}) > 0 AND length(${table.providerId}) > 0 AND length(${table.source}) > 0 AND jsonb_array_length(${table.metadata}) = 14 AND octet_length(${table.metadata}::text) <= 65536`,
    ),
  ],
);
export const narratives = pgTable('narratives', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  taxonomyVersion: text('taxonomy_version').notNull(),
});
export const assetNarratives = pgTable(
  'asset_narratives',
  {
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id),
    narrativeId: text('narrative_id')
      .notNull()
      .references(() => narratives.id),
    weight: numeric('weight', { precision: 8, scale: 6 }).notNull(),
    source: text('source').notNull(),
    methodologyVersion: text('methodology_version').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.assetId, table.narrativeId] }),
    check(
      'exposure_valid',
      sql`${table.weight} > 0 AND ${table.weight} <= 1 AND length(${table.source}) > 0 AND length(${table.methodologyVersion}) > 0`,
    ),
  ],
);
export const narrativeSnapshots = pgTable(
  'narrative_snapshots',
  {
    narrativeId: text('narrative_id')
      .notNull()
      .references(() => narratives.id),
    bucketAt: timestamp('bucket_at', { withTimezone: true }).notNull(),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull(),
    score: numeric('score', { precision: 12, scale: 6 }),
    partialScore: numeric('partial_score', { precision: 12, scale: 6 }),
    coverage: numeric('coverage', { precision: 8, scale: 6 }).notNull(),
    assetCount: integer('asset_count').notNull(),
    components: jsonb('components').$type<Component[]>().notNull(),
    ...observationColumns(),
  },
  (table) => [
    primaryKey({
      columns: [table.narrativeId, table.bucketAt, table.methodologyVersion],
    }),
    index('narrative_retention_idx').on(table.bucketAt),
    check(
      'narrative_score_valid',
      sql`${table.coverage} >= 0 AND ${table.coverage} <= 1 AND (${table.score} IS NULL OR (${table.coverage} = 1 AND ${table.score} BETWEEN 0 AND 100)) AND (${table.partialScore} IS NULL OR ${table.partialScore} BETWEEN 0 AND 100) AND ${table.assetCount} BETWEEN 0 AND 30 AND jsonb_array_length(${table.components}) = 6 AND ${table.quality} = 'DERIVED' AND ${table.methodologyVersion} IS NOT NULL AND length(${table.methodologyVersion}) > 0`,
    ),
  ],
);
export const signalSnapshots = pgTable(
  'signal_snapshots',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    bucketAt: timestamp('bucket_at', { withTimezone: true }).notNull(),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull(),
    state: text('state').notNull(),
    value: numeric('value', { precision: 20, scale: 8 }),
    coverage: numeric('coverage', { precision: 8, scale: 6 }).notNull(),
    ...observationColumns(),
  },
  (table) => [
    index('signal_retention_idx').on(table.bucketAt),
    check(
      'signal_provenance_valid',
      sql`${table.kind} IN ('BREADTH', 'REGIME') AND ${table.coverage} BETWEEN 0 AND 1 AND ${table.quality} = 'DERIVED' AND ${table.methodologyVersion} IS NOT NULL AND length(${table.methodologyVersion}) > 0`,
    ),
  ],
);
export const signalExplanations = pgTable(
  'signal_explanations',
  {
    signalId: text('signal_id')
      .notNull()
      .references(() => signalSnapshots.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    value: numeric('value', { precision: 38, scale: 18 }),
    unit: text('unit').notNull(),
    reason: text('reason').notNull(),
  },
  (table) => [primaryKey({ columns: [table.signalId, table.name] })],
);
