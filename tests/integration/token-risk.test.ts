import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { DexScreenerProvider } from '../../packages/providers/src/token-data';
import {
  createDatabase,
  type DatabaseConnection,
} from '../../packages/db/src/index';
import { runMigrations } from '../../packages/db/src/migrate';
import {
  configureTokenUniverse,
  persistDexPairs,
  persistTokenSecurity,
  persistTokenRisk,
  queryTokens,
  computeTokenRisk,
  retainTokenHistory,
} from '../../packages/db/src/tokens';
import {
  defaultTokens,
  tokenId,
  tokenResponseSchema,
  calculateTokenRisk,
} from '../../packages/domain/src/token-risk';
import {
  fixturePair,
  fixtureSecurity,
  tokenNow,
  tokenRef,
} from '../fixtures/token-risk';
let connection: DatabaseConnection;
beforeAll(async () => {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('TEST_DATABASE_URL required');
  const target = new URL(value);
  if (
    target.pathname !== '/terminal_test' ||
    !['localhost', '127.0.0.1'].includes(target.hostname)
  )
    throw new Error('Local disposable terminal_test required');
  connection = createDatabase(value);
  await runMigrations(value);
});
beforeEach(async () => {
  await connection.client`TRUNCATE tracked_tokens CASCADE`;
  await configureTokenUniverse(connection, defaultTokens);
});
afterAll(async () => {
  if (connection) await connection.client.end({ timeout: 3 });
});
describe('bounded token evidence persistence', () => {
  it('preserves provenance through persisted history, calculation and query DTO', async () => {
    await persistDexPairs(connection, [
      fixturePair(1000, new Date(tokenNow.getTime() - 3600000)),
    ]);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(tokenNow);
    let normalized;
    try {
      normalized = await new DexScreenerProvider({
        fetchFn: async () =>
          new Response(
            JSON.stringify([
              {
                chainId: 'solana',
                pairAddress: fixturePair().address,
                dexId: 'fixture',
                baseToken: {
                  address: tokenRef.address,
                  name: 'Synthetic provider fixture',
                  symbol: 'FIXTURE',
                },
                quoteToken: { symbol: 'USDC' },
                priceUsd: '10',
                liquidity: { usd: 850 },
                volume: { h24: 500 },
                marketCap: 100000,
              },
            ]),
          ),
      }).getPairs([tokenRef]);
    } finally {
      vi.useRealTimers();
    }
    await persistDexPairs(connection, normalized);
    await persistTokenSecurity(connection, fixtureSecurity());
    await computeTokenRisk(connection, defaultTokens, tokenNow);
    await computeTokenRisk(connection, defaultTokens, tokenNow);
    const response = tokenResponseSchema.parse(
      await queryTokens(connection, tokenNow),
    );
    expect(response.pairs[0]?.provenance.providerId).toBe('dexscreener');
    expect(response.pairs[0]?.provenance.source).toContain(
      '/tokens/v1/solana/',
    );
    expect(
      response.risks.find((r) => r.tokenId === tokenId(tokenRef))
        ?.liquidityChange1h,
    ).toBeCloseTo(-15);
    expect(
      response.risks.find((r) => r.tokenId === tokenId(defaultTokens[1]!))
        ?.vacuum,
    ).toBe('UNAVAILABLE');
    const [count] =
      await connection.client`SELECT count(*)::int AS count FROM risk_snapshots`;
    expect(count?.count).toBe(2);
  });
  it('ingests idempotently, keeps newest source and excludes future observations', async () => {
    await persistDexPairs(connection, [fixturePair()]);
    await persistDexPairs(connection, [fixturePair()]);
    await persistDexPairs(connection, [
      fixturePair(900, new Date(tokenNow.getTime() + 1000)),
    ]);
    await persistDexPairs(connection, [fixturePair(100)]);
    const response = await queryTokens(
      connection,
      new Date(tokenNow.getTime() + 1000),
    );
    expect(response.pairs[0]?.liquidityUsd).toBe(900);
    expect((await queryTokens(connection, tokenNow)).pairs).toHaveLength(0);
    const [count] =
      await connection.client`SELECT count(*)::int AS count FROM dex_snapshots`;
    expect(count?.count).toBe(1);
    await persistTokenSecurity(connection, fixtureSecurity());
    await persistTokenSecurity(connection, fixtureSecurity());
    const [security] =
      await connection.client`SELECT count(*)::int AS count FROM token_security_snapshots`;
    expect(security?.count).toBe(1);
  });
  it('rolls back malformed identity batches and enforces database relationships', async () => {
    await persistDexPairs(connection, [fixturePair()]);
    await expect(
      persistDexPairs(connection, [
        { ...fixturePair(), tokenId: tokenId(defaultTokens[1]!) },
      ]),
    ).rejects.toThrow('DEX_PAIR_IDENTITY_CONFLICT');
    await expect(
      persistDexPairs(connection, [
        { ...fixturePair(), id: 'unknown', tokenId: 'unknown' },
      ]),
    ).rejects.toThrow();
    expect((await queryTokens(connection, tokenNow)).pairs[0]?.tokenId).toBe(
      tokenId(tokenRef),
    );
    await expect(
      connection.client`UPDATE dex_snapshots SET liquidity_usd=-1`,
    ).rejects.toThrow();
  });
  it('switches the active universe without deleting existing history', async () => {
    await persistDexPairs(connection, [fixturePair()]);
    await configureTokenUniverse(connection, [defaultTokens[1]!]);
    expect((await queryTokens(connection, tokenNow)).pairs).toHaveLength(0);
    const [count] =
      await connection.client`SELECT count(*)::int AS count FROM dex_snapshots`;
    expect(count?.count).toBe(1);
    await configureTokenUniverse(connection, defaultTokens);
    expect(
      (await queryTokens(connection, tokenNow)).tokens.find(
        (t) => t.id === tokenId(tokenRef),
      )?.symbol,
    ).toBe('FIXTURE');
  });
  it('serves only active methodology and rejects incomplete full-score claims', async () => {
    const risk = calculateTokenRisk(tokenRef, [], [], null, [], tokenNow);
    await persistTokenRisk(connection, [risk]);
    await persistTokenRisk(connection, [
      {
        ...risk,
        provenance: { ...risk.provenance, methodologyVersion: 'token-risk:v2' },
      },
    ]);
    expect((await queryTokens(connection, tokenNow)).risks).toHaveLength(1);
    await expect(
      connection.client`UPDATE risk_snapshots SET contract_score=90 WHERE contract_coverage=0`,
    ).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(
      computeTokenRisk(connection, defaultTokens, tokenNow, controller.signal),
    ).rejects.toThrow();
  });
  it('retains exactly the 180-day boundary and removes older token observations', async () => {
    for (const days of [0, 180, 181]) {
      const at = new Date(tokenNow.getTime() - days * 86400000),
        pair = fixturePair(1000, at),
        security = { ...fixtureSecurity(), provenance: pair.provenance };
      await persistDexPairs(connection, [pair]);
      await persistTokenSecurity(connection, security);
      await persistTokenRisk(connection, [
        calculateTokenRisk(tokenRef, [pair], [], security, [], at),
      ]);
    }
    expect(await retainTokenHistory(connection, tokenNow)).toBe(3);
    const [count] =
      await connection.client`SELECT count(*)::int AS count FROM dex_snapshots`;
    expect(count?.count).toBe(2);
  });
});
