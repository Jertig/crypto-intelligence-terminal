import { z } from 'zod';
import {
  walletAddressSchema,
  walletTransactionSchema,
  type WalletTransaction,
} from '@terminal/domain/wallets';
import { boundedJson, ProviderError } from './index';
const transferAddress = walletAddressSchema
  .nullish()
  .transform((v) => v ?? null);
const shape = z.object({
  signature: z.string(),
  timestamp: z.number().int().positive(),
  slot: z.number().int().nonnegative().safe(),
  type: z.string().min(1).max(80),
  source: z.string().min(1).max(80),
  transactionError: z
    .unknown()
    .refine(
      (value) => value !== undefined,
      'Explicit transaction outcome required',
    ),
  nativeTransfers: z
    .array(
      z.object({
        fromUserAccount: transferAddress,
        toUserAccount: transferAddress,
        amount: z.number().int().nonnegative().safe(),
      }),
    )
    .max(128)
    .default([]),
  tokenTransfers: z
    .array(
      z.object({
        fromUserAccount: transferAddress,
        toUserAccount: transferAddress,
        mint: walletAddressSchema,
        tokenAmount: z.number().finite().nonnegative(),
      }),
    )
    .max(128)
    .default([]),
});
export interface WalletProvider {
  history(address: string, before?: string): Promise<WalletTransaction[]>;
}
export async function collectWalletHistory(
  provider: WalletProvider,
  address: string,
) {
  const first = await provider.history(address);
  if (first.length < 50)
    return {
      transactions: first,
      truncated: false,
      error: undefined as unknown,
    };
  try {
    const second = await provider.history(address, first.at(-1)?.signature);
    return {
      transactions: [
        ...new Map([...first, ...second].map((t) => [t.signature, t])).values(),
      ],
      truncated: second.length === 50,
      error: undefined as unknown,
    };
  } catch (error) {
    return { transactions: first, truncated: true, error };
  }
}
export class HeliusProvider implements WalletProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      fetchFn?: typeof fetch;
      signal?: AbortSignal;
    },
  ) {}
  async history(address: string, before?: string) {
    walletAddressSchema.parse(address);
    if (before && !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(before))
      throw new Error('INVALID_CURSOR');
    const path = `/v0/addresses/${address}/transactions`;
    const url = new URL(path, 'https://api.helius.xyz');
    url.search = new URLSearchParams({
      'api-key': this.options.apiKey,
      limit: '50',
      commitment: 'finalized',
      'token-accounts': 'balanceChanged',
      ...(before ? { 'before-signature': before } : {}),
    }).toString();
    try {
      const response = await (this.options.fetchFn ?? fetch)(url, {
        redirect: 'error',
        signal: this.options.signal
          ? AbortSignal.any([this.options.signal, AbortSignal.timeout(8000)])
          : AbortSignal.timeout(8000),
      });
      if (response.status === 429) {
        const header = response.headers.get('retry-after');
        const seconds = header ? Number(header) : NaN;
        const wait = Number.isFinite(seconds)
          ? seconds * 1000
          : header
            ? Date.parse(header) - Date.now()
            : 60000;
        throw new ProviderError(
          'RATE_LIMIT',
          Math.max(
            60000,
            Math.min(600000, Number.isFinite(wait) ? wait : 60000),
          ),
        );
      }
      if (!response.ok) throw new ProviderError('HTTP_ERROR');
      const raw = z
        .array(shape)
        .max(50)
        .parse(await boundedJson(response, 2 * 1024 * 1024));
      const now = new Date().toISOString();
      const result = raw.map((t) =>
        walletTransactionSchema.parse({
          signature: t.signature,
          timestamp: new Date(t.timestamp * 1000).toISOString(),
          slot: t.slot,
          type: t.type,
          source: t.source,
          failed: t.transactionError != null,
          transfers: [
            ...t.nativeTransfers.map((x) => ({
              from: x.fromUserAccount,
              to: x.toUserAccount,
              asset: 'SOL',
              amount: x.amount,
              unit: 'LAMPORTS',
            })),
            ...t.tokenTransfers.map((x) => ({
              from: x.fromUserAccount,
              to: x.toUserAccount,
              asset: x.mint,
              amount: x.tokenAmount,
              unit: 'TOKEN_UNITS',
            })),
          ],
          provenance: {
            providerId: 'helius',
            source: path,
            sourceTimestamp: new Date(t.timestamp * 1000).toISOString(),
            ingestedAt: now,
            quality: 'AGGREGATED',
            methodologyVersion: 'helius-enhanced:v1',
          },
        }),
      );
      if (new Set(result.map((t) => t.signature)).size !== result.length)
        throw new ProviderError('MALFORMED_RESPONSE');
      return result;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof z.ZodError || error instanceof RangeError)
        throw new ProviderError('MALFORMED_RESPONSE');
      if (
        error instanceof Error &&
        ['TimeoutError', 'AbortError'].includes(error.name)
      )
        throw new ProviderError('TIMEOUT');
      throw new ProviderError('UNAVAILABLE');
    }
  }
}
