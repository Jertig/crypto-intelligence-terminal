import {
  buildAnalystMemo,
  type AnalystRequest,
  type Evidence,
  type ToolResult,
} from '../../packages/domain/src/analyst';
export const analystNow = new Date('2026-09-02T12:00:00Z');
export const analystRequest: AnalystRequest = {
  asset: 'SOL',
  question: 'What supports or contradicts the performance thesis?',
  tools: ['market', 'features'],
};
export function analystEvidence(now = analystNow): Evidence {
  return {
    id: 'features:SOL.relative_strength_btc',
    tool: 'features',
    subject: 'SOL',
    label: 'relative_strength_btc',
    value: 2,
    unit: 'PERCENT',
    provenance: {
      source: 'SYNTHETIC QA FIXTURE — NOT LIVE',
      providerId: 'terminal:features',
      sourceTimestamp: now.toISOString(),
      ingestedAt: now.toISOString(),
      quality: 'DERIVED',
      methodologyVersion: 'market-features:v1',
    },
    maxAgeMs: 1200000,
    limitation: 'Synthetic test evidence only; no causal attribution.',
  };
}
export function analystResult(now = analystNow): ToolResult {
  return {
    tool: 'features',
    state: 'READY',
    evidence: [analystEvidence(now)],
    limitation: 'Synthetic fixture only.',
  };
}
export function analystFixture(now = analystNow) {
  return buildAnalystMemo(
    analystRequest,
    [
      {
        tool: 'market',
        state: 'EMPTY',
        evidence: [],
        limitation: 'No market fixture.',
      },
      analystResult(now),
    ],
    now,
    { evidenceIds: [analystEvidence(now).id] },
    'READY',
  );
}
