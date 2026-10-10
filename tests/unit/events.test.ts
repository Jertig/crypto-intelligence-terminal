import { describe, it, expect } from 'vitest';
import {
  eventImpact,
  eventSchema,
  alignedChanges,
  regression,
  rollingCorrelation,
  leadLag,
  macroObservationSchema,
} from '../../packages/domain/src/events';
import { FredProvider } from '../../packages/providers/src/fred';
import {
  eventFixture,
  eventBar,
  eventTime,
  eventNow,
  fredFixture,
  macroFixture,
} from '../fixtures/events';
const provider = (body: unknown, status = 200) =>
  new FredProvider({
    apiKey: 'synthetic-test-credential',
    now: () => eventNow,
    fetchFn: async () => Response.json(body, { status }),
  });
const input = () => ({
  candles: Array.from({ length: 11 }, (_, i) => eventBar(i - 6)),
  oi: [],
  funding: [],
});
describe('FRED observations', () => {
  it('keeps periods, realtime range and first collection distinct without key leakage', async () => {
    let url = '';
    const p = new FredProvider({
      apiKey: 'synthetic-test-credential',
      now: () => eventNow,
      fetchFn: async (u, o) => {
        url = String(u);
        expect(o?.redirect).toBe('error');
        return Response.json(fredFixture());
      },
    });
    const [row] = await p.observations('SP500');
    expect(row?.date).toBe('2026-09-01');
    expect(row?.realtimeStart).toBe('2026-09-02');
    expect(row?.provenance.ingestedAt).toBe(eventNow.toISOString());
    expect(JSON.stringify(row)).not.toContain('credential');
    expect(new URL(url).hostname).toBe('api.stlouisfed.org');
    expect(new URL(url).searchParams.get('limit')).toBe('2000');
  });
  it('preserves dot missing values and legitimate zero and negative data', async () => {
    for (const [value, expected] of [
      ['.', null],
      ['0', 0],
      ['-0.5', -0.5],
    ] as const)
      expect(
        (await provider(fredFixture(value)).observations('SP500'))[0]?.value,
      ).toBe(expected);
  });
  it('handles valid empty responses', async () => {
    expect(
      await provider({ count: 0, offset: 0, observations: [] }).observations(
        'SP500',
      ),
    ).toEqual([]);
  });
  it('rejects malformed values, future periods, inconsistent vintage ranges and duplicate dates', async () => {
    for (const body of [
      fredFixture('NaN'),
      fredFixture('1', '2026-10-01'),
      {
        ...fredFixture(),
        observations: [
          { ...fredFixture().observations[0], realtime_start: '2026-09-01' },
        ],
      },
      {
        ...fredFixture(),
        count: 2,
        observations: [
          ...fredFixture().observations,
          ...fredFixture().observations,
        ],
      },
    ])
      await expect(provider(body).observations('SP500')).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
      });
  });
  it('rejects incomplete pages and oversized declared bodies', async () => {
    await expect(
      provider({ ...fredFixture(), count: 2001 }).observations('SP500'),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    const p = new FredProvider({
      apiKey: 'synthetic-test',
      now: () => eventNow,
      fetchFn: async () =>
        new Response('{}', { headers: { 'content-length': '3000000' } }),
    });
    await expect(p.observations('SP500')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });
  it('sanitizes rate-limit, HTTP and network failures', async () => {
    await expect(provider({}, 429).observations('SP500')).rejects.toMatchObject(
      { code: 'RATE_LIMIT' },
    );
    await expect(provider({}, 500).observations('SP500')).rejects.toMatchObject(
      { code: 'HTTP_ERROR' },
    );
    const p = new FredProvider({
      apiKey: 'synthetic-test-secret',
      fetchFn: async () => {
        throw new Error('synthetic-test-secret');
      },
    });
    await expect(p.observations('SP500')).rejects.toThrow('UNAVAILABLE');
  });
  it('respects aborted calls and validates the bounded series universe', async () => {
    const abort = new AbortController();
    abort.abort();
    const p = new FredProvider({
      apiKey: 'synthetic-test',
      signal: abort.signal,
      fetchFn: async () => {
        throw new DOMException('aborted', 'AbortError');
      },
    });
    await expect(p.observations('SP500')).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await expect(p.observations('ARBITRARY' as 'SP500')).rejects.toThrow();
  });
});
describe('event-impact v1', () => {
  it('rejects mixed-asset inputs, unsupported windows and observed future actual values', () => {
    expect(() =>
      eventImpact(eventFixture, 'ETH', 5, input(), eventNow),
    ).toThrow('INVALID_EVENT_WINDOW_INPUT');
    expect(() =>
      eventImpact(
        eventFixture,
        'BTC',
        5,
        {
          ...input(),
          candles: [
            eventBar(0),
            { ...eventBar(1), marketId: 'another-market' },
          ],
        },
        eventNow,
      ),
    ).toThrow('INVALID_EVENT_WINDOW_INPUT');
    expect(
      eventSchema.safeParse({
        ...eventFixture,
        collectedAt: new Date(eventTime.getTime() - 1).toISOString(),
      }).success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({
        ...eventFixture,
        collectedAt: new Date(eventTime.getTime() - 1).toISOString(),
        actual: null,
      }).success,
    ).toBe(true);
    expect(
      macroObservationSchema.safeParse({
        ...macroFixture(),
        realtimeEnd: '2026-09-03',
      }).success,
    ).toBe(false);
  });
  it('uses contiguous closed windows and equal volume baselines', () => {
    const r = eventImpact(eventFixture, 'BTC', 5, input(), eventNow);
    expect(r.returnPct).toBeCloseTo((100.04 / 99.99 - 1) * 100);
    expect(r.volumeAbnormalityPct).toBe(100);
    expect(r.anchorAt).toBe(eventBar(-1).closeTime);
    expect(r.endAt).toBe(eventBar(4).closeTime);
    expect(r.oiChangePct).toBeNull();
    expect(r.reasons).toContain('MISSING_DISTINCT_FUNDING_BOUNDARIES');
    expect(r.provenance.quality).toBe('DERIVED');
  });
  it('never fills gaps or absent endpoints with estimates', () => {
    for (const missing of [-1, 2, 4]) {
      const r = eventImpact(
        eventFixture,
        'BTC',
        5,
        {
          ...input(),
          candles: input().candles.filter(
            (c) => c.openTime !== eventBar(missing).openTime,
          ),
        },
        eventNow,
      );
      expect(r.returnPct).toBeNull();
      expect(r.volumeAbnormalityPct).toBeNull();
    }
  });
  it('excludes uncompleted windows, future-collected bars and future-collected events', () => {
    expect(
      eventImpact(eventFixture, 'BTC', 5, input(), eventTime).returnPct,
    ).toBeNull();
    const r = eventImpact(
      eventFixture,
      'BTC',
      5,
      {
        ...input(),
        candles: input().candles.map((b) => ({
          ...b,
          provenance: {
            ...b.provenance,
            ingestedAt: new Date(eventNow.getTime() + 1).toISOString(),
          },
        })),
      },
      eventNow,
    );
    expect(r.returnPct).toBeNull();
    expect(
      eventImpact(
        {
          ...eventFixture,
          collectedAt: new Date(eventNow.getTime() + 1).toISOString(),
        },
        'BTC',
        5,
        input(),
        eventNow,
      ).reasons,
    ).toContain('WINDOW_OR_EVENT_NOT_YET_OBSERVED');
  });
  it('deduplicates bars and refuses a zero volume baseline', () => {
    const a = input();
    a.candles.push(eventBar(1));
    expect(
      eventImpact(eventFixture, 'BTC', 5, a, eventNow).returnPct,
    ).not.toBeNull();
    a.candles = a.candles.map((c) => ({ ...c, volume: 0 }));
    expect(
      eventImpact(eventFixture, 'BTC', 5, a, eventNow).volumeAbnormalityPct,
    ).toBeNull();
  });
  it('calculates only distinct matched derivative boundaries with consistent units', () => {
    const prov = (t: number) => ({
      ...eventBar(0).provenance,
      sourceTimestamp: new Date(eventTime.getTime() + t).toISOString(),
    });
    const oi = [
        { marketId: 'perp', quantity: 100, unit: 'BTC', provenance: prov(0) },
        {
          marketId: 'perp',
          quantity: 110,
          unit: 'BTC',
          provenance: prov(300000),
        },
      ],
      funding = [
        {
          marketId: 'perp',
          rate: 0.001,
          markPrice: 100,
          nextFundingAt: eventNow.toISOString(),
          provenance: prov(0),
        },
        {
          marketId: 'perp',
          rate: 0.002,
          markPrice: 100,
          nextFundingAt: eventNow.toISOString(),
          provenance: prov(300000),
        },
      ];
    const r = eventImpact(
      eventFixture,
      'BTC',
      5,
      { ...input(), oi, funding },
      eventNow,
    );
    expect(r.oiChangePct).toBeCloseTo(10);
    expect(r.fundingChangeBps).toBe(10);
    expect(
      eventImpact(
        eventFixture,
        'BTC',
        5,
        {
          ...input(),
          oi: [oi[0]!, { ...oi[1]!, unit: 'USD' }],
          funding: [funding[0]!],
        },
        eventNow,
      ).oiChangePct,
    ).toBeNull();
  });
  it('requires public credential-free citations and distinct affected assets', () => {
    for (const source of [
      'http://example.com',
      'https://user:secret@example.com',
      'https://example.com?api_key=secret',
    ])
      expect(eventSchema.safeParse({ ...eventFixture, source }).success).toBe(
        false,
      );
    expect(
      eventSchema.safeParse({ ...eventFixture, affectedAssets: ['BTC', 'BTC'] })
        .success,
    ).toBe(false);
    expect(
      macroObservationSchema.safeParse({
        ...macroFixture(),
        provenance: { ...macroFixture().provenance, providerId: 'fake' },
      }).success,
    ).toBe(false);
  });
});
describe('descriptive cross-market statistics', () => {
  it('returns unavailable for numerically overflowing regressions', () => {
    const huge = Array.from({ length: 30 }, (_, i) => ({
      date: String(i),
      x: i % 2 ? 1e308 : -1e308,
      y: i % 3 ? 1e308 : -1e308,
    }));
    expect(regression(huge)).toBeNull();
  });
  const pairs = Array.from({ length: 80 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    x: (i % 7) / 100,
    y: 0.001 + (2 * (i % 7)) / 100,
  }));
  it('recovers known OLS coefficients and correlation without probability claims', () => {
    const r = regression(pairs)!;
    expect(r.beta).toBeCloseTo(2);
    expect(r.alpha).toBeCloseTo(0.001);
    expect(r.correlation).toBeCloseTo(1);
    expect(r.rSquared).toBeCloseTo(1);
    expect(r.residualStd).toBeCloseTo(0);
    expect(r.n).toBe(80);
    expect(r).not.toHaveProperty('probability');
  });
  it('gates small or constant samples and nonfinite observations', () => {
    expect(regression(pairs.slice(0, 19))).toBeNull();
    expect(regression(pairs.map((p) => ({ ...p, x: 1 })))).toBeNull();
    expect(regression([...pairs, { date: 'bad', x: Infinity, y: 1 }])?.n).toBe(
      80,
    );
  });
  it('aligns common dates without forward fill or long-gap returns, and supports yield differences', () => {
    const x = [
        { date: '2026-01-01', value: 4 },
        { date: '2026-01-02', value: null },
        { date: '2026-01-03', value: 5 },
        { date: '2026-02-01', value: 6 },
      ],
      y = [
        { date: '2026-01-01', value: 100 },
        { date: '2026-01-03', value: 110 },
        { date: '2026-02-01', value: 120 },
      ];
    const a = alignedChanges(x, y, 'difference');
    expect(a).toHaveLength(1);
    expect(a[0]?.x).toBe(1);
    expect(a[0]?.y).toBeCloseTo(Math.log(1.1));
    expect(alignedChanges([...x, x[0]!], y)).toEqual([]);
  });
  it('uses trailing windows and validates rolling bounds', () => {
    const r = rollingCorrelation(pairs, 60);
    expect(r[18]?.statistics).toBeNull();
    expect(r[19]?.statistics?.n).toBe(20);
    expect(r.at(-1)?.statistics?.n).toBe(60);
    expect(() => rollingCorrelation(pairs, 10)).toThrow(
      'INVALID_RESEARCH_WINDOW',
    );
  });
  it('defines positive lag as predictor preceding crypto with a known shifted fixture', () => {
    const seq = Array.from(
      { length: 100 },
      (_, i) => Math.sin(i * 1.7) + Math.cos(i * 0.3),
    );
    const a = seq.slice(1).map((x, i) => ({ date: String(i), x, y: seq[i]! }));
    const r = leadLag(a);
    expect(r).toHaveLength(11);
    expect(r.find((r) => r.lag === 1)?.statistics?.correlation).toBeCloseTo(1);
  });
});
