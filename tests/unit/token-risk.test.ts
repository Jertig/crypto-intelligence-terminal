import { describe, expect, it, vi } from 'vitest';
import {
  calculateTokenRisk,
  configuredTokens,
  defaultTokens,
  riskSnapshotSchema,
  tokenId,
  validSolanaAddress,
} from '../../packages/domain/src/token-risk';
import {
  DexScreenerProvider,
  GoPlusProvider,
  normalizeSecurity,
  tokenRequest,
} from '../../packages/providers/src/token-data';
import {
  fixturePair,
  fixtureSecurity,
  tokenNow,
  tokenRef,
} from '../fixtures/token-risk';
const derive = (
  pair = fixturePair(),
  prior = fixturePair(1000, new Date(tokenNow.getTime() - 3600000)),
  security = fixtureSecurity(),
) => calculateTokenRisk(tokenRef, [pair], [prior], security, [], tokenNow);
describe('separate token risk evidence', () => {
  it('validates chain identities, duplicate configuration and the bounded universe', () => {
    expect(validSolanaAddress(tokenRef.address)).toBe(true);
    expect(validSolanaAddress('z'.repeat(44))).toBe(false);
    expect(() => configuredTokens('solana:garbage')).toThrow();
    expect(() =>
      configuredTokens(`solana:${tokenRef.address},solana:${tokenRef.address}`),
    ).toThrow();
    expect(configuredTokens()).toHaveLength(2);
    expect(tokenId({ chain: 'base', address: '0x' + 'A'.repeat(40) })).toBe(
      'token:base:0x' + 'a'.repeat(40),
    );
  });
  it('keeps contract, ownership, liquidity and structure separate and incomplete evidence null', () => {
    const result = derive();
    expect(result.categories.map((c) => c.name)).toEqual([
      'CONTRACT',
      'OWNERSHIP',
      'LIQUIDITY',
      'MARKET_STRUCTURE',
    ]);
    expect(result.categories[0]).toMatchObject({ coverage: 1, score: 0 });
    expect(result.categories[1]).toMatchObject({
      coverage: 0.4,
      score: null,
      partialScore: 60,
    });
    expect(result.categories[2]?.coverage).toBeCloseTo(0.85);
    expect(result.categories[3]).toMatchObject({ coverage: 0, score: null });
    expect(
      derive(fixturePair(), undefined, fixtureSecurity(true)).categories[0]
        ?.score,
    ).toBeCloseTo(100);
    expect(
      derive(fixturePair(), undefined, fixtureSecurity(null)).categories[0]
        ?.score,
    ).toBeNull();
  });
  it.each([
    [650, 5000, 'CRITICAL'],
    [850, 3000, 'VACUUM_FORMING'],
    [940, 1000, 'THINNING'],
    [1000, 500, 'HEALTHY'],
  ] as const)(
    'explains same-pool proxy %s/%s',
    (liquidity, volume, expected) => {
      expect(
        derive({ ...fixturePair(liquidity), volume24hUsd: volume }).vacuum,
      ).toBe(expected);
    },
  );
  it('refuses stale, future, zero-liquidity and different-pool history', () => {
    const prior = fixturePair(1000, new Date(tokenNow.getTime() - 3600000));
    expect(
      derive(fixturePair(), { ...prior, id: 'different-pool' }).vacuum,
    ).toBe('UNAVAILABLE');
    expect(derive(fixturePair(0)).volumeLiquidityRatio).toBeNull();
    expect(
      derive(fixturePair(1000, new Date(tokenNow.getTime() - 1800001))).vacuum,
    ).toBe('UNAVAILABLE');
    expect(
      derive(fixturePair(1000, new Date(tokenNow.getTime() + 6000))).vacuum,
    ).toBe('UNAVAILABLE');
    const result = derive({ ...fixturePair(), marketCapUsd: null });
    expect(result.categories[2]?.components[2]?.value).toBeNull();
    const disputed = derive({ ...fixturePair(), fdvUsd: 1000 });
    expect(disputed.categories[2]?.components[2]?.value).toBeNull();
    expect(disputed.categories[2]?.components[2]?.reason).toContain(
      'scope discrepancy',
    );
    const stale = {
      ...fixtureSecurity(),
      provenance: {
        ...fixtureSecurity().provenance,
        sourceTimestamp: new Date(tokenNow.getTime() - 7200001).toISOString(),
      },
    };
    expect(
      derive(fixturePair(), prior, stale).categories[0]?.components[0]?.state,
    ).toBe('STALE_INPUT');
  });
  it('rejects incoherent category coverage and duplicate categories', () => {
    const result = derive();
    expect(
      riskSnapshotSchema.safeParse({
        ...result,
        categories: result.categories.map((c) => ({ ...c, coverage: 0 })),
      }).success,
    ).toBe(false);
    expect(
      riskSnapshotSchema.safeParse({
        ...result,
        categories: result.categories.map((c) => ({ ...c, partialScore: 99 })),
      }).success,
    ).toBe(false);
    expect(
      riskSnapshotSchema.safeParse({
        ...result,
        categories: Array(4).fill(result.categories[0]),
      }).success,
    ).toBe(false);
  });
  it('anchors the one-hour comparison to current collection rather than recalculation time', () => {
    const pair = fixturePair(850, new Date(tokenNow.getTime() - 1200000));
    const prior = fixturePair(1000, new Date(tokenNow.getTime() - 4800000));
    expect(derive(pair, prior).liquidityChange1h).toBeCloseTo(-15);
    expect(
      derive(pair, fixturePair(1000, new Date(tokenNow.getTime() - 3600000)))
        .liquidityChange1h,
    ).toBeNull();
  });
});
const rawPair = (i = 0) => ({
  chainId: 'solana',
  pairAddress: `pool${i}`,
  dexId: 'fixture',
  baseToken: {
    address: tokenRef.address,
    name: 'Synthetic',
    symbol: 'FIXTURE',
  },
  quoteToken: { symbol: 'USDC' },
  priceUsd: '10',
  liquidity: { usd: 1000 + i },
  volume: { h24: 200 },
  fdv: 99999,
});
const fetchBody = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status, headers }),
  );
describe('bounded public DEX and security adapters', () => {
  it('keeps only top three selected base pools and never substitutes FDV for market cap', async () => {
    const fetchFn = fetchBody([
      ...Array.from({ length: 5 }, (_, i) => rawPair(i)),
      {
        ...rawPair(8),
        baseToken: {
          address: defaultTokens[1]!.address,
          name: 'Other',
          symbol: 'OTHER',
        },
      },
    ]);
    const rows = await new DexScreenerProvider({
      fetchFn,
      apiKey: 'test-only-key',
    }).getPairs([tokenRef]);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.liquidityUsd).toBe(1004);
    expect(rows[0]?.marketCapUsd).toBeNull();
    expect(rows[0]?.provenance.quality).toBe('AGGREGATED');
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'error',
      headers: {},
    });
  });
  it('rejects malformed selected numeric fields, empty and oversized responses', async () => {
    await expect(
      new DexScreenerProvider({
        fetchFn: fetchBody([{ ...rawPair(), priceUsd: 'garbage' }]),
      }).getPairs([tokenRef]),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    await expect(
      new DexScreenerProvider({ fetchFn: fetchBody([]) }).getPairs([tokenRef]),
    ).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
    await expect(
      tokenRequest('https://api.dexscreener.com', '/tokens/v1/solana', {
        fetchFn: fetchBody([], 200, { 'content-length': '3000000' }),
      }),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });
  it('does not convert missing capabilities, partial holders or zero supply into safety claims', () => {
    const unknown = normalizeSecurity(
      { trusted_token: '1', total_supply: '0', holders: [{ percent: '0.9' }] },
      tokenRef,
      tokenNow,
      '/test',
    );
    expect(unknown.capabilities.mintable).toBeNull();
    expect(unknown.top10HolderShare).toBeNull();
    expect(
      normalizeSecurity(
        { holder_count: '', total_supply: true, holders: [{ percent: '0.9' }] },
        tokenRef,
        tokenNow,
        '/test',
      ),
    ).toMatchObject({ holderCount: null, top10HolderShare: null });
    const body = {
      total_supply: '100',
      holder_count: '1000',
      holders: Array.from({ length: 10 }, () => ({ percent: '0.05' })),
      mintable: { status: '1' },
      freezable: { status: '0' },
    };
    expect(normalizeSecurity(body, tokenRef, tokenNow, '/test')).toMatchObject({
      capabilities: { mintable: true, freezable: false },
    });
    expect(
      normalizeSecurity(body, tokenRef, tokenNow, '/test').top10HolderShare,
    ).toBeCloseTo(0.5);
    expect(
      normalizeSecurity(
        { ...body, holders: body.holders.slice(0, 3) },
        tokenRef,
        tokenNow,
        '/test',
      ).top10HolderShare,
    ).toBeNull();
    expect(
      normalizeSecurity(
        { is_blacklisted: '0', is_mintable: '1' },
        { chain: 'ethereum', address: '0x' + 'a'.repeat(40) },
        tokenNow,
        '/test',
      ).capabilities.freezable,
    ).toBeNull();
  });
  it('uses only the intended public origin and sanitizes timeout/rate/HTTP failures', async () => {
    await expect(
      tokenRequest('https://api.dexscreener.com', '//evil.test/private'),
    ).rejects.toThrow('INVALID_PROVIDER_ENDPOINT');
    await expect(
      tokenRequest('https://api.dexscreener.com', '//internal/private'),
    ).rejects.toThrow('INVALID_PROVIDER_ENDPOINT');
    await expect(
      tokenRequest('https://api.dexscreener.com', '/../private'),
    ).rejects.toThrow('INVALID_PROVIDER_ENDPOINT');
    await expect(
      tokenRequest('https://api.dexscreener.com', '/tokens', {
        fetchFn: fetchBody({}, 429, { 'retry-after': '9000' }),
      }),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT', retryAfterMs: 600000 });
    await expect(
      tokenRequest('https://api.dexscreener.com', '/tokens', {
        fetchFn: fetchBody({ secret: 'upstream' }, 500),
      }),
    ).rejects.toMatchObject({ code: 'HTTP_ERROR', message: 'HTTP_ERROR' });
    await expect(
      tokenRequest('https://api.dexscreener.com', '/tokens', {
        fetchFn: async () => {
          throw new DOMException('hidden', 'TimeoutError');
        },
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
  it('normalizes optional security calls with server-only credentials and rejects missing token records', async () => {
    const fetchFn = fetchBody({
      code: 1,
      result: { [tokenRef.address]: { mintable: { status: '0' } } },
    });
    expect(
      (
        await new GoPlusProvider({
          fetchFn,
          apiKey: 'test-only-key',
        }).getSecurity(tokenRef)
      ).capabilities.mintable,
    ).toBe(false);
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: 'Bearer test-only-key',
    });
    await expect(
      new GoPlusProvider({
        fetchFn: fetchBody({ code: 1, result: {} }),
      }).getSecurity(tokenRef),
    ).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
  });
});
