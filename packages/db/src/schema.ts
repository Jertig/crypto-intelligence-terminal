import { sql } from 'drizzle-orm';
import type { AlertRule, Evaluation } from '@terminal/domain/research';
import type { AnalystMemo } from '@terminal/domain/analyst';
export const watchlists = pgTable(
  'watchlists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check('watchlist_title_valid', sql`length(${t.title}) BETWEEN 1 AND 60`),
  ],
);
export const watchlistItems = pgTable(
  'watchlist_items',
  {
    watchlistId: uuid('watchlist_id')
      .notNull()
      .references(() => watchlists.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.watchlistId, t.symbol] }),
    check('watch_symbol_valid', sql`${t.symbol} ~ '^[A-Z0-9]{1,24}$'`),
  ],
);
export const researchNotes = pgTable(
  'research_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    asset: text('asset').notNull(),
    body: text('body').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      'note_valid',
      sql`length(${t.title}) BETWEEN 1 AND 60 AND ${t.asset} IN ('BTC','ETH','SOL') AND length(${t.body}) BETWEEN 1 AND 3000 AND octet_length(${t.body})<=12000`,
    ),
  ],
);
export const aiQueries = pgTable(
  'ai_queries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    asset: text('asset').notNull(),
    question: text('question').notNull(),
    tools: text('tools').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      'saved_query_valid',
      sql`length(${t.title}) BETWEEN 1 AND 60 AND ${t.asset} IN ('BTC','ETH','SOL') AND length(${t.question}) BETWEEN 1 AND 500 AND cardinality(${t.tools}) BETWEEN 1 AND 7 AND ${t.tools} <@ ARRAY['market','features','risk','wallet','events','macro','providers']::text[]`,
    ),
  ],
);
export const savedViews = pgTable(
  'saved_views',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    filter: text('filter').notNull(),
    sort: text('sort').notNull(),
    descending: boolean('descending').notNull(),
    hidden: text('hidden').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      'saved_view_valid',
      sql`length(${t.title}) BETWEEN 1 AND 60 AND ${t.filter} ~ '^[A-Za-z0-9]{0,24}$' AND ${t.sort} IN ('base','price','change24h','quoteVolume24h','oi','funding','freshness') AND cardinality(${t.hidden})<=6 AND NOT ('base'=ANY(${t.hidden})) AND ${t.hidden} <@ ARRAY['price','change24h','quoteVolume24h','oi','funding','freshness']::text[]`,
    ),
  ],
);
export const reportSnapshots = pgTable(
  'report_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    asset: text('asset').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    confidence: text('confidence').notNull(),
    digest: text('digest').notNull(),
    memo: jsonb('memo').$type<AnalystMemo>().notNull(),
  },
  (t) => [
    index('report_retention_idx').on(t.createdAt),
    check(
      'report_valid',
      sql`length(${t.title}) BETWEEN 1 AND 60 AND ${t.asset} IN ('BTC','ETH','SOL') AND ${t.confidence} IN ('LIMITED','INSUFFICIENT') AND ${t.digest} ~ '^[a-f0-9]{64}$' AND octet_length(${t.memo}::text)<=131072`,
    ),
  ],
);
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    kind: text('kind').notNull(),
    rule: jsonb('rule').$type<AlertRule>().notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    lastKnownState: text('last_known_state').default('UNKNOWN').notNull(),
    evaluation: jsonb('evaluation').$type<Evaluation>(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      'alert_valid',
      sql`length(${t.title}) BETWEEN 1 AND 60 AND ${t.kind} IN ('THRESHOLD','DATA_RISK','PROVIDER_DOWN','NARRATIVE_CHANGE','RISK','LIQUIDITY') AND ${t.rule}->>'kind'=${t.kind} AND octet_length(${t.rule}::text)<=2048 AND ${t.lastKnownState} IN ('UNKNOWN','CLEAR','TRIGGERED') AND (${t.evaluation} IS NULL OR octet_length(${t.evaluation}::text)<=8192)`,
    ),
  ],
);
export const alertNotifications = pgTable(
  'alert_notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    alertId: uuid('alert_id')
      .notNull()
      .references(() => alerts.id, { onDelete: 'cascade' }),
    state: text('state').notNull(),
    evaluation: jsonb('evaluation').$type<Evaluation>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('notification_retention_idx').on(t.createdAt),
    check(
      'notification_valid',
      sql`${t.state} IN ('TRIGGERED','RECOVERED') AND octet_length(${t.evaluation}::text)<=8192`,
    ),
  ],
);
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
import type { RiskSnapshot } from '@terminal/domain/token-risk';
import type { WalletTransaction } from '@terminal/domain/wallets';
import type {
  MacroObservation,
  ResearchEvent,
  EventImpact,
} from '@terminal/domain/events';
export const macroObservations = pgTable(
  'macro_observations',
  {
    seriesId: text('series_id').notNull(),
    date: text('date').notNull(),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull(),
    observation: jsonb('observation').$type<MacroObservation>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.seriesId, t.date, t.collectedAt] }),
    index('macro_retention_idx').on(t.collectedAt),
    check(
      'macro_lineage_valid',
      sql`octet_length(${t.observation}::text)<=4096 AND ${t.observation}->>'seriesId'=${t.seriesId} AND ${t.observation}->>'date'=${t.date} AND ${t.observation}->'provenance'->>'providerId'='fred' AND ${t.observation}->'provenance'->>'quality'='DIRECT'`,
    ),
  ],
);
export const researchEvents = pgTable(
  'research_events',
  {
    id: text('id').primaryKey(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    observation: jsonb('observation').$type<ResearchEvent>().notNull(),
  },
  (t) => [
    index('event_time_idx').on(t.timestamp),
    check(
      'event_payload_valid',
      sql`octet_length(${t.observation}::text)<=4096 AND ${t.observation}->>'id'=${t.id}`,
    ),
  ],
);
export const eventImpacts = pgTable(
  'event_impacts',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => researchEvents.id),
    asset: text('asset').notNull(),
    windowMinutes: integer('window_minutes').notNull(),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull(),
    observation: jsonb('observation').$type<EventImpact>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.asset, t.windowMinutes] }),
    check(
      'event_impact_valid',
      sql`${t.asset} IN ('BTC','ETH','SOL') AND ${t.windowMinutes} IN (5,60,240,1440) AND octet_length(${t.observation}::text)<=4096`,
    ),
  ],
);
export const walletProviderBudget = pgTable(
  'wallet_provider_budget',
  { day: text('day').primaryKey(), requests: integer('requests').notNull() },
  (t) => [
    check('wallet_daily_budget_valid', sql`${t.requests} BETWEEN 1 AND 4`),
  ],
);

export const providerStatus = pgEnum('provider_status', [
  'HEALTHY',
  'DEGRADED',
  'STALE',
  'DOWN',
]);

export const trackedWallets = pgTable(
  'tracked_wallets',
  {
    address: text('address').primaryKey(),
    label: text('label').notNull(),
    labelSource: text('label_source').notNull(),
    active: boolean('active').notNull().default(true),
    firstObservedAt: timestamp('first_observed_at', { withTimezone: true }),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    coverage: text('coverage').notNull().default('UNAVAILABLE'),
  },
  (t) => [
    check(
      'wallet_coverage_valid',
      sql`${t.coverage} IN ('UNAVAILABLE','BOUNDED','TRUNCATED')`,
    ),
  ],
);
export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    walletAddress: text('wallet_address')
      .notNull()
      .references(() => trackedWallets.address),
    signature: text('signature').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    observation: jsonb('observation').$type<WalletTransaction>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.walletAddress, t.signature] }),
    index('wallet_history_idx').on(t.walletAddress, t.timestamp),
    index('wallet_retention_idx').on(t.timestamp),
    check(
      'wallet_observation_bounded',
      sql`octet_length(${t.observation}::text)<=65536 AND ${t.observation}->>'signature'=${t.signature} AND ${t.observation}->'provenance'->>'providerId'='helius' AND ${t.observation}->'provenance'->>'quality'='AGGREGATED'`,
    ),
  ],
);
export const walletHistorySummaries = pgTable(
  'wallet_history_summaries',
  {
    walletAddress: text('wallet_address')
      .notNull()
      .references(() => trackedWallets.address),
    month: text('month').notNull(),
    transactionCount: integer('transaction_count').notNull(),
    failedCount: integer('failed_count').notNull(),
    firstObservedAt: timestamp('first_observed_at', {
      withTimezone: true,
    }).notNull(),
    lastObservedAt: timestamp('last_observed_at', {
      withTimezone: true,
    }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.walletAddress, t.month] }),
    check(
      'wallet_summary_counts_valid',
      sql`${t.transactionCount}>0 AND ${t.failedCount} BETWEEN 0 AND ${t.transactionCount} AND ${t.firstObservedAt}<=${t.lastObservedAt}`,
    ),
  ],
);
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

export const trackedTokens = pgTable(
  'tracked_tokens',
  {
    id: text('id').primaryKey(),
    chain: text('chain').notNull(),
    address: text('address').notNull(),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    check(
      'token_chain_valid',
      sql`${table.chain} IN ('solana','ethereum','base','bsc')`,
    ),
  ],
);
export const dexPairs = pgTable('dex_pairs', {
  id: text('id').primaryKey(),
  tokenId: text('token_id')
    .notNull()
    .references(() => trackedTokens.id),
  address: text('address').notNull(),
  dex: text('dex').notNull(),
  active: boolean('active').notNull().default(true),
  quoteSymbol: text('quote_symbol').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
});
export const dexSnapshots = pgTable(
  'dex_snapshots',
  {
    pairId: text('pair_id')
      .notNull()
      .references(() => dexPairs.id),
    bucketAt: timestamp('bucket_at', { withTimezone: true }).notNull(),
    priceUsd: numeric('price_usd', { precision: 38, scale: 18 }),
    liquidityUsd: numeric('liquidity_usd', { precision: 38, scale: 8 }),
    volume24hUsd: numeric('volume_24h_usd', { precision: 38, scale: 8 }),
    marketCapUsd: numeric('market_cap_usd', { precision: 38, scale: 8 }),
    fdvUsd: numeric('fdv_usd', { precision: 38, scale: 8 }),
    priceChange24h: numeric('price_change_24h', { precision: 20, scale: 8 }),
    ...observationColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.pairId, table.bucketAt] }),
    index('dex_retention_idx').on(table.bucketAt),
    check(
      'dex_values_valid',
      sql`(${table.priceUsd} IS NULL OR ${table.priceUsd}>0) AND (${table.liquidityUsd} IS NULL OR ${table.liquidityUsd}>=0) AND (${table.volume24hUsd} IS NULL OR ${table.volume24hUsd}>=0) AND (${table.marketCapUsd} IS NULL OR ${table.marketCapUsd}>=0) AND (${table.fdvUsd} IS NULL OR ${table.fdvUsd}>=0) AND ${table.quality}='AGGREGATED' AND length(${table.providerId})>0 AND length(${table.source})>0`,
    ),
  ],
);
export const tokenSecuritySnapshots = pgTable(
  'token_security_snapshots',
  {
    tokenId: text('token_id')
      .notNull()
      .references(() => trackedTokens.id),
    bucketAt: timestamp('bucket_at', { withTimezone: true }).notNull(),
    mintable: boolean('mintable'),
    freezable: boolean('freezable'),
    balanceMutable: boolean('balance_mutable'),
    closable: boolean('closable'),
    feeUpgradable: boolean('fee_upgradable'),
    hookUpgradable: boolean('hook_upgradable'),
    nonTransferable: boolean('non_transferable'),
    defaultStateUpgradable: boolean('default_state_upgradable'),
    top10HolderShare: numeric('top10_holder_share', {
      precision: 12,
      scale: 8,
    }),
    holderCount: numeric('holder_count', { precision: 20, scale: 0 }),
    trustedToken: boolean('trusted_token'),
    ...observationColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.tokenId, table.bucketAt] }),
    index('token_security_retention_idx').on(table.bucketAt),
    check(
      'token_security_valid',
      sql`(${table.top10HolderShare} IS NULL OR ${table.top10HolderShare} BETWEEN 0 AND 1) AND (${table.holderCount} IS NULL OR ${table.holderCount}>=0) AND ${table.quality}='AGGREGATED' AND length(${table.source})>0 AND length(${table.providerId})>0`,
    ),
  ],
);
export const riskSnapshots = pgTable(
  'risk_snapshots',
  {
    tokenId: text('token_id')
      .notNull()
      .references(() => trackedTokens.id),
    pairId: text('pair_id').references(() => dexPairs.id),
    bucketAt: timestamp('bucket_at', { withTimezone: true }).notNull(),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull(),
    contractScore: numeric('contract_score', { precision: 12, scale: 6 }),
    contractCoverage: numeric('contract_coverage', {
      precision: 8,
      scale: 6,
    }).notNull(),
    ownershipScore: numeric('ownership_score', { precision: 12, scale: 6 }),
    ownershipCoverage: numeric('ownership_coverage', {
      precision: 8,
      scale: 6,
    }).notNull(),
    liquidityScore: numeric('liquidity_score', { precision: 12, scale: 6 }),
    liquidityCoverage: numeric('liquidity_coverage', {
      precision: 8,
      scale: 6,
    }).notNull(),
    structureScore: numeric('structure_score', { precision: 12, scale: 6 }),
    structureCoverage: numeric('structure_coverage', {
      precision: 8,
      scale: 6,
    }).notNull(),
    categories: jsonb('categories')
      .$type<RiskSnapshot['categories']>()
      .notNull(),
    liquidityChange1h: numeric('liquidity_change_1h', {
      precision: 20,
      scale: 8,
    }),
    volumeLiquidityRatio: numeric('volume_liquidity_ratio', {
      precision: 20,
      scale: 8,
    }),
    vacuum: text('vacuum').notNull(),
    vacuumReason: text('vacuum_reason').notNull(),
    ...observationColumns(),
  },
  (table) => [
    primaryKey({
      columns: [table.tokenId, table.bucketAt, table.methodologyVersion],
    }),
    index('risk_retention_idx').on(table.bucketAt),
    check(
      'risk_snapshot_valid',
      sql`${table.quality}='DERIVED' AND length(${table.methodologyVersion})>0 AND jsonb_array_length(${table.categories})=4 AND octet_length(${table.categories}::text)<=65536 AND ${table.vacuum} IN ('UNAVAILABLE','HEALTHY','THINNING','VACUUM_FORMING','CRITICAL')`,
    ),
    ...[
      {
        name: 'contract',
        score: table.contractScore,
        coverage: table.contractCoverage,
      },
      {
        name: 'ownership',
        score: table.ownershipScore,
        coverage: table.ownershipCoverage,
      },
      {
        name: 'liquidity',
        score: table.liquidityScore,
        coverage: table.liquidityCoverage,
      },
      {
        name: 'structure',
        score: table.structureScore,
        coverage: table.structureCoverage,
      },
    ].map((c) =>
      check(
        `risk_${c.name}_valid`,
        sql`${c.coverage} BETWEEN 0 AND 1 AND (${c.score} IS NULL OR (${c.coverage}=1 AND ${c.score} BETWEEN 0 AND 100))`,
      ),
    ),
  ],
);
