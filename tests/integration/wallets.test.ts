import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import {
  createDatabase,
  type DatabaseConnection,
} from '../../packages/db/src/index';
import { runMigrations } from '../../packages/db/src/migrate';
import {
  configureWallets,
  persistWalletHistory,
  queryWallets,
  reserveWalletRequest,
  markWalletAttempt,
  retainWalletHistory,
} from '../../packages/db/src/wallets';
import { walletTransactions } from '../../packages/db/src/schema';
import { HeliusProvider } from '../../packages/providers/src/helius';
import { walletResponseSchema } from '../../packages/domain/src/wallets';
import {
  walletTx,
  walletNow,
  walletAddress,
  rawWalletTx,
} from '../fixtures/wallets';
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
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(walletNow);
  await connection.client`TRUNCATE tracked_wallets CASCADE`;
  await connection.client`DELETE FROM provider_health WHERE provider_id='helius'`;
  await configureWallets(connection, [
    {
      address: walletAddress,
      label: 'Synthetic fixture',
      labelSource: 'Fixture only',
    },
  ]);
});
afterAll(async () => {
  if (connection) await connection.client.end({ timeout: 3 });
});
afterEach(() => vi.useRealTimers());
describe('bounded wallet persistence', () => {
  it('compacts inactive history independently of credentials, without recounting concurrent retention or refreshing polls', async () => {
    await persistWalletHistory(
      connection,
      walletAddress,
      [walletTx()],
      false,
      walletNow,
    );
    await configureWallets(connection, []);
    const later = new Date(walletNow.getTime() + 91 * 86400000);
    const counts = await Promise.all([
      retainWalletHistory(connection, later),
      retainWalletHistory(connection, later),
    ]);
    expect(counts.reduce((s, n) => s + n, 0)).toBe(1);
    await configureWallets(connection, [
      { address: walletAddress, label: 'Fixture', labelSource: 'Test' },
    ]);
    const w = (await queryWallets(connection, later)).wallets[0];
    expect(w?.transactions).toHaveLength(0);
    expect(w?.compactedCount).toBe(1);
    expect(w?.lastPolledAt).toBe(walletNow.toISOString());
    expect(w?.firstObservedAt).toBe(walletNow.toISOString());
  });
  it('records failed attempts separately from successful poll freshness so rotation cannot starve addresses', async () => {
    await markWalletAttempt(connection, walletAddress, walletNow);
    const w = (await queryWallets(connection, walletNow)).wallets[0];
    expect(w?.lastAttemptAt).toBe(walletNow.toISOString());
    expect(w?.lastPolledAt).toBeNull();
    expect(w?.coverage).toBe('UNAVAILABLE');
  });
  it('reserves at most four requests per UTC day across restarts, then releases a new day', async () => {
    await connection.client`TRUNCATE wallet_provider_budget`;
    const reserved = await Promise.all(
      Array.from({ length: 6 }, () =>
        reserveWalletRequest(connection, walletNow),
      ),
    );
    expect(reserved.filter(Boolean)).toHaveLength(4);
    expect(await reserveWalletRequest(connection, walletNow)).toBe(false);
    expect(
      await reserveWalletRequest(
        connection,
        new Date(walletNow.getTime() + 86400000),
      ),
    ).toBe(true);
  });
  it('normalizes provider fixtures, persists, derives and validates provenance end to end', async () => {
    const history = await new HeliusProvider({
      apiKey: 'fixture',
      fetchFn: async () =>
        Response.json(Array.from({ length: 5 }, (_, i) => rawWalletTx(i))),
    }).history(walletAddress);
    await persistWalletHistory(
      connection,
      walletAddress,
      history,
      false,
      walletNow,
    );
    const data = walletResponseSchema.parse(
      await queryWallets(connection, walletNow),
    );
    expect(data.wallets[0]?.transactions).toHaveLength(5);
    expect(data.wallets[0]?.analysis.behavior).toBe('TRANSFER_ACTIVE');
    expect(data.wallets[0]?.analysis.relationships[0]?.count).toBe(5);
    expect(data.wallets[0]?.transactions[0]?.provenance.sourceTimestamp).toBe(
      walletNow.toISOString(),
    );
    expect(data.wallets[0]?.analysis.reputation.score).toBeNull();
  });
  it('deduplicates replay and preserves earliest observed time and coverage gaps', async () => {
    await persistWalletHistory(
      connection,
      walletAddress,
      [walletTx(5)],
      true,
      walletNow,
    );
    await persistWalletHistory(
      connection,
      walletAddress,
      [walletTx(5), walletTx()],
      false,
      walletNow,
    );
    const [w] = (await queryWallets(connection, walletNow)).wallets;
    expect(w?.transactions).toHaveLength(2);
    expect(w?.firstObservedAt).toBe(walletTx(5).timestamp);
    expect(w?.coverage).toBe('TRUNCATED');
  });
  it('rejects untracked, future and over-sized batches atomically', async () => {
    await expect(
      persistWalletHistory(
        connection,
        'So11111111111111111111111111111111111111112',
        [walletTx()],
        false,
        walletNow,
      ),
    ).rejects.toThrow('WALLET_NOT_TRACKED');
    await expect(
      persistWalletHistory(
        connection,
        walletAddress,
        [walletTx()],
        false,
        new Date('2025-01-01'),
      ),
    ).rejects.toThrow('INVALID_WALLET_BATCH');
    await expect(
      persistWalletHistory(
        connection,
        walletAddress,
        Array.from({ length: 101 }, (_, i) => walletTx(i)),
        false,
        walletNow,
      ),
    ).rejects.toThrow('INVALID_WALLET_BATCH');
    expect(
      (await queryWallets(connection, walletNow)).wallets[0]?.transactions,
    ).toHaveLength(0);
  });
  it('rejects mismatched wallet-source provenance before persisting any observation', async () => {
    await expect(
      persistWalletHistory(
        connection,
        walletAddress,
        [
          {
            ...walletTx(),
            provenance: {
              ...walletTx().provenance,
              source:
                '/v0/addresses/So11111111111111111111111111111111111111112/transactions',
            },
          },
        ],
        false,
        walletNow,
      ),
    ).rejects.toThrow('INVALID_WALLET_BATCH');
    expect(
      (await queryWallets(connection, walletNow)).wallets[0]?.transactions,
    ).toHaveLength(0);
  });
  it('compacts excess observed history atomically and does not recount replay below the watermark', async () => {
    const seeded = Array.from({ length: 501 }, (_, i) => walletTx(i));
    await connection.db.insert(walletTransactions).values(
      seeded.map((t) => ({
        walletAddress,
        signature: t.signature,
        timestamp: new Date(t.timestamp),
        observation: t,
      })),
    );
    await persistWalletHistory(connection, walletAddress, [], false, walletNow);
    const [count] =
      await connection.client`SELECT count(*)::int AS count FROM wallet_transactions`;
    expect(count?.count).toBe(500);
    let w = (await queryWallets(connection, walletNow)).wallets[0];
    expect(w?.compactedCount).toBe(1);
    expect(w?.transactions).toHaveLength(100);
    expect(w?.analysis.sampleSize).toBe(500);
    await persistWalletHistory(
      connection,
      walletAddress,
      [walletTx(500)],
      false,
      walletNow,
    );
    w = (await queryWallets(connection, walletNow)).wallets[0];
    expect(w?.compactedCount).toBe(1);
  });
  it('compacts expired rows while preserving observed counts, not fabricated balances', async () => {
    const old = walletTx(0, new Date(walletNow.getTime() - 91 * 86400000));
    await persistWalletHistory(
      connection,
      walletAddress,
      [old],
      false,
      walletNow,
    );
    const w = (await queryWallets(connection, walletNow)).wallets[0];
    expect(w?.transactions).toHaveLength(0);
    expect(w?.compactedCount).toBe(1);
    expect(w?.analysis.sampleSize).toBe(0);
  });
  it('deactivation preserves bounded evidence and operator labels update without resetting history', async () => {
    await persistWalletHistory(
      connection,
      walletAddress,
      [walletTx()],
      false,
      walletNow,
    );
    await configureWallets(connection, []);
    expect((await queryWallets(connection, walletNow)).state).toBe(
      'NOT_CONFIGURED',
    );
    await configureWallets(connection, [
      {
        address: walletAddress,
        label: 'Updated annotation',
        labelSource: 'Operator note',
      },
    ]);
    const w = (await queryWallets(connection, walletNow)).wallets[0];
    expect(w?.transactions).toHaveLength(1);
    expect(w?.label).toBe('Updated annotation');
  });
  it('reports stale/down provider states without replacing retained observations', async () => {
    await persistWalletHistory(
      connection,
      walletAddress,
      [walletTx()],
      false,
      walletNow,
    );
    const old = new Date(walletNow.getTime() - 3600000);
    await connection.client`INSERT INTO provider_health(provider_id,status,last_success_at,last_attempt_at) VALUES('helius','HEALTHY',${old.toISOString()},${old.toISOString()})`;
    expect((await queryWallets(connection, walletNow)).provider.status).toBe(
      'STALE',
    );
    await connection.client`UPDATE provider_health SET status='DOWN',error_code='TIMEOUT' WHERE provider_id='helius'`;
    const data = await queryWallets(connection, walletNow);
    expect(data.provider.status).toBe('DOWN');
    expect(data.wallets[0]?.transactions).toHaveLength(1);
    const future = new Date(walletNow.getTime() + 3600000).toISOString();
    await connection.client`UPDATE provider_health SET status='HEALTHY',last_success_at=${future} WHERE provider_id='helius'`;
    expect((await queryWallets(connection, walletNow)).provider.status).toBe(
      'STALE',
    );
  });
});
