import { describe, it, expect } from 'vitest';
import {
  evaluateAlert,
  narrativeAlert,
  notificationTransition,
  researchActionSchema,
  savedViewSchema,
  alertRuleSchema,
  type AlertRule,
  type Evaluation,
} from '../../packages/domain/src/research';
import {
  buildAnalystMemo,
  type Evidence,
  type ToolResult,
} from '../../packages/domain/src/analyst';
import { analystEvidence, analystNow } from '../fixtures/analyst';
const threshold: AlertRule = {
  kind: 'THRESHOLD',
  asset: 'SOL',
  metric: 'return_1h',
  operator: 'ABOVE',
  threshold: 1,
};
function memo(e: Evidence[], state: ToolResult['state'] = 'READY') {
  return buildAnalystMemo(
    { asset: 'SOL', question: 'Synthetic QA', tools: ['features', 'risk'] },
    [
      {
        tool: e[0]?.tool ?? 'features',
        state,
        evidence: e,
        limitation: 'Synthetic QA only',
      },
    ],
    analystNow,
  );
}
const evidence = (): Evidence => ({
  ...analystEvidence(),
  label: 'return_1h',
  id: 'features:SOL.return_1h',
});
describe('bounded research and deterministic conditions', () => {
  it('rejects arbitrary SQL, unknown tables, oversized notes, blank titles and missing edit versions', () => {
    for (const x of [
      {
        action: 'SAVE_QUERY',
        title: 'q',
        query: { asset: 'SOL', question: 'test', tools: ['DROP TABLE'] },
      },
      { action: 'DELETE', table: 'markets', id: crypto.randomUUID() },
      { action: 'SAVE_NOTE', title: 'x', asset: 'SOL', body: 'x'.repeat(3001) },
      { action: 'SAVE_NOTE', title: ' ', asset: 'SOL', body: 'x' },
      {
        action: 'SAVE_NOTE',
        id: crypto.randomUUID(),
        title: 'x',
        asset: 'SOL',
        body: 'x',
      },
    ])
      expect(researchActionSchema.safeParse(x).success).toBe(false);
  });
  it('rejects base-column hiding, duplicate columns and injection filters', () => {
    for (const v of [
      { filter: '', sort: 'price', desc: false, hidden: ['base'] },
      { filter: '', sort: 'price', desc: false, hidden: ['price', 'price'] },
      { filter: "';SELECT", sort: 'price', desc: false, hidden: [] },
    ])
      expect(savedViewSchema.safeParse(v).success).toBe(false);
  });
  it('rejects unbounded, nonfinite, unsupported and trade-execution rules', () => {
    for (const r of [
      { ...threshold, threshold: Infinity },
      { kind: 'LIQUIDITY', asset: 'BTC', declinePercent: 50 },
      { kind: 'RISK', asset: 'SOL', category: 'overall', threshold: 50 },
      { kind: 'NARRATIVE_CHANGE', narrative: 'unknown', threshold: 5 },
      { ...threshold, executeTrade: true },
    ])
      expect(alertRuleSchema.safeParse(r).success).toBe(false);
  });
  it('uses strict above/below threshold and carries provenance and units', () => {
    const r = evaluateAlert(threshold, memo([evidence()]), analystNow);
    expect(r.state).toBe('TRIGGERED');
    expect(r.sourceTimestamp).toBe(analystNow.toISOString());
    expect(r.evidence[0]).toBe(evidence().id);
    expect(r.unit).toBe('PERCENT');
    expect(
      evaluateAlert(
        { ...threshold, threshold: 2 },
        memo([evidence()]),
        analystNow,
      ).state,
    ).toBe('CLEAR');
    expect(
      evaluateAlert(
        { ...threshold, operator: 'BELOW', threshold: 3 },
        memo([evidence()]),
        analystNow,
      ).state,
    ).toBe('TRIGGERED');
  });
  it.each(['null', 'stale', 'future', 'conflict', 'unavailable'] as const)(
    'keeps %s threshold evidence UNKNOWN',
    (mode) => {
      const e = evidence();
      if (mode === 'null') e.value = null;
      if (mode === 'stale')
        e.provenance.sourceTimestamp = new Date(
          analystNow.getTime() - e.maxAgeMs - 1,
        ).toISOString();
      if (mode === 'future')
        e.provenance.sourceTimestamp = new Date(
          analystNow.getTime() + 1,
        ).toISOString();
      const rows =
        mode === 'conflict'
          ? [
              e,
              {
                ...e,
                id: 'features:SOL.other',
                value: 4,
                provenance: { ...e.provenance, providerId: 'other' },
              },
            ]
          : [e];
      expect(
        evaluateAlert(
          threshold,
          memo(rows, mode === 'unavailable' ? 'UNAVAILABLE' : 'READY'),
          analystNow,
        ).state,
      ).toBe('UNKNOWN');
    },
  );
  it('data-risk monitors missing/stale inputs but storage failures remain UNKNOWN', () => {
    const r: AlertRule = { kind: 'DATA_RISK', asset: 'SOL', tool: 'features' };
    expect(evaluateAlert(r, memo([], 'EMPTY'), analystNow).state).toBe(
      'TRIGGERED',
    );
    expect(
      evaluateAlert(r, memo([{ ...evidence(), value: null }]), analystNow)
        .state,
    ).toBe('TRIGGERED');
    expect(evaluateAlert(r, memo([], 'UNAVAILABLE'), analystNow).state).toBe(
      'UNKNOWN',
    );
    expect(evaluateAlert(r, memo([evidence()]), analystNow).state).toBe(
      'CLEAR',
    );
    const future = evidence();
    future.provenance.sourceTimestamp = new Date(
      analystNow.getTime() + 1,
    ).toISOString();
    expect(evaluateAlert(r, memo([future]), analystNow).state).toBe(
      'TRIGGERED',
    );
  });
  it('keeps contract/ownership/liquidity/market structure separate; partial categories remain unavailable', () => {
    const e = {
      ...evidence(),
      tool: 'risk' as const,
      id: 'risk:SOL.contract',
      label: 'contract_risk',
      value: 80,
    };
    expect(
      evaluateAlert(
        { kind: 'RISK', asset: 'SOL', category: 'contract', threshold: 70 },
        memo([e]),
        analystNow,
      ).state,
    ).toBe('TRIGGERED');
    expect(
      evaluateAlert(
        { kind: 'RISK', asset: 'SOL', category: 'ownership', threshold: 70 },
        memo([e]),
        analystNow,
      ).state,
    ).toBe('UNKNOWN');
    expect(
      evaluateAlert(
        { kind: 'RISK', asset: 'SOL', category: 'contract', threshold: 70 },
        memo([{ ...e, value: null }]),
        analystNow,
      ).state,
    ).toBe('UNKNOWN');
  });
  it('liquidity decline threshold is signed and preserves proxy limitations', () => {
    const e = {
      ...evidence(),
      tool: 'risk' as const,
      id: 'risk:SOL.proxy',
      label: 'liquidity_change_1h',
      value: -30,
    };
    const r = evaluateAlert(
      { kind: 'LIQUIDITY', asset: 'SOL', declinePercent: 25 },
      memo([e]),
      analystNow,
    );
    expect(r.state).toBe('TRIGGERED');
    expect(r.reason).toContain('Not depth, withdrawals or execution');
    expect(
      evaluateAlert(
        { kind: 'LIQUIDITY', asset: 'SOL', declinePercent: 25 },
        memo([{ ...e, value: 30 }]),
        analystNow,
      ).state,
    ).toBe('CLEAR');
  });
  it('narrative changes require a complete baseline, keep same-input result and detect absolute changes', () => {
    const rule = {
        kind: 'NARRATIVE_CHANGE' as const,
        narrative: 'l1',
        threshold: 5,
      },
      e: Evaluation = {
        version: 'research-alerts:v1',
        state: 'CLEAR',
        reason: 'QA',
        observedAt: analystNow.toISOString(),
        value: 50,
        sourceTimestamp: analystNow.toISOString(),
        evidence: ['l1'],
        unit: 'score points',
      };
    const initial = narrativeAlert(rule, e);
    expect(initial.state).toBe('UNKNOWN');
    const next = {
      ...e,
      value: 56,
      sourceTimestamp: new Date(analystNow.getTime() + 60000).toISOString(),
    };
    const hit = narrativeAlert(rule, next, initial);
    expect(hit.state).toBe('TRIGGERED');
    expect(narrativeAlert(rule, next, hit).state).toBe('TRIGGERED');
    expect(narrativeAlert(rule, { ...next, value: 54 }, hit).state).toBe(
      'CLEAR',
    );
  });
  it('deduplicates transitions and never converts UNKNOWN to recovery', () => {
    expect(notificationTransition('UNKNOWN', 'CLEAR')).toBeNull();
    expect(notificationTransition('UNKNOWN', 'TRIGGERED')).toBe('TRIGGERED');
    expect(notificationTransition('TRIGGERED', 'TRIGGERED')).toBeNull();
    expect(notificationTransition('TRIGGERED', 'UNKNOWN')).toBeNull();
    expect(notificationTransition('TRIGGERED', 'CLEAR')).toBe('RECOVERED');
  });
});
