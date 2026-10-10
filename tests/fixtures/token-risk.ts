// Synthetic observations confined to tests; addresses identify public token mints.
import {
  capabilityNames,
  defaultTokens,
  tokenId,
  type DexPair,
  type TokenSecurity,
} from '../../packages/domain/src/token-risk';
export const tokenNow = new Date('2026-01-01T12:00:00Z');
export const tokenRef = defaultTokens[0]!;
export const tokenProvenance = (at = tokenNow) => ({
  providerId: 'test-fixture',
  source: 'synthetic-tests-only',
  sourceTimestamp: at.toISOString(),
  ingestedAt: at.toISOString(),
  quality: 'AGGREGATED' as const,
  methodologyVersion: 'test-fixture:v1',
});
export function fixturePair(liquidityUsd = 1000, at = tokenNow): DexPair {
  return {
    id: 'dex:solana:fixture-pool',
    tokenId: tokenId(tokenRef),
    chain: 'solana',
    address: 'fixture-pool',
    dex: 'fixture',
    symbol: 'FIXTURE',
    name: 'Synthetic test token',
    quoteSymbol: 'USDC',
    priceUsd: 10,
    liquidityUsd,
    volume24hUsd: 500,
    marketCapUsd: 100000,
    fdvUsd: 200000,
    priceChange24h: -2,
    createdAt: null,
    provenance: tokenProvenance(at),
  };
}
export function fixtureSecurity(flag: boolean | null = false): TokenSecurity {
  return {
    tokenId: tokenId(tokenRef),
    capabilities: Object.fromEntries(
      capabilityNames.map((name) => [name, flag]),
    ) as TokenSecurity['capabilities'],
    top10HolderShare: 0.6,
    holderCount: 100,
    trustedToken: null,
    provenance: tokenProvenance(),
  };
}
