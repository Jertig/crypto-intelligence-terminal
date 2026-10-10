import { describe, it, expect, vi } from 'vitest';
import {
  analystRequestSchema,
  evidenceSchema,
  buildAnalystMemo,
  runAnalyst,
  type ToolResult,
} from '../../packages/domain/src/analyst';
import { OpenAIAnalystProvider } from '../../packages/providers/src/analyst';
import { sameOriginRequest } from '../../packages/domain/src/request-security';
import {
  analystEvidence,
  analystNow,
  analystRequest,
  analystResult,
} from '../fixtures/analyst';
const empty = (tool: ToolResult['tool']): ToolResult => ({
  tool,
  state: 'EMPTY',
  evidence: [],
  limitation: 'Missing evidence.',
});
const call = (tool = 'features', asset = 'SOL') => ({
  type: 'function_call',
  call_id: 'test-call',
  name: 'read_terminal_evidence',
  arguments: JSON.stringify({ tool, asset }),
});
const response = (output: unknown[]) =>
  Response.json({ status: 'completed', output });
const message = (data: unknown) => ({
  type: 'message',
  content: [{ type: 'output_text', text: JSON.stringify(data) }],
});
describe('read-only analyst grounding', () => {
  it('validates browser-facing origins despite internal URL normalization and rejects foreign/malformed/rebound hosts', () => {
    const req = (origin: string, host = '127.0.0.1:3100') =>
      new Request('http://localhost:3100/api/analyst', {
        headers: { Origin: origin, Host: host },
      });
    expect(sameOriginRequest(req('http://127.0.0.1:3100'))).toBe(true);
    for (const origin of [
      'https://evil.invalid',
      'null',
      'http://127.0.0.1:3100/',
      'http://user:pass@127.0.0.1:3100',
    ])
      expect(sameOriginRequest(req(origin))).toBe(false);
    expect(sameOriginRequest(req('https://evil.invalid', 'evil.invalid'))).toBe(
      false,
    );
    expect(
      sameOriginRequest(
        req('https://terminal.example', 'terminal.example'),
        'https://terminal.example',
      ),
    ).toBe(true);
    expect(
      sameOriginRequest(
        req('http://terminal.example', 'terminal.example'),
        'https://terminal.example',
      ),
    ).toBe(false);
  });
  it('rejects unknown tools, duplicate scope, arbitrary SQL/URLs, oversized questions and forged provenance', () => {
    for (const input of [
      { ...analystRequest, tools: ['execute_trade'] },
      { ...analystRequest, tools: ['market', 'market'] },
      { ...analystRequest, query: 'DROP TABLE markets' },
      { ...analystRequest, question: 'x'.repeat(501) },
    ])
      expect(analystRequestSchema.safeParse(input).success).toBe(false);
    expect(
      evidenceSchema.safeParse({ ...analystEvidence(), value: Infinity })
        .success,
    ).toBe(false);
    expect(
      evidenceSchema.safeParse({
        ...analystEvidence(),
        provenance: {
          ...analystEvidence().provenance,
          methodologyVersion: undefined,
        },
      }).success,
    ).toBe(false);
  });
  it('renders facts from evidence only and refuses fabricated IDs, raw prose, probabilities or causal output', () => {
    const memo = buildAnalystMemo(
      analystRequest,
      [empty('market'), analystResult()],
      analystNow,
      { evidenceIds: [analystEvidence().id] },
      'READY',
    );
    expect(memo.facts).toEqual([]);
    expect(memo.derivedSignals[0]?.value).toBe(2);
    expect(memo.interpretations[0]?.text).toContain(
      'does not identify the cause',
    );
    expect(memo.counterEvidence.join(' ')).toContain('No calibrated forecast');
    expect(memo.confidence).toBe('LIMITED');
    expect(memo.sources[0]?.provenance.source).toContain('NOT LIVE');
    expect(() =>
      buildAnalystMemo(analystRequest, [analystResult()], analystNow, {
        evidenceIds: ['features:invented'],
      }),
    ).toThrow('UNGROUNDED');
  });
  it('withholds stale, missing and future evidence and never treats zero as missing', () => {
    const e = analystEvidence();
    for (const [value, time, state] of [
      [null, analystNow, 'MISSING'],
      [0, new Date(analystNow.getTime() - 1200001), 'STALE'],
    ] as const) {
      const r = analystResult();
      r.evidence = [
        {
          ...e,
          value,
          provenance: { ...e.provenance, sourceTimestamp: time.toISOString() },
        },
      ];
      const memo = buildAnalystMemo(analystRequest, [r], analystNow);
      expect(memo.derivedSignals[0]?.state).toBe(state);
      expect(memo.confidence).toBe('INSUFFICIENT');
      expect(() =>
        buildAnalystMemo(analystRequest, [r], analystNow, {
          evidenceIds: [e.id],
        }),
      ).toThrow();
    }
    const r = analystResult();
    r.evidence[0]!.value = 0;
    expect(
      buildAnalystMemo(analystRequest, [r], analystNow).derivedSignals[0]
        ?.state,
    ).toBe('FRESH');
    r.evidence[0]!.provenance.ingestedAt = new Date(
      analystNow.getTime() + 1,
    ).toISOString();
    expect(
      buildAnalystMemo(analystRequest, [r], analystNow).derivedSignals,
    ).toEqual([]);
    r.evidence[0]!.value = null;
    const futureMemo = buildAnalystMemo(analystRequest, [r], analystNow);
    expect(futureMemo.derivedSignals).toEqual([]);
    expect(futureMemo.counterEvidence.join(' ')).toContain(
      'FUTURE evidence excluded',
    );
  });
  it('marks every fresh conflicting provider in a cohort and cannot interpret disagreements', () => {
    const r = analystResult();
    r.evidence = [1, 2, 3].map((value, i) => ({
      ...analystEvidence(),
      id: `features:conflict${i}`,
      value,
      provenance: {
        ...analystEvidence().provenance,
        providerId: `fixture${i}`,
      },
    }));
    const memo = buildAnalystMemo(analystRequest, [r], analystNow);
    expect(memo.derivedSignals.map((e) => e.state)).toEqual([
      'CONFLICTING',
      'CONFLICTING',
      'CONFLICTING',
    ]);
    expect(() =>
      buildAnalystMemo(analystRequest, [r], analystNow, {
        evidenceIds: ['features:conflict2'],
      }),
    ).toThrow('UNGROUNDED');
  });
  it('preserves deterministic evidence when credentials or one evidence family are unavailable', async () => {
    const memo = await runAnalyst(
      analystRequest,
      async (t) =>
        t === 'features'
          ? analystResult()
          : Promise.reject(new Error('private connection detail')),
      analystNow,
    );
    expect(memo.providerState).toBe('NOT_CONFIGURED');
    expect(memo.interpretations).toEqual([]);
    expect(memo.derivedSignals).toHaveLength(1);
    expect(JSON.stringify(memo)).not.toContain('private connection detail');
    expect(memo.toolResults[0]?.state).toBe('UNAVAILABLE');
    const bad = await runAnalyst(
      analystRequest,
      async (t) => (t === 'features' ? analystResult() : empty(t)),
      analystNow,
      { analyze: async () => ({ evidenceIds: ['features:forged'] }) },
    );
    expect(bad.providerState).toBe('REJECTED_UNGROUNDED_OUTPUT');
    expect(bad.interpretations).toEqual([]);
  });
  it('caches repeated reads, restricts tool scope, includes missing wallet/events/macro/provider evidence and honors cancellation', async () => {
    const read = vi.fn(async (t: ToolResult['tool']) =>
      t === 'features' ? analystResult() : empty(t),
    );
    const memo = await runAnalyst(
      {
        ...analystRequest,
        tools: ['features', 'wallet', 'events', 'macro', 'providers'],
      },
      read,
      analystNow,
      {
        analyze: async (_, lookup) => {
          await lookup('features');
          await lookup('features');
          return { evidenceIds: [analystEvidence().id] };
        },
      },
    );
    expect(read).toHaveBeenCalledTimes(5);
    expect(memo.counterEvidence.join(' ')).toContain('wallet: EMPTY');
    const abort = new AbortController();
    abort.abort();
    await expect(
      runAnalyst(analystRequest, read, analystNow, undefined, abort.signal),
    ).rejects.toThrow();
  });
});
describe('optional Responses provider', () => {
  it('calls one approved read tool then returns only validated evidence IDs with bounded, stateless requests', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([call()]))
      .mockResolvedValueOnce(
        response([message({ evidenceIds: [analystEvidence().id] })]),
      );
    const provider = new OpenAIAnalystProvider({
      apiKey: 'synthetic-test-credential',
      model: 'fixture-model',
      fetchFn,
    });
    const read = vi.fn(async () => analystResult());
    expect(await provider.analyze(analystRequest, read)).toEqual({
      evidenceIds: [analystEvidence().id],
    });
    expect(read).toHaveBeenCalledWith('features');
    const sent = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(sent.store).toBe(false);
    expect(sent.parallel_tool_calls).toBe(false);
    expect(sent.tools[0].parameters.additionalProperties).toBe(false);
    expect(sent.text.format.strict).toBe(true);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      'https://api.openai.com/v1/responses',
    );
    expect(fetchFn.mock.calls[0]?.[1]?.redirect).toBe('error');
    expect(JSON.stringify(sent)).not.toContain('synthetic-test-credential');
  });
  it.each([
    call('execute_trade'),
    call('features', 'BTC'),
    { ...call(), name: 'fetch_url' },
    call('features;DROP TABLE markets'),
  ])('rejects unauthorized call without querying %j', async (bad) => {
    const read = vi.fn(async () => analystResult());
    const provider = new OpenAIAnalystProvider({
      apiKey: 'synthetic-test-credential',
      model: 'fixture-model',
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(response([bad])),
    });
    await expect(provider.analyze(analystRequest, read)).rejects.toThrow(
      'MALFORMED_RESPONSE',
    );
    expect(read).not.toHaveBeenCalled();
  });
  it('rejects repeated/multiple tools, incomplete response, refusal and unstructured fabricated facts', async () => {
    for (const body of [
      { status: 'incomplete', output: [] },
      { status: 'completed', output: [call(), call()] },
      {
        status: 'completed',
        output: [message({ evidenceIds: [], facts: ['83% chance of pump'] })],
      },
    ]) {
      const provider = new OpenAIAnalystProvider({
        apiKey: 'synthetic-test-credential',
        model: 'fixture-model',
        fetchFn: vi.fn<typeof fetch>().mockResolvedValue(Response.json(body)),
      });
      await expect(
        provider.analyze(analystRequest, async () => analystResult()),
      ).rejects.toThrow('MALFORMED_RESPONSE');
    }
    const provider = new OpenAIAnalystProvider({
      apiKey: 'synthetic-test-credential',
      model: 'fixture-model',
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(response([call()])),
    });
    await expect(
      provider.analyze(analystRequest, async () => analystResult()),
    ).rejects.toThrow('MALFORMED_RESPONSE');
  });
  it.each([429, 401, 500])(
    'sanitizes HTTP %i failures without secret leakage',
    async (status) => {
      const provider = new OpenAIAnalystProvider({
        apiKey: 'synthetic-test-credential',
        model: 'fixture-model',
        fetchFn: vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response('private provider detail', { status }),
          ),
      });
      await expect(
        provider.analyze(analystRequest, async () => analystResult()),
      ).rejects.toThrow(status === 429 ? 'RATE_LIMIT' : 'HTTP_ERROR');
    },
  );
  it('rejects network/oversized data and cancels requests', async () => {
    for (const fetchFn of [
      vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('credential not exposed')),
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('x', {
          headers: { 'Content-Length': String(256 * 1024 + 1) },
        }),
      ),
    ]) {
      await expect(
        new OpenAIAnalystProvider({
          apiKey: 'synthetic-test-credential',
          model: 'fixture-model',
          fetchFn,
        }).analyze(analystRequest, async () => analystResult()),
      ).rejects.toThrow('MALFORMED_RESPONSE');
    }
    const abort = new AbortController();
    abort.abort();
    const fetchFn = vi.fn<typeof fetch>();
    await expect(
      new OpenAIAnalystProvider({
        apiKey: 'synthetic-test-credential',
        model: 'fixture-model',
        fetchFn,
      }).analyze(analystRequest, async () => analystResult(), abort.signal),
    ).rejects.toThrow('TIMEOUT');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
