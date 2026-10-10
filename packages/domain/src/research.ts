import { z } from 'zod';
import {
  analystRequestSchema,
  analystMemoSchema,
  analystTools,
  type AnalystMemo,
  type Evidence,
} from './analyst';
import { taxonomy } from './intelligence';
export const researchVersion = 'research-alerts:v1';
export const researchLimits = {
  watchlists: 20,
  items: 30,
  notes: 100,
  queries: 50,
  views: 50,
  reports: 50,
  alerts: 20,
  notifications: 1000,
} as const;
const title = z.string().trim().min(1).max(60),
  asset = analystRequestSchema.shape.asset;
export const scannerColumns = [
  'base',
  'price',
  'change24h',
  'quoteVolume24h',
  'oi',
  'funding',
  'freshness',
] as const;
export const savedViewSchema = z
  .object({
    filter: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{0,24}$/),
    sort: z.enum(scannerColumns),
    desc: z.boolean(),
    hidden: z
      .array(z.enum(scannerColumns))
      .max(6)
      .refine((a) => !a.includes('base') && new Set(a).size === a.length),
  })
  .strict();
export type SavedView = z.infer<typeof savedViewSchema>;
export const alertRuleSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('THRESHOLD'),
      asset,
      metric: z.enum(['price', 'change_24h', 'return_1h']),
      operator: z.enum(['ABOVE', 'BELOW']),
      threshold: z.number().finite().min(-1e12).max(1e12),
    })
    .strict(),
  z
    .object({ kind: z.literal('DATA_RISK'), asset, tool: z.enum(analystTools) })
    .strict(),
  z
    .object({
      kind: z.literal('PROVIDER_DOWN'),
      provider: z.enum([
        'binance:spot',
        'binance:spot:stream',
        'binance:perpetual',
        'dexscreener',
        'goplus',
        'helius',
        'fred',
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal('NARRATIVE_CHANGE'),
      narrative: z.enum(taxonomy.map((n) => n.id) as [string, ...string[]]),
      threshold: z.number().finite().positive().max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal('RISK'),
      asset,
      category: z.enum([
        'contract',
        'ownership',
        'liquidity',
        'market_structure',
      ]),
      threshold: z.number().finite().min(0).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal('LIQUIDITY'),
      asset: z.literal('SOL'),
      declinePercent: z.number().finite().positive().max(100),
    })
    .strict(),
]);
export type AlertRule = z.infer<typeof alertRuleSchema>;
export const evaluationSchema = z
  .object({
    version: z.literal(researchVersion),
    state: z.enum(['UNKNOWN', 'CLEAR', 'TRIGGERED']),
    reason: z.string().max(1000),
    observedAt: z.iso.datetime(),
    value: z.union([z.number().finite(), z.string().max(200), z.null()]),
    sourceTimestamp: z.iso.datetime().nullable(),
    evidence: z.array(z.string().max(200)).max(6),
    unit: z.string().max(40),
  })
  .strict();
export type Evaluation = z.infer<typeof evaluationSchema>;
export function evaluateAlert(
  rule: AlertRule,
  memo: AnalystMemo,
  now: Date,
): Evaluation {
  const base: Evaluation = {
    version: researchVersion,
    state: 'UNKNOWN',
    reason:
      'Required evidence is absent, stale, conflicting or unavailable. No threshold result inferred.',
    observedAt: now.toISOString(),
    value: null,
    sourceTimestamp: null,
    evidence: [],
    unit: '',
  };
  const all = [...memo.facts, ...memo.derivedSignals];
  const observed = (
    e: Evidence & { state: string },
    state: Evaluation['state'],
    reason: string,
  ): Evaluation => ({
    ...base,
    state,
    reason: `${reason} ${e.limitation}`,
    value: e.value,
    sourceTimestamp: e.provenance.sourceTimestamp,
    evidence: [e.id, `${e.provenance.providerId}: ${e.provenance.source}`].map(
      (s) => s.slice(0, 200),
    ),
    unit: e.unit,
  });
  if (rule.kind === 'DATA_RISK') {
    const tool = memo.toolResults.find((t) => t.tool === rule.tool);
    if (!tool || ['UNAVAILABLE', 'NOT_CONFIGURED'].includes(tool.state))
      return base;
    const rows = all.filter((e) => e.tool === rule.tool);
    const bad = rows.filter((e) => e.state !== 'FRESH');
    return {
      ...base,
      state:
        tool.state === 'EMPTY' || !rows.length || bad.length
          ? 'TRIGGERED'
          : 'CLEAR',
      reason: `${rule.tool}: ${tool.state}; ${bad.length} retained observations missing/stale/conflicting. Absence is the monitored condition, not a substitute value.`,
      evidence: bad.slice(0, 6).map((e) => e.id),
      unit: 'coverage',
    };
  }
  if (rule.kind === 'PROVIDER_DOWN' || rule.kind === 'NARRATIVE_CHANGE')
    return base;
  const label =
    rule.kind === 'THRESHOLD'
      ? rule.metric
      : rule.kind === 'RISK'
        ? `${rule.category}_risk`
        : 'liquidity_change_1h';
  const family =
    rule.kind === 'THRESHOLD'
      ? rule.metric === 'return_1h'
        ? 'features'
        : 'market'
      : 'risk';
  if (memo.toolResults.find((t) => t.tool === family)?.state !== 'READY')
    return base;
  const rows = all.filter(
    (e) => e.tool === family && e.subject === rule.asset && e.label === label,
  );
  if (
    rows.length !== 1 ||
    rows[0]!.state !== 'FRESH' ||
    typeof rows[0]!.value !== 'number'
  )
    return base;
  const e = rows[0]!,
    value = e.value as number;
  const hit =
    rule.kind === 'THRESHOLD'
      ? rule.operator === 'ABOVE'
        ? value > rule.threshold
        : value < rule.threshold
      : rule.kind === 'RISK'
        ? value >= rule.threshold
        : value <= -rule.declinePercent;
  return observed(
    e,
    hit ? 'TRIGGERED' : 'CLEAR',
    rule.kind === 'LIQUIDITY'
      ? `Same-pool USD liquidity proxy ${value}%; decline threshold -${rule.declinePercent}%. Not depth, withdrawals or execution evidence.`
      : rule.kind === 'RISK'
        ? `${rule.category} score ${value}; complete-category threshold ${rule.threshold}. No overall safety certification.`
        : `${label} ${value} ${e.unit}; ${rule.operator} ${rule.threshold}. Descriptive threshold only.`,
  );
}
export function narrativeAlert(
  rule: Extract<AlertRule, { kind: 'NARRATIVE_CHANGE' }>,
  e: Evaluation,
  previous?: Evaluation,
): Evaluation {
  if (e.state === 'UNKNOWN' || typeof e.value !== 'number') return e;
  if (
    !previous ||
    typeof previous.value !== 'number' ||
    !previous.sourceTimestamp
  )
    return {
      ...e,
      state: 'UNKNOWN',
      reason:
        'First complete narrative observation establishes a baseline; no change inferred.',
    };
  if (
    previous.sourceTimestamp === e.sourceTimestamp &&
    previous.value === e.value
  )
    return { ...previous, observedAt: e.observedAt };
  const delta = e.value - previous.value;
  return {
    ...e,
    state: Math.abs(delta) >= rule.threshold ? 'TRIGGERED' : 'CLEAR',
    reason: `Narrative score change ${delta.toFixed(6)} points against previous known complete input; absolute threshold ${rule.threshold}. Descriptive heuristic, not capital flow or causation.`,
  };
}
export function notificationTransition(
  lastKnown: Evaluation['state'],
  next: Evaluation['state'],
): 'TRIGGERED' | 'RECOVERED' | null {
  return next === 'UNKNOWN' || next === lastKnown
    ? null
    : next === 'TRIGGERED'
      ? 'TRIGGERED'
      : lastKnown === 'TRIGGERED'
        ? 'RECOVERED'
        : null;
}
export const researchActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('CREATE_WATCHLIST'), title }).strict(),
  z
    .object({
      action: z.literal('WATCH_ITEM'),
      id: z.uuid(),
      symbol: z.string().regex(/^[A-Z0-9]{1,24}$/),
      remove: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('SAVE_NOTE'),
      id: z.uuid().optional(),
      expectedUpdatedAt: z.iso.datetime().optional(),
      title,
      asset,
      body: z.string().trim().min(1).max(3000),
    })
    .strict()
    .refine((r) => !r.id || !!r.expectedUpdatedAt),
  z
    .object({
      action: z.literal('SAVE_QUERY'),
      title,
      query: analystRequestSchema,
    })
    .strict(),
  z
    .object({ action: z.literal('SAVE_VIEW'), title, view: savedViewSchema })
    .strict(),
  z
    .object({
      action: z.literal('CAPTURE_REPORT'),
      title,
      query: analystRequestSchema,
    })
    .strict(),
  z
    .object({ action: z.literal('CREATE_ALERT'), title, rule: alertRuleSchema })
    .strict(),
  z
    .object({
      action: z.literal('TOGGLE_ALERT'),
      id: z.uuid(),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('DELETE'),
      table: z.enum([
        'watchlists',
        'notes',
        'queries',
        'views',
        'reports',
        'alerts',
      ]),
      id: z.uuid(),
    })
    .strict(),
]);
export type ResearchAction = z.infer<typeof researchActionSchema>;
export const reportSummarySchema = z.object({
  id: z.uuid(),
  title,
  asset,
  observedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  confidence: analystMemoSchema.shape.confidence,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export const researchResponseSchema = z.object({
  state: z.enum(['READY', 'NOT_CONFIGURED', 'UNAVAILABLE']),
  observedAt: z.iso.datetime(),
  watchlists: z
    .array(
      z.object({ id: z.uuid(), title, items: z.array(z.string()).max(30) }),
    )
    .max(20),
  notes: z
    .array(
      z.object({
        id: z.uuid(),
        title,
        asset,
        body: z.string().max(3000),
        updatedAt: z.iso.datetime(),
      }),
    )
    .max(100),
  queries: z
    .array(z.object({ id: z.uuid(), title, query: analystRequestSchema }))
    .max(50),
  views: z
    .array(z.object({ id: z.uuid(), title, view: savedViewSchema }))
    .max(50),
  reports: z.array(reportSummarySchema).max(50),
  alerts: z
    .array(
      z.object({
        id: z.uuid(),
        title,
        rule: alertRuleSchema,
        enabled: z.boolean(),
        evaluation: evaluationSchema.nullable(),
      }),
    )
    .max(20),
  notifications: z
    .array(
      z.object({
        id: z.uuid(),
        alertId: z.uuid(),
        state: z.enum(['TRIGGERED', 'RECOVERED']),
        evaluation: evaluationSchema,
        createdAt: z.iso.datetime(),
      }),
    )
    .max(100),
});
export type ResearchResponse = z.infer<typeof researchResponseSchema>;
export function emptyResearch(
  state: ResearchResponse['state'],
  now = new Date(),
): ResearchResponse {
  return {
    state,
    observedAt: now.toISOString(),
    watchlists: [],
    notes: [],
    queries: [],
    views: [],
    reports: [],
    alerts: [],
    notifications: [],
  };
}
export const reportSchema = z.object({
  id: z.uuid(),
  title,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  memo: analystMemoSchema,
});
