import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import {
  createDatabase,
  type DatabaseConnection,
} from '../../packages/db/src/index';
import { runMigrations } from '../../packages/db/src/migrate';
import {
  persistMarkets,
  persistObservations,
} from '../../packages/db/src/market';
import {
  computeIntelligence,
  persistIntelligence,
  queryIntelligence,
  retainIntelligence,
} from '../../packages/db/src/intelligence';
import {
  narratives,
  featureSnapshots,
  narrativeSnapshots,
} from '../../packages/db/src/schema';
import {
  calculateFeatures,
  taxonomy,
  scoreNarrative,
  type Feature,
} from '../../packages/domain/src/intelligence';
import { calculateSignals } from '../../packages/domain/src/signals';
import {
  fixtureInput,
  fixtureMarket,
  fixtureNow,
} from '../fixtures/market-history';
let connection: DatabaseConnection;
beforeAll(async () => {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('TEST_DATABASE_URL required');
  const target = new URL(value);
  if (
    target.pathname !== '/terminal_test' ||
    !['127.0.0.1', 'localhost'].includes(target.hostname)
  )
    throw new Error('Local disposable terminal_test required');
  connection = createDatabase(value);
  await runMigrations(value);
});
beforeEach(async () => {
  await connection.client`TRUNCATE signal_explanations, signal_snapshots, narrative_snapshots, asset_narratives, narratives, feature_snapshots, ingestion_runs, provider_health, funding_rates, open_interest, ohlcv, market_snapshots, markets, assets, venues CASCADE`;
  await persistMarkets(
    connection,
    ['BTC', 'ETH', 'AAVE'].map((base) => fixtureMarket(base)),
    fixtureNow,
  );
  await connection.db.insert(narratives).values(
    taxonomy.map((item) => ({
      ...item,
      taxonomyVersion: 'curated-taxonomy:v1',
    })),
  );
});
afterAll(async () => {
  if (connection) await connection.client.end({ timeout: 3 });
});
const features = () => calculateFeatures(fixtureInput(), fixtureNow);
const empty = { narratives: [], signals: [] };
const shift = (value: string, days: number) =>
  new Date(Date.parse(value) - days * 86400000).toISOString();
const aged = (values: Feature[], days: number): Feature[] =>
  values.map((item) => ({
    ...item,
    bucketAt: shift(item.bucketAt, days),
    calculatedAt: shift(item.calculatedAt, days),
    provenance: {
      ...item.provenance,
      sourceTimestamp: shift(item.provenance.sourceTimestamp, days),
      ingestedAt: shift(item.provenance.ingestedAt, days),
    },
    inputs: item.inputs.map((ref) => ({
      ...ref,
      from: shift(ref.from, days),
      to: shift(ref.to, days),
    })),
  }));
describe('feature and narrative database pipeline', () => {
  it('derives persisted closed history, preserves inputs and does not fabricate missing components', async () => {
    for (const base of ['BTC', 'ETH', 'AAVE']) {
      const input = fixtureInput(base);
      await persistObservations(connection, {
        snapshots: [input.market],
        candles: input.candles,
      });
    }
    await computeIntelligence(connection, fixtureNow);
    await computeIntelligence(connection, fixtureNow);
    const response = await queryIntelligence(connection, fixtureNow);
    expect(response.features).toHaveLength(42);
    expect(response.narratives).toHaveLength(15);
    expect(response.signals).toHaveLength(2);
    expect(
      response.features.find(
        (item) =>
          item.marketId === fixtureMarket().id && item.name === 'return_24h',
      )?.inputs[0]?.providerId,
    ).toBe('test-fixture');
    expect(
      response.narratives.find((item) => item.narrativeId === 'defi')?.score,
    ).toBeNull();
    expect(
      response.narratives.find((item) => item.narrativeId === 'defi')?.coverage,
    ).toBeCloseTo(0.5);
    expect(response.signals.find((item) => item.kind === 'REGIME')?.state).toBe(
      'UNAVAILABLE',
    );
    expect(await connection.db.select().from(featureSnapshots)).toHaveLength(3);
  });
  it('upserts coherent feature groups idempotently and rejects duplicate/missing metrics', async () => {
    const batch = { ...empty, features: features() };
    await persistIntelligence(connection, batch);
    await persistIntelligence(connection, batch);
    expect(await connection.db.select().from(featureSnapshots)).toHaveLength(1);
    await expect(
      persistIntelligence(connection, {
        ...empty,
        features: batch.features.slice(1),
      }),
    ).rejects.toThrow('INCOMPLETE_FEATURE_GROUP');
    await expect(
      persistIntelligence(connection, {
        ...empty,
        features: [...batch.features.slice(1), batch.features[1]!],
      }),
    ).rejects.toThrow('INCOMPLETE_FEATURE_GROUP');
  });
  it('retains methodology versions within one time bucket and serves the active method', async () => {
    const original = features();
    const updated = original.map((item) => ({
      ...item,
      provenance: {
        ...item.provenance,
        methodologyVersion: 'market-features:v2',
      },
    }));
    await persistIntelligence(connection, {
      ...empty,
      features: [...original, ...updated],
    });
    expect(await connection.db.select().from(featureSnapshots)).toHaveLength(2);
    expect(
      (await queryIntelligence(connection, fixtureNow)).features,
    ).toHaveLength(14);
    expect(
      (await queryIntelligence(connection, fixtureNow)).features.every(
        (item) => item.provenance.methodologyVersion === 'market-features:v1',
      ),
    ).toBe(true);
    const signals = calculateSignals(
      [
        {
          assetId: 'binance:ETH',
          marketId: fixtureMarket().id,
          features: original,
        },
      ],
      fixtureNow,
    );
    await persistIntelligence(connection, { ...empty, features: [], signals });
    await persistIntelligence(connection, {
      ...empty,
      features: [],
      signals: signals.map((signal) => ({
        ...signal,
        id: signal.id + ':v2',
        calculatedAt: new Date(fixtureNow.getTime() + 1000).toISOString(),
        provenance: {
          ...signal.provenance,
          methodologyVersion: 'market-regime:v2',
        },
      })),
    });
    expect(
      (await queryIntelligence(connection, fixtureNow)).signals.every(
        (signal) =>
          signal.provenance.methodologyVersion ===
          'market-regime:v1+market-features:v1',
      ),
    ).toBe(true);
    expect(
      (await queryIntelligence(connection, fixtureNow)).signals,
    ).toHaveLength(2);
  });
  it('rolls back earlier feature groups when a later identity is invalid', async () => {
    await expect(
      persistIntelligence(connection, {
        ...empty,
        features: [
          ...features(),
          ...features().map((item) => ({
            ...item,
            marketId: 'unknown-market',
          })),
        ],
      }),
    ).rejects.toThrow();
    expect(await connection.db.select().from(featureSnapshots)).toHaveLength(0);
  });
  it('requires bounded metadata and refuses a full narrative score with partial coverage', async () => {
    const provenance = {
      providerId: 'test-fixture',
      source: 'synthetic-tests-only',
      sourceTimestamp: fixtureNow,
      ingestedAt: fixtureNow,
      quality: 'DERIVED' as const,
      methodologyVersion: 'test:v1',
    };
    await expect(
      connection.db.insert(featureSnapshots).values({
        marketId: fixtureMarket().id,
        bucketAt: fixtureNow,
        calculatedAt: fixtureNow,
        metadata: [],
        ...provenance,
      }),
    ).rejects.toThrow();
    const snapshot = scoreNarrative(
      'l1',
      [{ assetId: 'binance:ETH', features: features() }],
      [
        {
          assetId: 'binance:ETH',
          narrativeId: 'l1',
          weight: 1,
          source: 'https://example.test/classification',
        },
      ],
      fixtureNow,
    );
    await expect(
      connection.db.insert(narrativeSnapshots).values({
        narrativeId: 'l1',
        bucketAt: fixtureNow,
        calculatedAt: fixtureNow,
        score: '82',
        partialScore: '82',
        coverage: '.5',
        assetCount: 1,
        components: snapshot.components,
        ...provenance,
      }),
    ).rejects.toThrow();
  });
  it('retains the 180-day boundary and cascades expired signal explanations', async () => {
    const current = features();
    const old = aged(current, 181);
    const boundary = aged(current, 180);
    const members = [
      { assetId: 'binance:ETH', marketId: fixtureMarket().id, features: old },
    ];
    const oldTime = new Date(shift(fixtureNow.toISOString(), 181));
    const signals = calculateSignals(members, oldTime);
    await persistIntelligence(connection, {
      features: [...current, ...old, ...boundary],
      narratives: [],
      signals,
    });
    expect(await retainIntelligence(connection, fixtureNow)).toBe(3);
    expect(await connection.db.select().from(featureSnapshots)).toHaveLength(2);
    const counts =
      await connection.client`SELECT count(*)::int AS count FROM signal_explanations`;
    expect(counts[0]?.count).toBe(0);
  });
  it('bounds current queries and supports cancelled worker computation without writes', async () => {
    await persistIntelligence(connection, { ...empty, features: features() });
    expect(
      (
        await queryIntelligence(
          connection,
          new Date(fixtureNow.getTime() + 86400001),
        )
      ).state,
    ).toBe('EMPTY');
    const controller = new AbortController();
    controller.abort();
    await expect(
      computeIntelligence(connection, fixtureNow, true, controller.signal),
    ).rejects.toThrow();
    expect(await connection.db.select().from(featureSnapshots)).toHaveLength(1);
  });
});
