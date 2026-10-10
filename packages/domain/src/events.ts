import { z } from 'zod';
import { provenanceSchema, type Provenance } from './index';
import type { Candle, Funding, OpenInterest } from './market';

export const macroSeries = [
  {
    id: 'FEDFUNDS',
    label: 'Fed funds',
    unit: 'percent',
    frequency: 'monthly',
    transform: 'difference',
  },
  {
    id: 'CPIAUCSL',
    label: 'CPI',
    unit: 'index',
    frequency: 'monthly',
    transform: 'log_return',
  },
  {
    id: 'PCEPI',
    label: 'PCE price index',
    unit: 'index',
    frequency: 'monthly',
    transform: 'log_return',
  },
  {
    id: 'UNRATE',
    label: 'Unemployment',
    unit: 'percent',
    frequency: 'monthly',
    transform: 'difference',
  },
  {
    id: 'NFCI',
    label: 'Financial conditions',
    unit: 'index',
    frequency: 'weekly',
    transform: 'difference',
  },
  {
    id: 'WALCL',
    label: 'Fed assets',
    unit: 'million USD',
    frequency: 'weekly',
    transform: 'log_return',
  },
  {
    id: 'DGS10',
    label: 'US 10Y yield',
    unit: 'percent',
    frequency: 'daily',
    transform: 'difference',
  },
  {
    id: 'DGS2',
    label: 'US 2Y yield',
    unit: 'percent',
    frequency: 'daily',
    transform: 'difference',
  },
  {
    id: 'SP500',
    label: 'S&P 500',
    unit: 'index',
    frequency: 'daily',
    transform: 'log_return',
  },
  {
    id: 'NASDAQCOM',
    label: 'Nasdaq composite',
    unit: 'index',
    frequency: 'daily',
    transform: 'log_return',
  },
  {
    id: 'DTWEXBGS',
    label: 'Broad trade-weighted USD',
    unit: 'index',
    frequency: 'daily',
    transform: 'log_return',
  },
  {
    id: 'DCOILWTICO',
    label: 'WTI oil',
    unit: 'USD/barrel',
    frequency: 'daily',
    transform: 'difference',
  },
] as const;
export const macroIdSchema = z.enum(macroSeries.map((s) => s.id));
export const calendarDateSchema = z.iso.date();
export const macroObservationSchema = z
  .object({
    seriesId: macroIdSchema,
    date: calendarDateSchema,
    realtimeStart: calendarDateSchema,
    realtimeEnd: calendarDateSchema,
    value: z.number().finite().nullable(),
    provenance: provenanceSchema,
  })
  .superRefine((v, ctx) => {
    if (
      v.realtimeStart > v.realtimeEnd ||
      v.date > v.realtimeEnd ||
      v.realtimeEnd > v.provenance.ingestedAt.slice(0, 10) ||
      v.provenance.providerId !== 'fred' ||
      v.provenance.quality !== 'DIRECT' ||
      v.provenance.sourceTimestamp !== v.provenance.ingestedAt ||
      v.provenance.source !==
        `/fred/series/observations?series_id=${v.seriesId}`
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid macro lineage or dates',
      });
  });
export type MacroObservation = z.infer<typeof macroObservationSchema>;
export const publicSourceSchema = z
  .string()
  .url()
  .max(500)
  .refine((v) => {
    const u = new URL(v);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      ![...u.searchParams.keys()].some((k) =>
        /key|token|secret|password/i.test(k),
      )
    );
  }, 'Use a credential-free public HTTPS citation');
export const eventSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    timestamp: z.iso.datetime(),
    category: z.enum(['economic', 'policy', 'protocol', 'market']),
    title: z.string().trim().min(1).max(160),
    expected: z.number().finite().nullable(),
    actual: z.number().finite().nullable(),
    unit: z.string().trim().min(1).max(40),
    affectedAssets: z
      .array(z.enum(['BTC', 'ETH', 'SOL']))
      .min(1)
      .max(3)
      .refine((a) => new Set(a).size === a.length),
    source: publicSourceSchema,
    ingestion: z.literal('MANUAL_SOURCED'),
    collectedAt: z.iso.datetime(),
  })
  .superRefine((v, ctx) => {
    if (v.timestamp > v.collectedAt && v.actual !== null)
      ctx.addIssue({
        code: 'custom',
        message: 'A future event cannot have an observed actual value',
      });
  });
export type ResearchEvent = z.infer<typeof eventSchema>;
export const impactWindows = [5, 60, 240, 1440] as const;
export type EventImpact = {
  eventId: string;
  asset: 'BTC' | 'ETH' | 'SOL';
  windowMinutes: number;
  returnPct: number | null;
  volumeAbnormalityPct: number | null;
  oiChangePct: number | null;
  fundingChangeBps: number | null;
  anchorAt: string | null;
  endAt: string | null;
  reasons: string[];
  provenance: Provenance;
};
export function eventImpact(
  event: ResearchEvent,
  asset: EventImpact['asset'],
  minutes: (typeof impactWindows)[number],
  input: {
    candles: Candle[];
    oi: OpenInterest[];
    funding: Funding[];
  },
  asOf: Date,
): EventImpact {
  eventSchema.parse(event);
  if (
    !impactWindows.includes(minutes) ||
    !event.affectedAssets.includes(asset) ||
    [input.candles, input.oi, input.funding].some(
      (rows) => new Set(rows.map((r) => r.marketId)).size > 1,
    )
  )
    throw new Error('INVALID_EVENT_WINDOW_INPUT');
  const time = Date.parse(event.timestamp),
    end = time + minutes * 60000,
    now = asOf.getTime();
  const result: EventImpact = {
    eventId: event.id,
    asset,
    windowMinutes: minutes,
    returnPct: null,
    volumeAbnormalityPct: null,
    oiChangePct: null,
    fundingChangeBps: null,
    anchorAt: null,
    endAt: null,
    reasons: [],
    provenance: {
      providerId: 'terminal:event-study',
      source: `event:${event.id}; retained observed market data`,
      sourceTimestamp: asOf.toISOString(),
      ingestedAt: asOf.toISOString(),
      quality: 'DERIVED',
      methodologyVersion: 'event-impact:v1',
    },
  };
  if (end > now || Date.parse(event.collectedAt) > now) {
    result.reasons.push('WINDOW_OR_EVENT_NOT_YET_OBSERVED');
    return result;
  }
  const eligible = (p: Provenance) =>
    Date.parse(p.ingestedAt) <= now && Date.parse(p.sourceTimestamp) <= now;
  const bars = [
    ...new Map(
      input.candles
        .filter(
          (c) =>
            c.timeframe === '1m' &&
            eligible(c.provenance) &&
            Date.parse(c.closeTime) <= now,
        )
        .map((c) => [c.openTime, c]),
    ).values(),
  ].sort((a, b) => a.openTime.localeCompare(b.openTime));
  const before = (t: number) =>
    bars
      .filter(
        (b) =>
          Date.parse(b.closeTime) <= t && t - Date.parse(b.closeTime) <= 60000,
      )
      .at(-1);
  const start = before(time),
    finish = before(end);
  if (
    start &&
    finish &&
    Date.parse(finish.openTime) - Date.parse(start.openTime) === minutes * 60000
  ) {
    const path = bars.filter(
      (b) => b.openTime >= start.openTime && b.openTime <= finish.openTime,
    );
    const contiguous =
      path.length === minutes + 1 &&
      path.every(
        (b, i) =>
          i === 0 ||
          Date.parse(b.openTime) - Date.parse(path[i - 1]!.openTime) === 60000,
      );
    if (contiguous) {
      result.anchorAt = start.closeTime;
      result.endAt = finish.closeTime;
      result.returnPct = (finish.close / start.close - 1) * 100;
      const baseline = bars.filter(
        (b) =>
          b.openTime <= start.openTime &&
          Date.parse(b.openTime) > Date.parse(start.openTime) - minutes * 60000,
      );
      if (
        baseline.length === minutes &&
        baseline.every(
          (b, i) =>
            i === 0 ||
            Date.parse(b.openTime) - Date.parse(baseline[i - 1]!.openTime) ===
              60000,
        )
      ) {
        const prior = baseline.reduce((s, b) => s + b.volume, 0),
          post = path.slice(1).reduce((s, b) => s + b.volume, 0);
        if (prior > 0) result.volumeAbnormalityPct = (post / prior - 1) * 100;
      }
    }
  }
  if (result.returnPct === null)
    result.reasons.push('MISSING_OR_GAPPED_1M_WINDOW');
  if (result.volumeAbnormalityPct === null)
    result.reasons.push('MISSING_EQUAL_LENGTH_VOLUME_BASELINE');
  const observationsBefore = <T extends { provenance: Provenance }>(
    rows: T[],
    t: number,
    tolerance: number,
  ) =>
    rows
      .filter(
        (r) =>
          eligible(r.provenance) &&
          Date.parse(r.provenance.sourceTimestamp) <= t &&
          t - Date.parse(r.provenance.sourceTimestamp) <= tolerance,
      )
      .sort((a, b) =>
        a.provenance.sourceTimestamp.localeCompare(
          b.provenance.sourceTimestamp,
        ),
      )
      .at(-1);
  const oiA = observationsBefore(input.oi, time, 300000),
    oiB = observationsBefore(input.oi, end, 300000);
  if (
    oiA &&
    oiB &&
    oiA.unit === oiB.unit &&
    oiA.quantity > 0 &&
    oiB.provenance.sourceTimestamp > oiA.provenance.sourceTimestamp
  )
    result.oiChangePct = (oiB.quantity / oiA.quantity - 1) * 100;
  else result.reasons.push('MISSING_MATCHED_OI_BOUNDARIES');
  const fA = observationsBefore(input.funding, time, 1800000),
    fB = observationsBefore(input.funding, end, 1800000);
  if (fA && fB && fB.provenance.sourceTimestamp > fA.provenance.sourceTimestamp)
    result.fundingChangeBps = (fB.rate - fA.rate) * 10000;
  else result.reasons.push('MISSING_DISTINCT_FUNDING_BOUNDARIES');
  for (const key of [
    'returnPct',
    'volumeAbnormalityPct',
    'oiChangePct',
    'fundingChangeBps',
  ] as const) {
    if (result[key] !== null && !Number.isFinite(result[key])) {
      result[key] = null;
      result.reasons.push('NUMERICAL_OVERFLOW');
    }
  }
  return result;
}
export type ResearchPoint = { date: string; value: number | null };
export type Pair = { date: string; x: number; y: number };
export function alignedChanges(
  x: ResearchPoint[],
  y: ResearchPoint[],
  xTransform: 'log_return' | 'difference' = 'log_return',
): Pair[] {
  const unique = (a: ResearchPoint[]) => {
    const counts = new Map<string, number>();
    for (const p of a) counts.set(p.date, (counts.get(p.date) ?? 0) + 1);
    return new Map(
      a
        .filter(
          (p) =>
            counts.get(p.date) === 1 &&
            calendarDateSchema.safeParse(p.date).success &&
            p.value !== null &&
            Number.isFinite(p.value),
        )
        .map((p) => [p.date, p.value!]),
    );
  };
  const left = unique(x),
    right = unique(y),
    dates = [...left.keys()].filter((d) => right.has(d)).sort(),
    out: Pair[] = [];
  for (let i = 1; i < dates.length; i++) {
    const a = dates[i - 1]!,
      b = dates[i]!,
      gap = (Date.parse(b) - Date.parse(a)) / 86400000;
    const xa = left.get(a)!,
      xb = left.get(b)!,
      ya = right.get(a)!,
      yb = right.get(b)!;
    if (
      gap > 7 ||
      gap <= 0 ||
      ya <= 0 ||
      yb <= 0 ||
      (xTransform === 'log_return' && (xa <= 0 || xb <= 0))
    )
      continue;
    out.push({
      date: b,
      x: xTransform === 'difference' ? xb - xa : Math.log(xb / xa),
      y: Math.log(yb / ya),
    });
  }
  return out;
}
export function regression(pairs: Pair[]) {
  const values = pairs.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (values.length < 20) return null;
  const n = values.length,
    mx = values.reduce((s, p) => s + p.x, 0) / n,
    my = values.reduce((s, p) => s + p.y, 0) / n;
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const p of values) {
    xx += (p.x - mx) ** 2;
    yy += (p.y - my) ** 2;
    xy += (p.x - mx) * (p.y - my);
  }
  if (xx < 1e-18 || yy < 1e-18) return null;
  const beta = xy / xx,
    correlation = xy / Math.sqrt(xx * yy),
    alpha = my - beta * mx;
  const residualStd = Math.sqrt(
    values.reduce((s, p) => s + (p.y - alpha - beta * p.x) ** 2, 0) / (n - 2),
  );
  if (![beta, correlation, alpha, residualStd].every(Number.isFinite))
    return null;
  return {
    n,
    correlation,
    beta,
    alpha,
    rSquared: correlation ** 2,
    residualStd,
  };
}
export function rollingCorrelation(pairs: Pair[], window = 60) {
  if (!Number.isInteger(window) || window < 20 || window > 120)
    throw new Error('INVALID_RESEARCH_WINDOW');
  return pairs.slice(-240).map((p, i, a) => ({
    date: p.date,
    statistics: regression(a.slice(Math.max(0, i - window + 1), i + 1)),
  }));
}
export function leadLag(pairs: Pair[]) {
  const a = pairs.slice(-240);
  return Array.from({ length: 11 }, (_, i) => i - 5).map((lag) => ({
    lag,
    statistics: regression(
      a.flatMap((p, i) => {
        const other = a[i + lag];
        return other ? [{ date: other.date, x: p.x, y: other.y }] : [];
      }),
    ),
  }));
}
export type EventsResponse = {
  state: 'READY' | 'EMPTY' | 'NOT_CONFIGURED' | 'UNAVAILABLE';
  observedAt: string;
  events: ResearchEvent[];
  impacts: EventImpact[];
};
export type MacroResponse = {
  state: 'READY' | 'EMPTY' | 'NOT_CONFIGURED' | 'UNAVAILABLE';
  observedAt: string;
  provider: {
    status: string;
    lastSuccessAt: string | null;
    errorCode: string | null;
  };
  series: Array<{
    id: (typeof macroSeries)[number]['id'];
    label: string;
    unit: string;
    frequency: string;
    transform: 'log_return' | 'difference';
    observations: MacroObservation[];
  }>;
  crypto: Array<{ asset: string; points: ResearchPoint[] }>;
};
const stateSchema = z.enum(['READY', 'EMPTY', 'NOT_CONFIGURED', 'UNAVAILABLE']);
export const eventsResponseSchema = z.object({
  state: stateSchema,
  observedAt: z.iso.datetime(),
  events: z.array(eventSchema).max(100),
  impacts: z
    .array(
      z.object({
        eventId: z.string().max(80),
        asset: z.enum(['BTC', 'ETH', 'SOL']),
        windowMinutes: z.union([
          z.literal(5),
          z.literal(60),
          z.literal(240),
          z.literal(1440),
        ]),
        returnPct: z.number().finite().nullable(),
        volumeAbnormalityPct: z.number().finite().nullable(),
        oiChangePct: z.number().finite().nullable(),
        fundingChangeBps: z.number().finite().nullable(),
        anchorAt: z.iso.datetime().nullable(),
        endAt: z.iso.datetime().nullable(),
        reasons: z.array(z.string().max(100)).max(10),
        provenance: provenanceSchema,
      }),
    )
    .max(1200),
});
export const macroResponseSchema = z.object({
  state: stateSchema,
  observedAt: z.iso.datetime(),
  provider: z.object({
    status: z.string().max(40),
    lastSuccessAt: z.iso.datetime().nullable(),
    errorCode: z.string().max(80).nullable(),
  }),
  series: z
    .array(
      z.object({
        id: macroIdSchema,
        label: z.string().max(80),
        unit: z.string().max(40),
        frequency: z.string().max(20),
        transform: z.enum(['log_return', 'difference']),
        observations: z.array(macroObservationSchema).max(2000),
      }),
    )
    .max(12),
  crypto: z
    .array(
      z.object({
        asset: z.enum(['BTC', 'ETH', 'SOL']),
        points: z
          .array(
            z.object({
              date: calendarDateSchema,
              value: z.number().finite().nullable(),
            }),
          )
          .max(2000),
      }),
    )
    .max(3),
});
