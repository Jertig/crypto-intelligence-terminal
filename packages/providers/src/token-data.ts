import { z } from 'zod';
import { boundedJson, ProviderError } from './index';
import {
  dexPairSchema,
  securitySchema,
  tokenId,
  tokenReferenceSchema,
  type TokenReference,
  type DexPair,
  type TokenSecurity,
  type Chain,
} from '@terminal/domain/token-risk';
import type { Provenance } from '@terminal/domain';

type Options = {
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
  apiKey?: string;
};
const numeric = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i)
      .transform(Number),
  ])
  .refine(Number.isFinite);
const nonnegative = numeric.refine((value) => value >= 0);
const nullableNumber = (value: unknown) =>
  value == null ? null : nonnegative.parse(value);
function pollProvenance(
  providerId: string,
  path: string,
  now: Date,
): Provenance {
  return {
    providerId,
    source: path,
    sourceTimestamp: now.toISOString(),
    ingestedAt: now.toISOString(),
    quality: 'AGGREGATED',
    methodologyVersion: 'provider-poll:v1',
  };
}
export async function tokenRequest(
  origin: 'https://api.dexscreener.com' | 'https://api.gopluslabs.io',
  path: string,
  options: Options = {},
  params?: URLSearchParams,
) {
  if (
    !['https://api.dexscreener.com', 'https://api.gopluslabs.io'].includes(
      origin,
    ) ||
    !/^\/[a-zA-Z0-9_][a-zA-Z0-9_/,-]*$/.test(path)
  )
    throw new Error('INVALID_PROVIDER_ENDPOINT');
  const url = new URL(path, origin);
  if (params) url.search = params.toString();
  try {
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000);
    const response = await (options.fetchFn ?? fetch)(url, {
      signal,
      redirect: 'error',
      headers:
        origin === 'https://api.gopluslabs.io' && options.apiKey
          ? { Authorization: `Bearer ${options.apiKey}` }
          : {},
    });
    if (response.status === 429 || response.status === 418) {
      const header = response.headers.get('retry-after');
      const seconds = header ? Number(header) : NaN;
      const wait = Number.isFinite(seconds)
        ? seconds * 1000
        : header
          ? Date.parse(header) - Date.now()
          : 60000;
      throw new ProviderError(
        'RATE_LIMIT',
        Math.max(0, Math.min(600000, Number.isFinite(wait) ? wait : 60000)),
      );
    }
    if (!response.ok) throw new ProviderError('HTTP_ERROR');
    return await boundedJson(response, 2 * 1024 * 1024);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (
      error instanceof Error &&
      ['AbortError', 'TimeoutError'].includes(error.name)
    )
      throw new ProviderError('TIMEOUT');
    throw new ProviderError('UNAVAILABLE');
  }
}
const pairShape = z.object({
  chainId: z.string(),
  pairAddress: z.string().min(1).max(64),
  dexId: z.string().min(1).max(80),
  baseToken: z.object({
    address: z.string(),
    name: z.string().max(120),
    symbol: z.string().min(1).max(40),
  }),
  quoteToken: z.object({ symbol: z.string().min(1).max(40) }),
  priceUsd: nonnegative.nullish(),
  liquidity: z.object({ usd: nonnegative.nullish() }).nullish(),
  volume: z.object({ h24: nonnegative.nullish() }).nullish(),
  marketCap: nonnegative.nullish(),
  fdv: nonnegative.nullish(),
  priceChange: z.object({ h24: numeric.nullish() }).nullish(),
  pairCreatedAt: z.number().int().positive().nullish(),
});
export interface DexProvider {
  getPairs(tokens: TokenReference[]): Promise<DexPair[]>;
}
export class DexScreenerProvider implements DexProvider {
  constructor(private readonly options: Options = {}) {}
  async getPairs(tokens: TokenReference[]) {
    if (
      !tokens.length ||
      tokens.length > 8 ||
      new Set(tokens.map(tokenId)).size !== tokens.length
    )
      throw new Error('TOKEN_BATCH_LIMIT');
    const result: DexPair[] = [];
    for (const chain of [
      ...new Set(tokens.map((t) => tokenReferenceSchema.parse(t).chain)),
    ]) {
      const selected = tokens.filter((t) => t.chain === chain);
      const path = `/tokens/v1/${chain}/${selected.map((t) => t.address).join(',')}`;
      const data = await tokenRequest(
        'https://api.dexscreener.com',
        path,
        this.options,
      );
      const now = new Date();
      if (!Array.isArray(data) || data.length > 500)
        throw new ProviderError('MALFORMED_RESPONSE');
      if (!data.length) throw new ProviderError('EMPTY_RESPONSE');
      const normalized: DexPair[] = [];
      for (const item of data) {
        if (!item || typeof item !== 'object')
          throw new ProviderError('MALFORMED_RESPONSE');
        const candidate = item as {
          chainId?: unknown;
          baseToken?: { address?: unknown };
        };
        const reference = selected.find(
          (t) =>
            candidate.chainId === chain &&
            typeof candidate.baseToken?.address === 'string' &&
            (chain === 'solana'
              ? t.address === candidate.baseToken.address
              : t.address.toLowerCase() ===
                candidate.baseToken.address.toLowerCase()),
        );
        if (!reference) continue; // Price belongs to base token, never silently invert it.
        try {
          const pair = pairShape.parse(item);
          normalized.push(
            dexPairSchema.parse({
              id: `dex:${chain}:${chain === 'solana' ? pair.pairAddress : pair.pairAddress.toLowerCase()}`,
              tokenId: tokenId(reference),
              chain,
              address: pair.pairAddress,
              dex: pair.dexId,
              symbol: pair.baseToken.symbol,
              name: pair.baseToken.name,
              quoteSymbol: pair.quoteToken.symbol,
              priceUsd:
                pair.priceUsd && pair.priceUsd > 0 ? pair.priceUsd : null,
              liquidityUsd: pair.liquidity?.usd ?? null,
              volume24hUsd: pair.volume?.h24 ?? null,
              marketCapUsd: pair.marketCap ?? null,
              fdvUsd: pair.fdv ?? null,
              priceChange24h: pair.priceChange?.h24 ?? null,
              createdAt:
                pair.pairCreatedAt && pair.pairCreatedAt <= now.getTime()
                  ? new Date(pair.pairCreatedAt).toISOString()
                  : null,
              provenance: pollProvenance('dexscreener', path, now),
            }),
          );
        } catch {
          throw new ProviderError('MALFORMED_RESPONSE');
        }
      }
      for (const token of selected)
        result.push(
          ...normalized
            .filter((p) => p.tokenId === tokenId(token))
            .sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1))
            .slice(0, 3),
        );
    }
    if (!result.length) throw new ProviderError('EMPTY_RESPONSE');
    return result;
  }
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function flag(value: unknown): boolean | null {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return null;
}
export function normalizeSecurity(
  data: unknown,
  reference: TokenReference,
  now: Date,
  path: string,
): TokenSecurity {
  const fields = object(data);
  if (!Object.keys(fields).length) throw new ProviderError('EMPTY_RESPONSE');
  const solana = reference.chain === 'solana';
  const capability = (solanaName: string, evmName: string) =>
    flag(solana ? object(fields[solanaName]).status : fields[evmName]);
  let share: number | null = null;
  const holders = fields.holders;
  const parsedCount = nonnegative.safeParse(fields.holder_count);
  const count =
    parsedCount.success && Number.isSafeInteger(parsedCount.data)
      ? parsedCount.data
      : null;
  const supply = nonnegative.safeParse(fields.total_supply);
  if (
    Array.isArray(holders) &&
    holders.length > 0 &&
    holders.length <= 100 &&
    supply.success &&
    supply.data > 0
  ) {
    const shares = holders
      .slice(0, 10)
      .map((item) => nullableNumber(object(item).percent));
    if (shares.every((value) => value !== null && value <= 1)) {
      const sum = shares.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      if (
        sum <= 1 + 1e-6 &&
        (shares.length === 10 ||
          (count !== null && count > 0 && count <= shares.length))
      )
        share = Math.min(1, sum);
    }
  }
  return securitySchema.parse({
    tokenId: tokenId(reference),
    capabilities: {
      mintable: capability('mintable', 'is_mintable'),
      freezable: solana ? capability('freezable', '') : null,
      balance_mutable: capability(
        'balance_mutable_authority',
        'owner_change_balance',
      ),
      closable: capability('closable', 'selfdestruct'),
      fee_upgradable: capability(
        'transfer_fee_upgradable',
        'slippage_modifiable',
      ),
      hook_upgradable: solana
        ? capability('transfer_hook_upgradable', '')
        : null,
      non_transferable: solana ? flag(fields.non_transferable) : null,
      default_state_upgradable: solana
        ? capability('default_account_state_upgradable', '')
        : null,
    },
    top10HolderShare: share,
    holderCount: count,
    trustedToken: flag(fields.trusted_token),
    provenance: pollProvenance('goplus', path, now),
  });
}
export interface SecurityProvider {
  getSecurity(token: TokenReference): Promise<TokenSecurity>;
}
export class GoPlusProvider implements SecurityProvider {
  constructor(private readonly options: Options = {}) {}
  async getSecurity(input: TokenReference) {
    const token = tokenReferenceSchema.parse(input);
    const chainIds: Record<Exclude<Chain, 'solana'>, string> = {
      ethereum: '1',
      base: '8453',
      bsc: '56',
    };
    const path =
      token.chain === 'solana'
        ? '/api/v1/solana/token_security'
        : `/api/v1/token_security/${chainIds[token.chain]}`;
    const data = object(
      await tokenRequest(
        'https://api.gopluslabs.io',
        path,
        this.options,
        new URLSearchParams({ contract_addresses: token.address }),
      ),
    );
    if (Number(data.code) !== 1) throw new ProviderError('HTTP_ERROR');
    const result = object(data.result);
    const key = Object.keys(result).find((key) =>
      token.chain === 'solana'
        ? key === token.address
        : key.toLowerCase() === token.address.toLowerCase(),
    );
    if (!key) throw new ProviderError('EMPTY_RESPONSE');
    try {
      return normalizeSecurity(result[key], token, new Date(), path);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('MALFORMED_RESPONSE');
    }
  }
}
