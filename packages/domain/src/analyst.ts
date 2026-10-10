import { z } from 'zod';
import { provenanceSchema } from './index';

export const analystTools = [
  'market',
  'features',
  'risk',
  'wallet',
  'events',
  'macro',
  'providers',
] as const;
export const analystRequestSchema = z
  .object({
    asset: z.enum(['BTC', 'ETH', 'SOL']),
    question: z.string().trim().min(1).max(500),
    tools: z
      .array(z.enum(analystTools))
      .min(1)
      .max(7)
      .refine((a) => new Set(a).size === a.length),
  })
  .strict();
export type AnalystRequest = z.infer<typeof analystRequestSchema>;
export const evidenceSchema = z
  .object({
    id: z.string().regex(/^[a-z]+:[a-zA-Z0-9_.:-]{1,140}$/),
    tool: z.enum(analystTools),
    subject: z.string().max(100),
    label: z.string().max(100),
    value: z.union([z.number().finite(), z.string().max(200), z.null()]),
    unit: z.string().max(40),
    provenance: provenanceSchema.safeExtend({
      source: z.string().min(1).max(500),
      providerId: z.string().min(1).max(100),
      methodologyVersion: z.string().min(1).max(100).optional(),
    }),
    maxAgeMs: z
      .number()
      .int()
      .min(1)
      .max(366 * 86400000),
    limitation: z.string().max(500),
  })
  .strict();
export type Evidence = z.infer<typeof evidenceSchema>;
export type AnalystTool = (typeof analystTools)[number];
export const toolResultSchema = z
  .object({
    tool: z.enum(analystTools),
    state: z.enum(['READY', 'EMPTY', 'UNAVAILABLE', 'NOT_CONFIGURED']),
    evidence: z.array(evidenceSchema).max(24),
    limitation: z.string().max(500),
  })
  .strict();
export type ToolResult = z.infer<typeof toolResultSchema>;
export type EvidenceState =
  'FRESH' | 'STALE' | 'MISSING' | 'FUTURE' | 'CONFLICTING';
export function evidenceState(e: Evidence, now: Date): EvidenceState {
  if (
    Date.parse(e.provenance.ingestedAt) > now.getTime() ||
    Date.parse(e.provenance.sourceTimestamp) > now.getTime()
  )
    return 'FUTURE';
  if (e.value === null) return 'MISSING';
  return now.getTime() - Date.parse(e.provenance.sourceTimestamp) > e.maxAgeMs
    ? 'STALE'
    : 'FRESH';
}
export const interpretationChoiceSchema = z
  .object({
    evidenceIds: z.array(evidenceSchema.shape.id).max(6),
  })
  .strict();
export type InterpretationChoice = z.infer<typeof interpretationChoiceSchema>;
export type AnalystProvider = {
  analyze(
    request: AnalystRequest,
    read: (tool: AnalystTool) => Promise<ToolResult>,
    signal?: AbortSignal,
  ): Promise<InterpretationChoice>;
};
export function interpretation(e: Evidence): string | null {
  if (typeof e.value !== 'number' || e.provenance.quality !== 'DERIVED')
    return null;
  if (e.label === 'relative_strength_btc')
    return e.value > 0
      ? 'Recorded relative strength exceeds BTC on this methodology horizon; this does not identify the cause.'
      : 'Recorded relative strength does not exceed BTC on this methodology horizon; an outperformance thesis needs counter-evidence.';
  if (e.label === 'volume_zscore')
    return Math.abs(e.value) >= 2
      ? 'Recorded volume differs from its baseline by at least two standard deviations; direction and causation are unresolved.'
      : 'Recorded volume is within two baseline standard deviations; this alone does not confirm a capital-flow narrative.';
  if (e.label === 'funding_zscore')
    return Math.abs(e.value) >= 2
      ? 'Recorded funding is unusual against its baseline; crowding deserves review, but liquidation likelihood is uncalibrated.'
      : 'Funding alone does not establish unusual crowding against this baseline.';
  if (e.label === 'liquidity_change_1h')
    return e.value < -20
      ? 'The same-pool USD liquidity proxy fell by more than twenty percent; executable depth and slippage remain unobserved.'
      : 'The recorded same-pool proxy does not show a decline exceeding twenty percent; missing depth evidence prevents a safety conclusion.';
  if (e.label.startsWith('return_'))
    return e.value > 0
      ? 'Positive recorded return supports a performance description; it does not establish wallet, event or macro attribution.'
      : 'Nonpositive recorded return is counter-evidence to a positive-performance thesis on this horizon.';
  return null;
}
export function buildAnalystMemo(
  request: AnalystRequest,
  results: ToolResult[],
  now: Date,
  choice?: InterpretationChoice,
  providerState = 'NOT_CONFIGURED',
) {
  const parsed = results.map((r) => toolResultSchema.parse(r));
  if (
    parsed.some((r) => !request.tools.includes(r.tool)) ||
    new Set(parsed.map((r) => r.tool)).size !== parsed.length
  )
    throw new Error('INVALID_TOOL_RESULTS');
  const excludedFuture = parsed
    .flatMap((r) => r.evidence)
    .filter((e) => evidenceState(e, now) === 'FUTURE');
  const evidence = parsed
    .flatMap((r) => r.evidence)
    .filter((e) => evidenceState(e, now) !== 'FUTURE');
  if (new Set(evidence.map((e) => e.id)).size !== evidence.length)
    throw new Error('DUPLICATE_EVIDENCE');
  const states = new Map(evidence.map((e) => [e.id, evidenceState(e, now)]));
  const conflicting = new Set<string>();
  for (const e of evidence)
    for (const other of evidence) {
      if (
        e.id === other.id ||
        states.get(e.id) !== 'FRESH' ||
        states.get(other.id) !== 'FRESH'
      )
        continue;
      if (
        e.subject === other.subject &&
        e.label === other.label &&
        e.unit === other.unit &&
        e.provenance.providerId !== other.provenance.providerId &&
        e.value !== other.value
      ) {
        conflicting.add(e.id);
        conflicting.add(other.id);
      }
    }
  for (const id of conflicting) states.set(id, 'CONFLICTING');
  const candidates = evidence.filter(
    (e) => states.get(e.id) === 'FRESH' && interpretation(e),
  );
  if (
    choice &&
    (new Set(choice.evidenceIds).size !== choice.evidenceIds.length ||
      choice.evidenceIds.some((id) => !candidates.some((e) => e.id === id)))
  )
    throw new Error('UNGROUNDED_MODEL_SELECTION');
  const statements = choice
    ? choice.evidenceIds.map((id) => {
        const e = candidates.find((e) => e.id === id)!;
        return { evidenceId: id, text: interpretation(e)! };
      })
    : [];
  const projected = evidence.map((e) => ({ ...e, state: states.get(e.id)! }));
  const missing = request.tools.filter(
    (t) => !parsed.some((r) => r.tool === t && r.state === 'READY'),
  );
  const usable = projected.filter((e) => e.state === 'FRESH').length;
  return {
    version: 'evidence-analyst:v1' as const,
    observedAt: now.toISOString(),
    request,
    providerState,
    facts: projected.filter(
      (e) =>
        e.provenance.quality !== 'DERIVED' &&
        e.provenance.quality !== 'AI_INTERPRETATION',
    ),
    derivedSignals: projected.filter((e) => e.provenance.quality === 'DERIVED'),
    interpretations: statements,
    counterEvidence: [
      ...excludedFuture.map(
        (e) =>
          `${e.subject} / ${e.label}: FUTURE evidence excluded from this snapshot.`,
      ),
      ...parsed
        .filter((r) => r.state !== 'READY')
        .map((r) => `${r.tool}: ${r.state}. ${r.limitation}`),
      ...projected
        .filter((e) => e.state !== 'FRESH')
        .map((e) => `${e.subject} / ${e.label}: ${e.state}. ${e.limitation}`),
      'Association does not establish causation. Confounders, incomplete provider coverage and timing differences remain.',
      'No calibrated forecast, pump probability, trading recommendation or wallet ownership/insider inference is available.',
    ],
    confidence: usable === 0 ? ('INSUFFICIENT' as const) : ('LIMITED' as const),
    confidenceReason: `${usable} fresh observations; ${missing.length} requested evidence families absent or unavailable. Coverage is not predictive confidence; facts and descriptive signals cannot prove causal attribution.`,
    sources: projected.map((e) => ({
      evidenceId: e.id,
      provenance: e.provenance,
      state: e.state,
    })),
    toolResults: parsed.map((r) => ({
      tool: r.tool,
      state: r.state,
      rows: r.evidence.length,
      limitation: r.limitation,
    })),
  };
}
export type AnalystMemo = ReturnType<typeof buildAnalystMemo>;
const projectedEvidenceSchema = evidenceSchema.extend({
  state: z.enum(['FRESH', 'STALE', 'MISSING', 'FUTURE', 'CONFLICTING']),
});
export const analystMemoSchema = z.object({
  version: z.literal('evidence-analyst:v1'),
  observedAt: z.iso.datetime(),
  request: analystRequestSchema,
  providerState: z.enum([
    'READY',
    'NOT_CONFIGURED',
    'UNAVAILABLE',
    'REJECTED_UNGROUNDED_OUTPUT',
  ]),
  facts: z.array(projectedEvidenceSchema).max(168),
  derivedSignals: z.array(projectedEvidenceSchema).max(168),
  interpretations: z
    .array(
      z.object({
        evidenceId: evidenceSchema.shape.id,
        text: z.string().max(500),
      }),
    )
    .max(6),
  counterEvidence: z.array(z.string().max(1000)).max(180),
  confidence: z.enum(['INSUFFICIENT', 'LIMITED']),
  confidenceReason: z.string().max(1000),
  sources: z
    .array(
      z.object({
        evidenceId: evidenceSchema.shape.id,
        provenance: provenanceSchema,
        state: projectedEvidenceSchema.shape.state,
      }),
    )
    .max(168),
  toolResults: z
    .array(
      z.object({
        tool: z.enum(analystTools),
        state: toolResultSchema.shape.state,
        rows: z.number().int().min(0).max(24),
        limitation: z.string().max(500),
      }),
    )
    .max(7),
});

export async function runAnalyst(
  input: AnalystRequest,
  read: (tool: AnalystTool) => Promise<ToolResult>,
  now = new Date(),
  provider?: AnalystProvider,
  signal?: AbortSignal,
) {
  const request = analystRequestSchema.parse(input),
    results = new Map<AnalystTool, ToolResult>();
  const retrieve = async (tool: AnalystTool) => {
    signal?.throwIfAborted();
    if (!request.tools.includes(tool)) throw new Error('TOOL_OUTSIDE_SCOPE');
    const cached = results.get(tool);
    if (cached) return cached;
    let result: ToolResult;
    try {
      result = toolResultSchema.parse(await read(tool));
    } catch {
      result = {
        tool,
        state: 'UNAVAILABLE',
        evidence: [],
        limitation: 'Evidence query failed; no replacement values supplied.',
      };
    }
    if (result.tool !== tool) throw new Error('TOOL_IDENTITY_MISMATCH');
    results.set(tool, result);
    return result;
  };
  let choice: InterpretationChoice | undefined,
    state = 'NOT_CONFIGURED';
  if (provider) {
    try {
      choice = interpretationChoiceSchema.parse(
        await provider.analyze(request, retrieve, signal),
      );
      state = 'READY';
    } catch {
      state = 'UNAVAILABLE';
    }
  }
  for (const tool of request.tools) await retrieve(tool);
  try {
    return buildAnalystMemo(request, [...results.values()], now, choice, state);
  } catch {
    return buildAnalystMemo(
      request,
      [...results.values()],
      now,
      undefined,
      'REJECTED_UNGROUNDED_OUTPUT',
    );
  }
}
