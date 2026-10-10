import { z } from 'zod';
import { provenanceSchema } from './index';
import {
  type Candle,
  type Funding,
  type OpenInterest,
  type MarketRow,
} from './market';

export const featureNames = [
  'return_5m',
  'return_1h',
  'return_24h',
  'return_7d',
  'relative_strength_btc',
  'relative_strength_sector',
  'volume_zscore',
  'volume_acceleration',
  'oi_change_1h',
  'oi_change_24h',
  'funding_zscore',
  'btc_corr_30d',
  'perp_basis',
  'realized_volatility_24h',
] as const;
export const featureVersion = 'market-features:v1';
export const narrativeVersion = 'narrative-rotation:v1';
export const taxonomy = [
  'AI',
  'Meme',
  'RWA',
  'DeFi',
  'L1',
  'L2',
  'DePIN',
  'Gaming',
  'Privacy',
  'DEX',
  'Perp DEX',
  'Restaking',
  'Stablecoin',
  'Modular',
  'Oracle',
].map((label) => ({ id: label.toLowerCase().replaceAll(' ', '-'), label }));
// Curated research allocations, not measured economic exposures or provider facts.
export const initialExposures = [
  {
    assetId: 'binance:ETH',
    narrativeId: 'l1',
    weight: 0.8,
    source: 'https://ethereum.org/what-is-ethereum/',
  },
  {
    assetId: 'binance:ETH',
    narrativeId: 'defi',
    weight: 0.2,
    source: 'https://ethereum.org/what-is-ethereum/',
  },
  {
    assetId: 'binance:DOGE',
    narrativeId: 'meme',
    weight: 1,
    source: 'https://dogecoin.com/',
  },
  {
    assetId: 'binance:AAVE',
    narrativeId: 'defi',
    weight: 1,
    source: 'https://aave.com/',
  },
  {
    assetId: 'binance:LINK',
    narrativeId: 'oracle',
    weight: 1,
    source: 'https://chain.link/',
  },
];
export const inputReferenceSchema = z.object({
  providerId: z.string().min(1),
  source: z.string().min(1),
  marketId: z.string().min(1),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  samples: z.number().int().min(1).max(1000),
});
export const featureSchema = z
  .object({
    marketId: z.string().min(1),
    name: z.enum(featureNames),
    value: z.number().finite().nullable(),
    unit: z.enum(['PERCENT', 'ZSCORE', 'RATIO', 'CORRELATION']),
    state: z.enum([
      'AVAILABLE',
      'INSUFFICIENT_HISTORY',
      'HISTORY_GAP',
      'STALE_INPUT',
      'ZERO_VARIANCE',
      'MISSING_INPUT',
    ]),
    bucketAt: z.iso.datetime(),
    calculatedAt: z.iso.datetime(),
    inputs: z.array(inputReferenceSchema).max(32),
    provenance: provenanceSchema,
  })
  .superRefine((value, context) => {
    if (
      (value.state === 'AVAILABLE') !== (value.value !== null) ||
      value.provenance.quality !== 'DERIVED' ||
      (value.value !== null && !value.inputs.length)
    )
      context.addIssue({
        code: 'custom',
        message:
          'Feature availability requires a derived value and input evidence',
      });
  });
export type Feature = z.infer<typeof featureSchema>;
export type InputReference = z.infer<typeof inputReferenceSchema>;
export type Exposure = {
  assetId: string;
  narrativeId: string;
  weight: number;
  source: string;
};
const classificationSourceSchema = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Classification source requires a safe HTTPS URL');
export const componentSchema = z.object({
  name: z.enum([
    'relative_strength',
    'volume',
    'oi_growth',
    'funding',
    'wallet_inflow',
    'protocol_activity',
  ]),
  weight: z.number().min(0).max(1),
  value: z.number().min(0).max(100).nullable(),
  availableAssetWeight: z.number().min(0).max(1),
  reason: z.string().max(180),
});
export type Component = z.infer<typeof componentSchema>;
export const narrativeSnapshotSchema = z.object({
  narrativeId: z.string().min(1),
  bucketAt: z.iso.datetime(),
  calculatedAt: z.iso.datetime(),
  score: z.number().min(0).max(100).nullable(),
  partialScore: z.number().min(0).max(100).nullable(),
  coverage: z.number().min(0).max(1),
  assetCount: z.number().int().min(0).max(30),
  components: z.array(componentSchema).length(6),
  provenance: provenanceSchema,
});
export type NarrativeSnapshot = z.infer<typeof narrativeSnapshotSchema>;
export const factorSchema = z.object({
  name: z.string().min(1).max(60),
  value: z.number().finite().nullable(),
  unit: z.string().max(40),
  reason: z.string().max(200),
});
export const signalSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['BREADTH', 'REGIME']),
  bucketAt: z.iso.datetime(),
  calculatedAt: z.iso.datetime(),
  state: z.enum([
    'AVAILABLE',
    'UNAVAILABLE',
    'RISK_ON_HEALTHY',
    'RISK_ON_LEVERAGED',
    'TRANSITION',
    'RISK_OFF_LIQUID',
    'RISK_OFF_STRESSED',
  ]),
  value: z.number().finite().nullable(),
  coverage: z.number().min(0).max(1),
  factors: z.array(factorSchema).max(8),
  provenance: provenanceSchema,
});
export type Signal = z.infer<typeof signalSchema>;
export const intelligenceResponseSchema = z.object({
  state: z.enum(['READY', 'EMPTY', 'NOT_CONFIGURED', 'UNAVAILABLE']),
  observedAt: z.iso.datetime(),
  features: z.array(featureSchema).max(420),
  narratives: z.array(narrativeSnapshotSchema).max(15),
  taxonomy: z.array(z.object({ id: z.string(), label: z.string() })).max(15),
  exposures: z
    .array(
      z.object({
        assetId: z.string(),
        narrativeId: z.string(),
        weight: z.number().min(0).max(1),
        source: classificationSourceSchema,
      }),
    )
    .max(120),
  signals: z.array(signalSchema).max(2),
});
export type IntelligenceResponse = z.infer<typeof intelligenceResponseSchema>;
export function bucket(now: Date, minutes: number) {
  return new Date(
    Math.floor(now.getTime() / (minutes * 60000)) * minutes * 60000,
  ).toISOString();
}
export function mean(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}
export function deviation(values: number[]) {
  if (!values.length) return null;
  let average = 0;
  let squared = 0;
  let count = 0;
  for (const value of values) {
    count++;
    const delta = value - average;
    average += delta / count;
    squared += delta * (value - average);
  }
  return Math.sqrt(Math.max(0, squared / count));
}
export function pearson(left: number[], right: number[]) {
  if (
    left.length !== right.length ||
    left.length < 3 ||
    [...left, ...right].some((value) => !Number.isFinite(value))
  )
    return null;
  const a = mean(left);
  const b = mean(right);
  if (
    a === null ||
    b === null ||
    left.every((value) => value === left[0]) ||
    right.every((value) => value === right[0])
  )
    return null;
  const va = left.reduce((sum, value) => sum + (value - a) ** 2, 0);
  const vb = right.reduce((sum, value) => sum + (value - b) ** 2, 0);
  if (!va || !vb) return null;
  return Math.max(
    -1,
    Math.min(
      1,
      left.reduce(
        (sum, value, index) => sum + (value - a) * ((right[index] ?? b) - b),
        0,
      ) / Math.sqrt(va * vb),
    ),
  );
}
const closed = (values: Candle[], now: Date) =>
  values
    .filter((value) => Date.parse(value.closeTime) < now.getTime())
    .sort((a, b) => Date.parse(a.openTime) - Date.parse(b.openTime));
const contiguous = (values: Candle[], interval: number) =>
  values.every(
    (value, index) =>
      !index ||
      Date.parse(value.openTime) -
        Date.parse(values[index - 1]?.openTime ?? '') ===
        interval,
  );
const ref = (values: Candle[]): InputReference[] => {
  const first = values[0];
  const last = values.at(-1);
  return first && last
    ? [
        {
          marketId: last.marketId,
          providerId: last.provenance.providerId,
          source: `${last.provenance.source}:${last.timeframe}`,
          from: first.openTime,
          to: last.closeTime,
          samples: values.length,
        },
      ]
    : [];
};
export function calculateFeatures(
  input: {
    market: MarketRow;
    candles: Candle[];
    btcCandles: Candle[];
    funding: Funding[];
    oi: OpenInterest[];
  },
  now: Date,
): Feature[] {
  const bars = closed(input.candles, now);
  const btc = closed(input.btcCandles, now);
  const hourly = bars.filter((bar) => bar.timeframe === '1h');
  const btcHourly = btc.filter((bar) => bar.timeframe === '1h');
  const results: Feature[] = [];
  function add(
    name: Feature['name'],
    value: number | null,
    unit: Feature['unit'],
    inputs: InputReference[],
    state: Feature['state'] = 'INSUFFICIENT_HISTORY',
  ) {
    const sourceTimestamp =
      inputs
        .map((item) => item.to)
        .sort()
        .at(-1) ?? input.market.provenance.sourceTimestamp;
    results.push(
      featureSchema.parse({
        marketId: input.market.id,
        name,
        value,
        unit,
        state: value === null ? state : 'AVAILABLE',
        bucketAt: bucket(now, 5),
        calculatedAt: now.toISOString(),
        inputs,
        provenance: {
          providerId: 'feature-engine',
          source: name,
          sourceTimestamp,
          ingestedAt: now.toISOString(),
          quality: 'DERIVED',
          methodologyVersion: featureVersion,
        },
      }),
    );
  }
  function returnWindow(values: Candle[], periods: number, interval: number) {
    const window = values.slice(-periods - 1);
    const last = window.at(-1);
    const first = window[0];
    const state: Feature['state'] =
      window.length < periods + 1
        ? 'INSUFFICIENT_HISTORY'
        : !contiguous(window, interval)
          ? 'HISTORY_GAP'
          : !last || now.getTime() - Date.parse(last.closeTime) > interval * 2
            ? 'STALE_INPUT'
            : 'AVAILABLE';
    return {
      value:
        state === 'AVAILABLE' && first && last
          ? 100 * (last.close / first.close - 1)
          : null,
      inputs: ref(window),
      state,
    };
  }
  for (const [name, count, frame, interval] of [
    ['return_5m', 1, '5m', 300000],
    ['return_1h', 1, '1h', 3600000],
    ['return_24h', 24, '1h', 3600000],
    ['return_7d', 168, '1h', 3600000],
  ] as const) {
    const value = returnWindow(
      bars.filter((bar) => bar.timeframe === frame),
      count,
      interval,
    );
    add(name, value.value, 'PERCENT', value.inputs, value.state);
  }
  const ownReturn = returnWindow(hourly, 24, 3600000);
  const benchmark = returnWindow(btcHourly, 24, 3600000);
  add(
    'relative_strength_btc',
    ownReturn.value !== null &&
      benchmark.value !== null &&
      hourly.at(-1)?.openTime === btcHourly.at(-1)?.openTime
      ? ownReturn.value - benchmark.value
      : null,
    'PERCENT',
    [...ownReturn.inputs, ...benchmark.inputs],
    ownReturn.value === null
      ? ownReturn.state
      : benchmark.value === null
        ? benchmark.state
        : 'HISTORY_GAP',
  );
  const volumes = hourly.slice(-48);
  const volumeReady =
    volumes.length === 48 &&
    contiguous(volumes, 3600000) &&
    now.getTime() - Date.parse(volumes.at(-1)?.closeTime ?? '') <= 7200000;
  const priorVolume = volumes
    .slice(0, 24)
    .reduce((sum, bar) => sum + bar.volume, 0);
  add(
    'volume_acceleration',
    volumeReady && priorVolume > 0
      ? volumes.slice(24).reduce((sum, bar) => sum + bar.volume, 0) /
          priorVolume
      : null,
    'RATIO',
    ref(volumes),
    volumeReady ? 'ZERO_VARIANCE' : 'INSUFFICIENT_HISTORY',
  );
  const recent = hourly.slice(-25);
  const history = recent.slice(0, -1).map((bar) => bar.volume);
  const dev = deviation(history);
  const average = mean(history);
  add(
    'volume_zscore',
    volumeReady && dev && average !== null
      ? ((recent.at(-1)?.volume ?? 0) - average) / dev
      : null,
    'ZSCORE',
    ref(recent),
    volumeReady ? 'ZERO_VARIANCE' : 'INSUFFICIENT_HISTORY',
  );
  const volatility = hourly.slice(-25);
  const returns = volatility
    .slice(1)
    .map((bar, index) =>
      Math.log(bar.close / (volatility[index]?.close ?? bar.close)),
    );
  const sigma = deviation(returns);
  add(
    'realized_volatility_24h',
    volumeReady && sigma !== null ? sigma * Math.sqrt(24) * 100 : null,
    'PERCENT',
    ref(volatility),
  );
  const daily = bars.filter((bar) => bar.timeframe === '1d').slice(-31);
  const btcDaily = btc.filter((bar) => bar.timeframe === '1d').slice(-31);
  const aligned =
    daily.length === 31 &&
    btcDaily.length === 31 &&
    contiguous(daily, 86400000) &&
    contiguous(btcDaily, 86400000) &&
    daily.every((bar, index) => bar.openTime === btcDaily[index]?.openTime) &&
    now.getTime() - Date.parse(daily.at(-1)?.closeTime ?? '') <= 172800000;
  const dailyReturns = (values: Candle[]) =>
    values
      .slice(1)
      .map((bar, index) =>
        Math.log(bar.close / (values[index]?.close ?? bar.close)),
      );
  add(
    'btc_corr_30d',
    aligned ? pearson(dailyReturns(daily), dailyReturns(btcDaily)) : null,
    'CORRELATION',
    [...ref(daily), ...ref(btcDaily)],
    aligned ? 'ZERO_VARIANCE' : 'INSUFFICIENT_HISTORY',
  );
  const oi = input.oi
    .filter(
      (value) =>
        Date.parse(value.provenance.sourceTimestamp) <= now.getTime() &&
        value.unit === input.market.base,
    )
    .sort(
      (a, b) =>
        Date.parse(a.provenance.sourceTimestamp) -
        Date.parse(b.provenance.sourceTimestamp),
    );
  const latestOi = oi.at(-1);
  const seriesRef = (values: (Funding | OpenInterest)[]): InputReference[] => {
    const first = values[0];
    const last = values.at(-1);
    return first && last
      ? [
          {
            marketId: last.marketId,
            providerId: last.provenance.providerId,
            source: last.provenance.source,
            from: first.provenance.sourceTimestamp,
            to: last.provenance.sourceTimestamp,
            samples: values.length,
          },
        ]
      : [];
  };
  for (const [name, hours] of [
    ['oi_change_1h', 1],
    ['oi_change_24h', 24],
  ] as const) {
    const target =
      Date.parse(latestOi?.provenance.sourceTimestamp ?? '') - hours * 3600000;
    const previous = oi
      .filter((value) => Date.parse(value.provenance.sourceTimestamp) <= target)
      .at(-1);
    const available =
      latestOi &&
      previous &&
      previous.quantity > 0 &&
      target - Date.parse(previous.provenance.sourceTimestamp) <= 600000 &&
      now.getTime() - Date.parse(latestOi.provenance.sourceTimestamp) <= 600000;
    add(
      name,
      available ? 100 * (latestOi.quantity / previous.quantity - 1) : null,
      'PERCENT',
      previous && latestOi ? seriesRef([previous, latestOi]) : [],
      latestOi ? 'STALE_INPUT' : 'MISSING_INPUT',
    );
  }
  const funding = input.funding
    .filter(
      (value) => Date.parse(value.provenance.sourceTimestamp) <= now.getTime(),
    )
    .sort(
      (a, b) =>
        Date.parse(a.provenance.sourceTimestamp) -
        Date.parse(b.provenance.sourceTimestamp),
    )
    .slice(-96);
  const rate = funding.at(-1);
  const rates = funding.slice(0, -1).map((value) => value.rate);
  const fundingDeviation = deviation(rates);
  const fundingAverage = mean(rates);
  const fundingReady =
    funding.length >= 30 &&
    rate &&
    now.getTime() - Date.parse(rate.provenance.sourceTimestamp) <= 600000;
  add(
    'funding_zscore',
    fundingReady && fundingDeviation && fundingAverage !== null
      ? (rate.rate - fundingAverage) / fundingDeviation
      : null,
    'ZSCORE',
    seriesRef(funding),
    fundingReady ? 'ZERO_VARIANCE' : 'MISSING_INPUT',
  );
  const mark = input.market.funding;
  const basisReady =
    mark &&
    now.getTime() - Date.parse(mark.provenance.sourceTimestamp) >= -5000 &&
    now.getTime() - Date.parse(mark.provenance.sourceTimestamp) <= 600000 &&
    now.getTime() - Date.parse(input.market.provenance.sourceTimestamp) >=
      -5000 &&
    now.getTime() - Date.parse(input.market.provenance.sourceTimestamp) <=
      90000;
  add(
    'perp_basis',
    basisReady ? 100 * (mark.markPrice / input.market.price - 1) : null,
    'PERCENT',
    mark
      ? [
          ...seriesRef([mark]),
          {
            marketId: input.market.id,
            providerId: input.market.provenance.providerId,
            source: input.market.provenance.source,
            from: input.market.provenance.sourceTimestamp,
            to: input.market.provenance.sourceTimestamp,
            samples: 1,
          },
        ]
      : [],
    'MISSING_INPUT',
  );
  add('relative_strength_sector', null, 'PERCENT', [], 'MISSING_INPUT');
  return results;
}
export function validateExposures(values: Exposure[]) {
  const sums = new Map<string, number>();
  if (values.length > 120) throw new Error('EXPOSURE_LIMIT');
  const keys = new Set<string>();
  for (const value of values) {
    if (!classificationSourceSchema.safeParse(value.source).success)
      throw new Error('INVALID_CLASSIFICATION_SOURCE');
    const key = `${value.assetId}:${value.narrativeId}`;
    if (
      keys.has(key) ||
      !taxonomy.some((item) => item.id === value.narrativeId) ||
      !Number.isFinite(value.weight) ||
      value.weight <= 0 ||
      value.weight > 1 ||
      !value.source
    )
      throw new Error('INVALID_EXPOSURE');
    keys.add(key);
    sums.set(value.assetId, (sums.get(value.assetId) ?? 0) + value.weight);
  }
  if ([...sums.values()].some((sum) => sum > 1 + 1e-9))
    throw new Error('EXPOSURE_WEIGHT_OVERFLOW');
}
const clamp = (value: number) => Math.min(100, Math.max(0, value));
export function scoreNarrative(
  narrativeId: string,
  members: { assetId: string; features: Feature[] }[],
  exposures: Exposure[],
  now: Date,
): NarrativeSnapshot {
  validateExposures(exposures);
  const selected = exposures.filter(
    (value) => value.narrativeId === narrativeId,
  );
  const totalWeight = selected.reduce((sum, value) => sum + value.weight, 0);
  const definitions: {
    name: Component['name'];
    weight: number;
    feature: Feature['name'] | null;
    transform: (value: number) => number;
  }[] = [
    {
      name: 'relative_strength',
      weight: 0.3,
      feature: 'relative_strength_btc',
      transform: (value) => clamp(50 + value * 5),
    },
    {
      name: 'volume',
      weight: 0.2,
      feature: 'volume_acceleration',
      transform: (value) => clamp(value * 50),
    },
    {
      name: 'oi_growth',
      weight: 0.15,
      feature: 'oi_change_24h',
      transform: (value) => clamp(50 + value * 2.5),
    },
    {
      name: 'funding',
      weight: 0.1,
      feature: 'funding_zscore',
      transform: (value) => clamp(100 - (Math.abs(value) / 3) * 100),
    },
    { name: 'wallet_inflow', weight: 0.15, feature: null, transform: clamp },
    { name: 'protocol_activity', weight: 0.1, feature: null, transform: clamp },
  ];
  const components = definitions.map((definition): Component => {
    const available = selected.flatMap((exposure) => {
      const feature = members
        .find((member) => member.assetId === exposure.assetId)
        ?.features.find(
          (feature) =>
            feature.name === definition.feature &&
            feature.state === 'AVAILABLE' &&
            feature.value !== null &&
            now.getTime() - Date.parse(feature.calculatedAt) >= 0 &&
            now.getTime() - Date.parse(feature.calculatedAt) <= 900000,
        );
      return feature?.value != null
        ? [
            {
              weight: exposure.weight,
              value: definition.transform(feature.value),
            },
          ]
        : [];
    });
    const weight = available.reduce((sum, value) => sum + value.weight, 0);
    return {
      name: definition.name,
      weight: definition.weight,
      value: weight
        ? available.reduce((sum, item) => sum + item.value * item.weight, 0) /
          weight
        : null,
      availableAssetWeight: totalWeight ? weight / totalWeight : 0,
      reason: !definition.feature
        ? 'Provider-derived evidence unavailable in this phase'
        : weight
          ? 'Versioned weighted research component; descriptive, uncalibrated'
          : 'Missing, stale or insufficient feature coverage',
    };
  });
  const coverage = components.reduce(
    (sum, item) =>
      sum + (item.value === null ? 0 : item.weight * item.availableAssetWeight),
    0,
  );
  const contribution = components.reduce(
    (sum, item) =>
      sum + (item.value ?? 0) * item.weight * item.availableAssetWeight,
    0,
  );
  return narrativeSnapshotSchema.parse({
    narrativeId,
    bucketAt: bucket(now, 15),
    calculatedAt: now.toISOString(),
    score: coverage >= 1 - 1e-9 ? contribution : null,
    partialScore: coverage ? contribution / coverage : null,
    coverage,
    assetCount: selected.length,
    components,
    provenance: {
      providerId: 'narrative-engine',
      source: 'curated-taxonomy+feature-snapshots',
      sourceTimestamp:
        members
          .filter((member) =>
            selected.some((exposure) => exposure.assetId === member.assetId),
          )
          .flatMap((member) =>
            member.features
              .filter(
                (feature) =>
                  feature.value !== null &&
                  feature.state === 'AVAILABLE' &&
                  definitions.some(
                    (definition) => definition.feature === feature.name,
                  ) &&
                  now.getTime() - Date.parse(feature.calculatedAt) >= 0 &&
                  now.getTime() - Date.parse(feature.calculatedAt) <= 900000,
              )
              .map((feature) => feature.provenance.sourceTimestamp),
          )
          .sort()
          .at(-1) ?? now.toISOString(),
      ingestedAt: now.toISOString(),
      quality: 'DERIVED',
      methodologyVersion: narrativeVersion,
    },
  });
}
