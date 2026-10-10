import { describe, it, expect } from 'vitest';
import {
  calculateFeatures,
  featureVersion,
  initialExposures,
  validateExposures,
  scoreNarrative,
  pearson,
  type Feature,
} from '../../packages/domain/src/intelligence';
import {
  calculateSignals,
  applySectorStrength,
} from '../../packages/domain/src/signals';
import {
  fixtureNow,
  fixtureInput,
  fixtureBars,
} from '../fixtures/market-history';
const get = (features: Feature[], name: Feature['name']) =>
  features.find((feature) => feature.name === name);
describe('versioned feature calculations', () => {
  it('calculates closed-window returns, correlation, observed rates and base-unit OI with input references', () => {
    const results = calculateFeatures(fixtureInput(), fixtureNow);
    expect(results).toHaveLength(14);
    expect(get(results, 'return_1h')?.value).toBeCloseTo(
      100 * (300 / 298 - 1),
      6,
    );
    expect(get(results, 'relative_strength_btc')?.value).toBeCloseTo(0, 8);
    expect(get(results, 'btc_corr_30d')?.value).toBeCloseTo(1, 8);
    expect(get(results, 'oi_change_1h')?.value).toBeCloseTo(
      100 * (388 / 376 - 1),
      6,
    );
    expect(get(results, 'oi_change_24h')?.value).toBeCloseTo(288, 6);
    expect(get(results, 'perp_basis')?.value).toBeCloseTo(1, 8);
    expect(get(results, 'funding_zscore')?.value).not.toBeNull();
    expect(get(results, 'volume_zscore')?.value).not.toBeNull();
    expect(
      results.every(
        (feature) =>
          feature.provenance.quality === 'DERIVED' &&
          feature.provenance.methodologyVersion === featureVersion,
      ),
    ).toBe(true);
    expect(get(results, 'return_24h')?.inputs[0]?.samples).toBe(25);
  });
  it('does not look ahead into unclosed future bars', () => {
    const input = fixtureInput();
    const original = calculateFeatures(input, fixtureNow);
    const last = input.candles.find((bar) => bar.timeframe === '1h');
    if (!last) throw new Error('Missing fixture');
    input.candles.push({
      ...last,
      close: 999,
      high: 1000,
      openTime: fixtureNow.toISOString(),
      closeTime: new Date(fixtureNow.getTime() + 3600000).toISOString(),
    });
    expect(get(calculateFeatures(input, fixtureNow), 'return_1h')).toEqual(
      get(original, 'return_1h'),
    );
  });
  it('rejects missing, gapped and stale windows instead of guessing returns', () => {
    const input = fixtureInput();
    input.candles = input.candles.filter((bar) => bar.timeframe !== '1h');
    expect(get(calculateFeatures(input, fixtureNow), 'return_24h')?.state).toBe(
      'INSUFFICIENT_HISTORY',
    );
    const gapped = fixtureInput();
    const hourly = gapped.candles.filter((bar) => bar.timeframe === '1h');
    gapped.candles = gapped.candles.filter((bar) => bar !== hourly.at(-3));
    expect(
      get(calculateFeatures(gapped, fixtureNow), 'return_24h')?.state,
    ).toBe('HISTORY_GAP');
    expect(
      get(
        calculateFeatures(
          fixtureInput(),
          new Date(fixtureNow.getTime() + 10800000),
        ),
        'return_1h',
      )?.state,
    ).toBe('STALE_INPUT');
  });
  it('does not compare asynchronous return windows or future mark prices', () => {
    const input = fixtureInput();
    input.btcCandles = input.btcCandles.filter(
      (bar) =>
        bar !== input.btcCandles.filter((bar) => bar.timeframe === '1h').at(-1),
    );
    expect(
      get(calculateFeatures(input, fixtureNow), 'relative_strength_btc')?.value,
    ).toBeNull();
    const future = fixtureInput();
    if (!future.market.funding) throw new Error('Missing fixture');
    future.market.funding.provenance.sourceTimestamp = new Date(
      fixtureNow.getTime() + 3600000,
    ).toISOString();
    expect(
      get(calculateFeatures(future, fixtureNow), 'perp_basis')?.value,
    ).toBeNull();
  });
  it('keeps zero variance and absent derivative evidence unavailable', () => {
    const input = fixtureInput();
    input.candles = input.candles.map((bar) => ({ ...bar, volume: 100 }));
    input.funding = input.funding.map((value) => ({ ...value, rate: 0.0001 }));
    input.oi = [];
    const results = calculateFeatures(input, fixtureNow);
    expect(get(results, 'volume_zscore')?.state).toBe('ZERO_VARIANCE');
    expect(get(results, 'funding_zscore')?.state).toBe('ZERO_VARIANCE');
    expect(get(results, 'oi_change_1h')?.value).toBeNull();
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    expect(pearson([1, 2], [1, 2, 3])).toBeNull();
  });
  it('computes curated peer strength only from aligned available peers and records inputs', () => {
    const members = ['ETH', 'AAVE'].map((base) => ({
      assetId: `binance:${base}`,
      marketId: `binance:spot:${base}USDT`,
      features: calculateFeatures(fixtureInput(base), fixtureNow),
    }));
    applySectorStrength(members, initialExposures);
    expect(
      get(members[0]?.features ?? [], 'relative_strength_sector')?.value,
    ).toBeCloseTo(0);
    expect(
      get(members[0]?.features ?? [], 'relative_strength_sector')?.inputs,
    ).toHaveLength(2);
    expect(fixtureBars('BTC', '1d', 31)).toHaveLength(31);
  });
});
describe('bounded narrative and regime methodology', () => {
  it('rejects executable or credential-bearing classification links', () => {
    for (const source of [
      'javascript:alert(1)',
      'http://example.test',
      'https://user:password@example.test',
    ])
      expect(() =>
        validateExposures([
          { assetId: 'binance:ETH', narrativeId: 'l1', weight: 1, source },
        ]),
      ).toThrow();
  });
  it('preserves missing universe coverage and excludes future narrative evidence', () => {
    const members = ['BTC', 'ETH', 'AAVE'].map((base) => ({
      assetId: `binance:${base}`,
      marketId: `binance:spot:${base}USDT`,
      features: calculateFeatures(fixtureInput(base), fixtureNow),
    }));
    expect(
      calculateSignals(members, fixtureNow, 12).find(
        (signal) => signal.kind === 'BREADTH',
      )?.coverage,
    ).toBe(0.25);
    expect(
      calculateSignals(members, fixtureNow, 12).find(
        (signal) => signal.kind === 'BREADTH',
      )?.value,
    ).toBeNull();
    const eth = members[1]!;
    expect(
      scoreNarrative('defi', [eth], initialExposures, fixtureNow).coverage,
    ).toBeCloseTo((0.75 * 0.2) / 1.2);
    expect(
      scoreNarrative(
        'l1',
        [eth],
        initialExposures,
        new Date(fixtureNow.getTime() - 1),
      ).coverage,
    ).toBe(0);
  });
  it('validates weighted allocation and refuses duplicate, overflowing or unknown exposures', () => {
    expect(() => validateExposures(initialExposures)).not.toThrow();
    expect(() =>
      validateExposures([
        ...initialExposures,
        {
          assetId: 'binance:ETH',
          narrativeId: 'ai',
          weight: 0.5,
          source: 'https://example.test/classification',
        },
      ]),
    ).toThrow();
    expect(() =>
      validateExposures([initialExposures[0]!, initialExposures[0]!]),
    ).toThrow();
    expect(() =>
      validateExposures([
        {
          assetId: 'test',
          narrativeId: 'unknown',
          weight: 1,
          source: 'https://example.test/classification',
        },
      ]),
    ).toThrow();
  });
  it('keeps full scores absent with missing wallet/protocol evidence and exposes exact component weights', () => {
    const members = [
      {
        assetId: 'binance:ETH',
        features: calculateFeatures(fixtureInput(), fixtureNow),
      },
    ];
    const result = scoreNarrative('l1', members, initialExposures, fixtureNow);
    expect(result.score).toBeNull();
    expect(result.coverage).toBeCloseTo(0.75);
    expect(result.partialScore).not.toBeNull();
    expect(result.components.map((component) => component.weight)).toEqual([
      0.3, 0.2, 0.15, 0.1, 0.15, 0.1,
    ]);
    expect(
      result.components.find((component) => component.name === 'wallet_inflow')
        ?.value,
    ).toBeNull();
    expect(
      scoreNarrative('ai', members, initialExposures, fixtureNow).partialScore,
    ).toBeNull();
    expect(
      scoreNarrative(
        'l1',
        members,
        initialExposures,
        new Date(fixtureNow.getTime() + 1200000),
      ).coverage,
    ).toBe(0);
  });
  it('reports sampled breadth while withholding regime classification without derivatives', () => {
    const members = ['BTC', 'ETH', 'AAVE'].map((base) => {
      const input = fixtureInput(base);
      input.funding = [];
      input.oi = [];
      return {
        assetId: input.market.assetId,
        marketId: input.market.id,
        features: calculateFeatures(input, fixtureNow),
      };
    });
    const result = calculateSignals(members, fixtureNow);
    expect(result.find((signal) => signal.kind === 'BREADTH')?.value).toBe(1);
    expect(result.find((signal) => signal.kind === 'REGIME')?.state).toBe(
      'UNAVAILABLE',
    );
    expect(
      result
        .find((signal) => signal.kind === 'REGIME')
        ?.factors.find((factor) => factor.name === 'BTC funding positioning')
        ?.value,
    ).toBeNull();
  });
  it('classifies leverage only with complete observed inputs and refuses poor breadth coverage', () => {
    const members = ['BTC', 'ETH', 'AAVE'].map((base) => ({
      assetId: `binance:${base}`,
      marketId: `binance:spot:${base}USDT`,
      features: calculateFeatures(fixtureInput(base), fixtureNow),
    }));
    expect(
      calculateSignals(members, fixtureNow).find(
        (signal) => signal.kind === 'REGIME',
      )?.state,
    ).toBe('RISK_ON_LEVERAGED');
    members[0]!.features = members[0]!.features.map((feature) =>
      feature.name === 'return_24h'
        ? { ...feature, value: null, state: 'MISSING_INPUT' }
        : feature,
    );
    expect(
      calculateSignals(members, fixtureNow).find(
        (signal) => signal.kind === 'BREADTH',
      )?.state,
    ).toBe('UNAVAILABLE');
  });
});
