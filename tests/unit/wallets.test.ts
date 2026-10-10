import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  configuredWallets,
  analyzeWallet,
  walletTransactionSchema,
  reputationWeights,
  walletRelationshipGroups,
} from '../../packages/domain/src/wallets';
import {
  HeliusProvider,
  collectWalletHistory,
} from '../../packages/providers/src/helius';
import {
  walletTx,
  walletNow,
  walletAddress,
  counterparty,
  rawWalletTx,
} from '../fixtures/wallets';
describe('bounded wallet evidence', () => {
  it('does not classify unknown liquidity-looking provider types as a supported behavior', () => {
    const history = Array.from({ length: 6 }, (_, i) => ({
      ...walletTx(i),
      type: 'UNKNOWN_LIQUIDITY_EVENT',
    }));
    expect(analyzeWallet(walletAddress, history, walletNow).behavior).toBe(
      'UNCLASSIFIED',
    );
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(walletNow);
  });
  afterEach(() => vi.useRealTimers());
  it('handles empty pages, timeouts, oversized response headers and unknown transfer parties', async () => {
    expect(
      await new HeliusProvider({
        apiKey: 'fixture',
        fetchFn: async () => Response.json([]),
      }).history(walletAddress),
    ).toEqual([]);
    await expect(
      new HeliusProvider({
        apiKey: 'fixture',
        fetchFn: async () => {
          throw new DOMException('fixture', 'TimeoutError');
        },
      }).history(walletAddress),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(
      new HeliusProvider({
        apiKey: 'fixture',
        fetchFn: async () =>
          new Response('[]', {
            headers: { 'content-length': String(2097153) },
          }),
      }).history(walletAddress),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    const raw = {
      ...rawWalletTx(),
      nativeTransfers: [],
      tokenTransfers: [
        {
          mint: counterparty,
          fromUserAccount: null,
          toUserAccount: walletAddress,
          tokenAmount: 1.25,
        },
      ],
    };
    const [tx] = await new HeliusProvider({
      apiKey: 'fixture',
      fetchFn: async () => Response.json([raw]),
    }).history(walletAddress);
    expect(tx?.transfers[0]).toMatchObject({
      from: null,
      to: walletAddress,
      amount: 1.25,
      unit: 'TOKEN_UNITS',
    });
  });
  it('groups supported shared counterparties without claiming common ownership', () => {
    const analysis = analyzeWallet(
      walletAddress,
      Array.from({ length: 5 }, (_, i) => walletTx(i)),
      walletNow,
    );
    expect(
      walletRelationshipGroups([{ address: walletAddress, analysis }]),
    ).toEqual([]);
    const other = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const secondAnalysis = analyzeWallet(
      other,
      Array.from({ length: 5 }, (_, i) => ({
        ...walletTx(i),
        transfers: [
          { ...walletTx(i).transfers[0]!, from: counterparty, to: other },
        ],
      })),
      walletNow,
    );
    const groups = walletRelationshipGroups([
      { address: walletAddress, analysis },
      { address: other, analysis: secondAnalysis },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.members).toHaveLength(2);
    expect(groups[0]?.reason).toContain('common ownership is unproven');
  });
  it('retains the successful first page when later retrieval fails and bounds pagination to two pages', async () => {
    let calls = 0;
    const history = Array.from({ length: 50 }, (_, i) => walletTx(i));
    const result = await collectWalletHistory(
      {
        history: async () => {
          if (++calls === 2) throw new Error('Second page unavailable');
          return history;
        },
      },
      walletAddress,
    );
    expect(result.transactions).toHaveLength(50);
    expect(result.truncated).toBe(true);
    expect(result.error).toBeInstanceOf(Error);
    calls = 0;
    const full = await collectWalletHistory(
      {
        history: async () => {
          calls++;
          return history;
        },
      },
      walletAddress,
    );
    expect(calls).toBe(2);
    expect(full.truncated).toBe(true);
    expect(full.transactions).toHaveLength(50);
  });
  it('defaults to no wallets; validates bounded unique explicit configuration', () => {
    expect(configuredWallets()).toEqual([]);
    expect(
      configuredWallets(JSON.stringify([{ address: walletAddress }]))[0]?.label,
    ).toBe('Unlabeled');
    expect(() =>
      configuredWallets(JSON.stringify([{ address: 'bad' }])),
    ).toThrow();
    expect(() =>
      configuredWallets(
        JSON.stringify(Array(9).fill({ address: walletAddress })),
      ),
    ).toThrow();
    expect(() =>
      configuredWallets(
        JSON.stringify(Array(2).fill({ address: walletAddress })),
      ),
    ).toThrow();
  });
  it('normalizes finalized activity with collection and block timestamps, no credential in provenance', async () => {
    let requested = '';
    const provider = new HeliusProvider({
      apiKey: 'fixture-secret',
      fetchFn: async (input) => {
        requested = String(input);
        return Response.json([rawWalletTx()]);
      },
    });
    const [tx] = await provider.history(walletAddress);
    expect(requested).toContain('commitment=finalized');
    expect(requested).toContain('token-accounts=balanceChanged');
    expect(tx?.transfers[0]).toEqual(walletTx().transfers[0]);
    expect(tx?.provenance.sourceTimestamp).toBe(walletNow.toISOString());
    expect(JSON.stringify(tx)).not.toContain('fixture-secret');
  });
  it('rejects invalid address/cursor before sending credentials', async () => {
    let called = false;
    const p = new HeliusProvider({
      apiKey: 'fixture',
      fetchFn: async () => {
        called = true;
        throw new Error();
      },
    });
    await expect(p.history('//attacker')).rejects.toThrow();
    await expect(p.history(walletAddress, '?api-key=leak')).rejects.toThrow();
    expect(called).toBe(false);
  });
  it('sanitizes network and HTTP failures without leaking credential URLs', async () => {
    const p = new HeliusProvider({
      apiKey: 'fixture-secret',
      fetchFn: async () => {
        throw new Error('https://api.helius.xyz?api-key=fixture-secret');
      },
    });
    await expect(p.history(walletAddress)).rejects.toThrow('UNAVAILABLE');
    const p2 = new HeliusProvider({
      apiKey: 'fixture',
      fetchFn: async () => new Response('', { status: 401 }),
    });
    await expect(p2.history(walletAddress)).rejects.toThrow('HTTP_ERROR');
  });
  it('honors rate limits and bounds transfer counts and page size', async () => {
    const p = new HeliusProvider({
      apiKey: 'fixture',
      fetchFn: async () =>
        new Response('', { status: 429, headers: { 'retry-after': '300' } }),
    });
    await expect(p.history(walletAddress)).rejects.toMatchObject({
      code: 'RATE_LIMIT',
      retryAfterMs: 300000,
    });
    for (const body of [
      Array(51).fill(rawWalletTx()),
      [{ ...rawWalletTx(), transactionError: undefined }],
      [
        {
          ...rawWalletTx(),
          nativeTransfers: Array(129).fill(rawWalletTx().nativeTransfers[0]),
        },
      ],
      [
        {
          ...rawWalletTx(),
          nativeTransfers: [
            {
              ...rawWalletTx().nativeTransfers[0],
              amount: Number.MAX_SAFE_INTEGER + 1,
            },
          ],
        },
      ],
    ]) {
      await expect(
        new HeliusProvider({
          apiKey: 'fixture',
          fetchFn: async () => Response.json(body),
        }).history(walletAddress),
      ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    }
  });
  it('rejects malformed/future/duplicate observations', async () => {
    expect(() =>
      walletTransactionSchema.parse({
        ...walletTx(),
        timestamp: '2030-01-01T00:00:00Z',
      }),
    ).toThrow();
    await expect(
      new HeliusProvider({
        apiKey: 'fixture',
        fetchFn: async () => Response.json([rawWalletTx(), rawWalletTx()]),
      }).history(walletAddress),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });
  it('requires minimum sample and excludes failed, future and expired records from behavior', () => {
    const late = Array.from({ length: 5 }, (_, i) => ({
      ...walletTx(i),
      provenance: {
        ...walletTx(i).provenance,
        ingestedAt: new Date(walletNow.getTime() + 1000).toISOString(),
      },
    }));
    expect(analyzeWallet(walletAddress, late, walletNow).sampleSize).toBe(0);
    expect(analyzeWallet(walletAddress, [walletTx()], walletNow).behavior).toBe(
      'UNCLASSIFIED',
    );
    const history = Array.from({ length: 5 }, (_, i) => walletTx(i));
    expect(analyzeWallet(walletAddress, history, walletNow).behavior).toBe(
      'TRANSFER_ACTIVE',
    );
    expect(
      analyzeWallet(
        walletAddress,
        history.map((t) => ({ ...t, failed: true })),
        walletNow,
      ).sampleSize,
    ).toBe(0);
    expect(
      analyzeWallet(walletAddress, history, new Date('2027-01-01')).sampleSize,
    ).toBe(0);
    expect(
      analyzeWallet(walletAddress, history, new Date('2025-01-01')).sampleSize,
    ).toBe(0);
  });
  it('deduplicates signatures and positive direct-transfer evidence', () => {
    const tx = walletTx();
    const duplicate = { ...tx, transfers: [...tx.transfers, ...tx.transfers] };
    expect(
      analyzeWallet(walletAddress, Array(5).fill(duplicate), walletNow)
        .relationships,
    ).toEqual([]);
    const history = Array.from({ length: 5 }, (_, i) => walletTx(i));
    const result = analyzeWallet(walletAddress, history, walletNow);
    expect(result.relationships[0]).toMatchObject({
      counterparty,
      count: 5,
      kind: 'frequent_counterparty',
    });
    expect(result.relationships[0]?.signatures).toHaveLength(3);
    expect(
      analyzeWallet(
        walletAddress,
        history.map((t) => ({
          ...t,
          transfers: t.transfers.map((x) => ({ ...x, amount: 0 })),
        })),
        walletNow,
      ).relationships,
    ).toEqual([]);
  });
  it('classifies dominant liquidity activity but never manufactures reputation', () => {
    const history = Array.from({ length: 6 }, (_, i) => ({
      ...walletTx(i),
      type: 'ADD_LIQUIDITY',
    }));
    const result = analyzeWallet(walletAddress, history, walletNow);
    expect(result.behavior).toBe('LIQUIDITY_PROVIDER');
    expect(result.provenance).toMatchObject({
      quality: 'DERIVED',
      methodologyVersion: 'wallet-evidence:v1',
      sourceTimestamp: walletNow.toISOString(),
    });
    expect(result.inputEndAt).toBe(walletNow.toISOString());
    expect(result.reputation.score).toBeNull();
    expect(result.reputation.coverage).toBe(0);
    expect(reputationWeights.reduce((sum, c) => sum + c[1], 0)).toBeCloseTo(1);
    expect(result.reputation.components.every((c) => c.value === null)).toBe(
      true,
    );
  });
});
