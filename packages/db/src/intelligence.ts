import { and, desc, eq, sql, inArray } from 'drizzle-orm';
import type { DatabaseConnection } from './index';
import { queryMarkets, queryCandles } from './market';
import {
  markets,
  fundingRates,
  openInterest,
  featureSnapshots,
  narratives,
  assetNarratives,
  narrativeSnapshots,
  signalSnapshots,
  signalExplanations,
} from './schema';
import {
  calculateFeatures,
  featureSchema,
  narrativeSnapshotSchema,
  signalSchema,
  taxonomy,
  initialExposures,
  validateExposures,
  scoreNarrative,
  featureVersion,
  narrativeVersion,
  type Feature,
  type NarrativeSnapshot,
  type Signal,
  type IntelligenceResponse,
  featureNames,
} from '@terminal/domain/intelligence';
import {
  applySectorStrength,
  calculateSignals,
  signalVersion,
  type FeatureMember,
} from '@terminal/domain/signals';
import type { Provenance } from '@terminal/domain';
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
const metricColumns = {
  return_5m: 'return5m',
  return_1h: 'return1h',
  return_24h: 'return24h',
  return_7d: 'return7d',
  relative_strength_btc: 'relativeStrengthBtc',
  relative_strength_sector: 'relativeStrengthSector',
  volume_zscore: 'volumeZscore',
  volume_acceleration: 'volumeAcceleration',
  oi_change_1h: 'oiChange1h',
  oi_change_24h: 'oiChange24h',
  funding_zscore: 'fundingZscore',
  btc_corr_30d: 'btcCorrelation30d',
  perp_basis: 'perpBasis',
  realized_volatility_24h: 'realizedVolatility24h',
} as const;
type MetricColumn = (typeof metricColumns)[keyof typeof metricColumns];
const number = (value: string | null) =>
  value === null ? null : Number(value);
export async function persistIntelligence(
  connection: DatabaseConnection,
  data: {
    features: Feature[];
    narratives: NarrativeSnapshot[];
    signals: Signal[];
  },
) {
  if (
    data.features.length > 420 ||
    data.narratives.length > 15 ||
    data.signals.length > 2
  )
    throw new Error('INTELLIGENCE_BATCH_LIMIT');
  const features = data.features.map((value) => featureSchema.parse(value));
  const snapshots = data.narratives.map((value) =>
    narrativeSnapshotSchema.parse(value),
  );
  const signals = data.signals.map((value) => signalSchema.parse(value));
  await connection.db.transaction(async (tx) => {
    const groups = new Map<string, Feature[]>();
    for (const feature of features) {
      const key =
        feature.marketId +
        '|' +
        feature.bucketAt +
        '|' +
        feature.provenance.methodologyVersion;
      const group = groups.get(key) ?? [];
      group.push(feature);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const first = group[0];
      if (
        !first ||
        group.length !== featureNames.length ||
        new Set(group.map((item) => item.name)).size !== featureNames.length
      )
        throw new Error('INCOMPLETE_FEATURE_GROUP');
      const metrics = Object.fromEntries(
        featureNames.map((name) => {
          const item = group.find((feature) => feature.name === name);
          return [
            metricColumns[name],
            item?.value == null ? null : String(item.value),
          ];
        }),
      ) as Record<MetricColumn, string | null>;
      const row = {
        marketId: first.marketId,
        bucketAt: new Date(first.bucketAt),
        calculatedAt: new Date(first.calculatedAt),
        ...metrics,
        metadata: group.map((item) => ({
          name: item.name,
          state: item.state,
          unit: item.unit,
          inputs: item.inputs,
          provenance: item.provenance,
        })),
        ...writeProvenance({
          ...first.provenance,
          source: 'market-features:v1',
          sourceTimestamp:
            group
              .map((item) => item.provenance.sourceTimestamp)
              .sort()
              .at(-1) ?? first.provenance.sourceTimestamp,
        }),
      };
      await tx
        .insert(featureSnapshots)
        .values(row)
        .onConflictDoUpdate({
          target: [
            featureSnapshots.marketId,
            featureSnapshots.bucketAt,
            featureSnapshots.methodologyVersion,
          ],
          set: row,
          setWhere: sql`excluded.calculated_at >= ${featureSnapshots.calculatedAt}`,
        });
    }
    for (const snapshot of snapshots) {
      const row = {
        narrativeId: snapshot.narrativeId,
        bucketAt: new Date(snapshot.bucketAt),
        calculatedAt: new Date(snapshot.calculatedAt),
        score: snapshot.score === null ? null : String(snapshot.score),
        partialScore:
          snapshot.partialScore === null ? null : String(snapshot.partialScore),
        coverage: String(snapshot.coverage),
        assetCount: snapshot.assetCount,
        components: snapshot.components,
        ...writeProvenance(snapshot.provenance),
      };
      await tx
        .insert(narrativeSnapshots)
        .values(row)
        .onConflictDoUpdate({
          target: [
            narrativeSnapshots.narrativeId,
            narrativeSnapshots.bucketAt,
            narrativeSnapshots.methodologyVersion,
          ],
          set: row,
          setWhere: sql`excluded.calculated_at >= ${narrativeSnapshots.calculatedAt}`,
        });
    }
    for (const signal of signals) {
      const row = {
        id: signal.id,
        kind: signal.kind,
        bucketAt: new Date(signal.bucketAt),
        calculatedAt: new Date(signal.calculatedAt),
        state: signal.state,
        value: signal.value === null ? null : String(signal.value),
        coverage: String(signal.coverage),
        ...writeProvenance(signal.provenance),
      };
      const saved = await tx
        .insert(signalSnapshots)
        .values(row)
        .onConflictDoUpdate({
          target: signalSnapshots.id,
          set: row,
          setWhere: sql`excluded.calculated_at >= ${signalSnapshots.calculatedAt}`,
        })
        .returning({ id: signalSnapshots.id });
      if (saved.length) {
        await tx
          .delete(signalExplanations)
          .where(eq(signalExplanations.signalId, signal.id));
        for (const factor of signal.factors)
          await tx.insert(signalExplanations).values({
            signalId: signal.id,
            name: factor.name,
            value: factor.value === null ? null : String(factor.value),
            unit: factor.unit,
            reason: factor.reason,
          });
      }
    }
  });
}
export async function computeIntelligence(
  connection: DatabaseConnection,
  now = new Date(),
  includeNarratives = true,
  signal?: AbortSignal,
  expectedAssets?: number,
) {
  signal?.throwIfAborted();
  const response = await queryMarkets(connection, now);
  const btc = response.rows.find((market) => market.base === 'BTC');
  const btcCandles = btc
    ? [
        ...(await queryCandles(connection, btc.id, '1h', 1000)),
        ...(await queryCandles(connection, btc.id, '1d', 31)),
      ]
    : [];
  const members: FeatureMember[] = [];
  for (const market of response.rows) {
    signal?.throwIfAborted();
    const candles = [
      ...(await queryCandles(connection, market.id, '1h', 1000)),
      ...(await queryCandles(connection, market.id, '1d', 31)),
      ...(await queryCandles(connection, market.id, '5m', 2)),
    ];
    const [perp] = await connection.db
      .select()
      .from(markets)
      .where(
        and(eq(markets.assetId, market.assetId), eq(markets.kind, 'PERPETUAL')),
      )
      .limit(1);
    const funding = perp
      ? await connection.db
          .select()
          .from(fundingRates)
          .where(eq(fundingRates.marketId, perp.id))
          .orderBy(desc(fundingRates.sourceTimestamp))
          .limit(96)
      : [];
    const interest = perp
      ? await connection.db
          .select()
          .from(openInterest)
          .where(eq(openInterest.marketId, perp.id))
          .orderBy(desc(openInterest.sourceTimestamp))
          .limit(500)
      : [];
    const features = calculateFeatures(
      {
        market,
        candles,
        btcCandles,
        funding: funding.map((row) => ({
          marketId: row.marketId,
          rate: Number(row.rate),
          markPrice: Number(row.markPrice),
          nextFundingAt: row.nextFundingAt.toISOString(),
          provenance: readProvenance(row),
        })),
        oi: interest.map((row) => ({
          marketId: row.marketId,
          quantity: Number(row.quantity),
          unit: row.unit,
          provenance: readProvenance(row),
        })),
      },
      now,
    );
    members.push({ assetId: market.assetId, marketId: market.id, features });
  }
  validateExposures(initialExposures);
  signal?.throwIfAborted();
  await connection.db.transaction(async (tx) => {
    for (const item of taxonomy)
      await tx
        .insert(narratives)
        .values({ ...item, taxonomyVersion: 'curated-taxonomy:v1' })
        .onConflictDoNothing();
    for (const exposure of initialExposures.filter((exposure) =>
      members.some((member) => member.assetId === exposure.assetId),
    ))
      await tx
        .insert(assetNarratives)
        .values({
          ...exposure,
          weight: String(exposure.weight),
          methodologyVersion: 'curated-taxonomy:v1',
        })
        .onConflictDoNothing();
  });
  const stored = await connection.db.select().from(assetNarratives).limit(120);
  const exposures = stored.map((row) => ({
    ...row,
    weight: Number(row.weight),
  }));
  applySectorStrength(members, exposures);
  const data = {
    features: members.flatMap((member) => member.features),
    signals: calculateSignals(members, now, expectedAssets),
    narratives: includeNarratives
      ? taxonomy.map((item) => scoreNarrative(item.id, members, exposures, now))
      : [],
  };
  await persistIntelligence(connection, data);
  return {
    markets: members.length,
    features: data.features.length,
    narratives: data.narratives.length,
  };
}
export async function queryIntelligence(
  connection: DatabaseConnection,
  now = new Date(),
): Promise<IntelligenceResponse> {
  const features = await connection.db
    .selectDistinctOn([featureSnapshots.marketId])
    .from(featureSnapshots)
    .where(
      and(
        eq(featureSnapshots.methodologyVersion, featureVersion),
        sql`${featureSnapshots.bucketAt} >= ${new Date(now.getTime() - 86400000).toISOString()}::timestamptz`,
      ),
    )
    .orderBy(featureSnapshots.marketId, desc(featureSnapshots.calculatedAt))
    .limit(30);
  const snapshots = await connection.db
    .selectDistinctOn([narrativeSnapshots.narrativeId])
    .from(narrativeSnapshots)
    .where(
      and(
        eq(narrativeSnapshots.methodologyVersion, narrativeVersion),
        sql`${narrativeSnapshots.bucketAt} >= ${new Date(now.getTime() - 86400000).toISOString()}::timestamptz`,
      ),
    )
    .orderBy(
      narrativeSnapshots.narrativeId,
      desc(narrativeSnapshots.calculatedAt),
    )
    .limit(15);
  const signals = await connection.db
    .selectDistinctOn([signalSnapshots.kind])
    .from(signalSnapshots)
    .where(
      and(
        eq(signalSnapshots.methodologyVersion, signalVersion),
        sql`${signalSnapshots.bucketAt} >= ${new Date(now.getTime() - 86400000).toISOString()}::timestamptz`,
      ),
    )
    .orderBy(signalSnapshots.kind, desc(signalSnapshots.calculatedAt))
    .limit(2);
  const factors = signals.length
    ? await connection.db
        .select()
        .from(signalExplanations)
        .where(
          inArray(
            signalExplanations.signalId,
            signals.map((signal) => signal.id),
          ),
        )
        .limit(16)
    : [];
  return {
    state: features.length ? 'READY' : 'EMPTY',
    observedAt: now.toISOString(),
    features: features.flatMap((row) =>
      row.metadata.map((metadata) =>
        featureSchema.parse({
          ...metadata,
          marketId: row.marketId,
          value: number(row[metricColumns[metadata.name]]),
          bucketAt: row.bucketAt.toISOString(),
          calculatedAt: row.calculatedAt.toISOString(),
        }),
      ),
    ),
    narratives: snapshots.map((row) =>
      narrativeSnapshotSchema.parse({
        ...row,
        score: number(row.score),
        partialScore: number(row.partialScore),
        coverage: Number(row.coverage),
        bucketAt: row.bucketAt.toISOString(),
        calculatedAt: row.calculatedAt.toISOString(),
        provenance: readProvenance(row),
      }),
    ),
    signals: signals.map((row) =>
      signalSchema.parse({
        ...row,
        value: number(row.value),
        coverage: Number(row.coverage),
        bucketAt: row.bucketAt.toISOString(),
        calculatedAt: row.calculatedAt.toISOString(),
        factors: factors
          .filter((factor) => factor.signalId === row.id)
          .map((factor) => ({ ...factor, value: number(factor.value) })),
        provenance: readProvenance(row),
      }),
    ),
    taxonomy: await connection.db
      .select({ id: narratives.id, label: narratives.label })
      .from(narratives)
      .limit(15),
    exposures: (
      await connection.db.select().from(assetNarratives).limit(120)
    ).map((row) => ({ ...row, weight: Number(row.weight) })),
  };
}
export async function retainIntelligence(
  connection: DatabaseConnection,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - 180 * 86400000).toISOString();
  let removed = 0;
  for (const table of [featureSnapshots, narrativeSnapshots, signalSnapshots]) {
    const rows = await connection.db.execute(
      sql`DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE ${table.bucketAt} < ${cutoff}::timestamptz LIMIT 5000) RETURNING 1`,
    );
    removed += rows.length;
  }
  return removed;
}
