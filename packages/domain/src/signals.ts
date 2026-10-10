import {
  featureVersion,
  type Feature,
  type Exposure,
  type Signal,
  signalSchema,
  bucket,
  mean,
  validateExposures,
} from './intelligence';
export type FeatureMember = {
  assetId: string;
  marketId: string;
  features: Feature[];
};
export const signalVersion = `market-regime:v1+${featureVersion}`;
const value = (
  member: FeatureMember | undefined,
  name: Feature['name'],
  now?: Date,
) =>
  member?.features.find(
    (feature) =>
      feature.name === name &&
      feature.state === 'AVAILABLE' &&
      (!now ||
        (now.getTime() - Date.parse(feature.calculatedAt) >= 0 &&
          now.getTime() - Date.parse(feature.calculatedAt) <= 900000)),
  )?.value ?? null;
export function applySectorStrength(
  members: FeatureMember[],
  exposures: Exposure[],
) {
  validateExposures(exposures);
  for (const member of members) {
    const own = value(member, 'return_24h');
    const ownFeature = member.features.find(
      (feature) => feature.name === 'return_24h',
    );
    const output = member.features.find(
      (feature) => feature.name === 'relative_strength_sector',
    );
    if (!output || own === null || !ownFeature) continue;
    const ownTags = exposures.filter(
      (exposure) => exposure.assetId === member.assetId,
    );
    const peers = members
      .filter((peer) => peer.assetId !== member.assetId)
      .flatMap((peer) => {
        const feature = peer.features.find(
          (item) =>
            item.name === 'return_24h' &&
            item.state === 'AVAILABLE' &&
            item.provenance.sourceTimestamp ===
              ownFeature.provenance.sourceTimestamp,
        );
        if (!feature || feature.value === null) return [];
        const weight = exposures
          .filter((exposure) => exposure.assetId === peer.assetId)
          .reduce(
            (sum, exposure) =>
              sum +
              exposure.weight *
                (ownTags.find((tag) => tag.narrativeId === exposure.narrativeId)
                  ?.weight ?? 0),
            0,
          );
        return weight ? [{ feature, weight }] : [];
      });
    const weight = peers.reduce((sum, peer) => sum + peer.weight, 0);
    if (!weight) continue;
    output.value =
      own -
      peers.reduce(
        (sum, peer) => sum + (peer.feature.value ?? 0) * peer.weight,
        0,
      ) /
        weight;
    output.state = 'AVAILABLE';
    output.inputs = [
      ...ownFeature.inputs,
      ...peers.flatMap((peer) => peer.feature.inputs),
    ].slice(0, 32);
    output.provenance.sourceTimestamp = ownFeature.provenance.sourceTimestamp;
  }
}
export function calculateSignals(
  members: FeatureMember[],
  now: Date,
  expectedAssets = members.length,
): Signal[] {
  if (
    !Number.isInteger(expectedAssets) ||
    expectedAssets < members.length ||
    expectedAssets > 30
  )
    throw new Error('INVALID_UNIVERSE_SIZE');
  const eligible = members.flatMap((member) => {
    const result = value(member, 'return_24h', now);
    return result === null ? [] : [result];
  });
  const coverage = expectedAssets ? eligible.length / expectedAssets : 0;
  const breadth =
    eligible.length >= 3 && coverage >= 0.8
      ? eligible.filter((result) => result > 0).length / eligible.length
      : null;
  const btc = members.find((member) => member.assetId === 'binance:BTC');
  const trend = value(btc, 'return_7d', now);
  const growth = value(btc, 'oi_change_24h', now);
  const funding = value(btc, 'funding_zscore', now);
  const turnover = mean(
    members.flatMap((member) => {
      const result = value(member, 'volume_acceleration', now);
      return result === null ? [] : [result];
    }),
  );
  const factors = [
    {
      name: 'BTC 7D trend',
      value: trend,
      unit: 'percent',
      reason: 'Closed-hour endpoint return; direction heuristic',
    },
    {
      name: 'Sampled market breadth',
      value: breadth,
      unit: 'fraction',
      reason: `${eligible.length}/${expectedAssets} configured assets; not whole-market breadth`,
    },
    {
      name: 'BTC OI 24H growth',
      value: growth,
      unit: 'percent',
      reason: 'Base-unit open interest; derivatives may be unavailable',
    },
    {
      name: 'BTC funding positioning',
      value: funding,
      unit: 'zscore',
      reason: 'Observed rate normalization; no probability calibration',
    },
    {
      name: 'Turnover proxy',
      value: turnover,
      unit: 'ratio',
      reason:
        'Base-volume acceleration proxy; not measured executable liquidity',
    },
  ];
  let state: Signal['state'] = 'UNAVAILABLE';
  if (
    trend !== null &&
    breadth !== null &&
    growth !== null &&
    funding !== null &&
    turnover !== null
  ) {
    state =
      trend > 2 && breadth >= 0.6
        ? Math.abs(funding) >= 2 || growth >= 10
          ? 'RISK_ON_LEVERAGED'
          : 'RISK_ON_HEALTHY'
        : trend < -2 && breadth <= 0.4
          ? turnover < 0.5
            ? 'RISK_OFF_STRESSED'
            : 'RISK_OFF_LIQUID'
          : 'TRANSITION';
  }
  const provenance = {
    providerId: 'signal-engine',
    source: 'bounded-universe:feature-snapshots',
    sourceTimestamp:
      members
        .flatMap((member) =>
          member.features
            .filter((feature) => feature.value !== null)
            .map((feature) => feature.provenance.sourceTimestamp),
        )
        .sort()
        .at(-1) ?? now.toISOString(),
    ingestedAt: now.toISOString(),
    quality: 'DERIVED' as const,
    methodologyVersion: signalVersion,
  };
  const base = {
    bucketAt: bucket(now, 5),
    calculatedAt: now.toISOString(),
    provenance,
  };
  return [
    signalSchema.parse({
      ...base,
      id: `breadth:market-regime:v1:${base.bucketAt}`,
      kind: 'BREADTH',
      state: breadth === null ? 'UNAVAILABLE' : 'AVAILABLE',
      value: breadth,
      coverage,
      factors: [factors[1]],
    }),
    signalSchema.parse({
      ...base,
      id: `regime:market-regime:v1:${base.bucketAt}`,
      kind: 'REGIME',
      state,
      value: null,
      coverage:
        factors.filter((factor) => factor.value !== null).length /
        factors.length,
      factors,
    }),
  ];
}
