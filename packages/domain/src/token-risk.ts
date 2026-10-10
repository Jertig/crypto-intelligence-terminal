import { z } from 'zod';
import { provenanceSchema, type Provenance } from './index';
import { type Feature, bucket } from './intelligence';
import { freshness } from './market';

export const chainSchema = z.enum(['solana', 'ethereum', 'base', 'bsc']);
export type Chain = z.infer<typeof chainSchema>;
export function validSolanaAddress(value: string) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  let decoded = 0n;
  for (const letter of value)
    decoded = decoded * 58n + BigInt(alphabet.indexOf(letter));
  let bytes = 0;
  while (decoded > 0n) {
    decoded >>= 8n;
    bytes++;
  }
  return bytes + (value.match(/^1*/)?.[0].length ?? 0) === 32;
}
export const tokenReferenceSchema = z
  .object({ chain: chainSchema, address: z.string().max(64) })
  .superRefine((value, context) => {
    const valid =
      value.chain === 'solana'
        ? validSolanaAddress(value.address)
        : /^0x[0-9a-fA-F]{40}$/.test(value.address);
    if (!valid)
      context.addIssue({
        code: 'custom',
        message: 'Invalid chain-specific token address',
      });
  });
export type TokenReference = z.infer<typeof tokenReferenceSchema>;
export const tokenId = (token: TokenReference) =>
  `token:${token.chain}:${token.chain === 'solana' ? token.address : token.address.toLowerCase()}`;
export const defaultTokens: TokenReference[] = [
  { chain: 'solana', address: 'So11111111111111111111111111111111111111112' },
  { chain: 'solana', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
];
export function configuredTokens(value?: string): TokenReference[] {
  const tokens = value
    ? value.split(',').map((item) => {
        const [chain, address, extra] = item.split(':');
        if (extra) throw new Error('INVALID_TOKEN_CONFIGURATION');
        return tokenReferenceSchema.parse({ chain, address });
      })
    : defaultTokens;
  if (
    !tokens.length ||
    tokens.length > 8 ||
    new Set(tokens.map(tokenId)).size !== tokens.length
  )
    throw new Error('INVALID_TOKEN_CONFIGURATION');
  return tokens;
}
export const dexPairSchema = z.object({
  id: z.string().min(1).max(140),
  tokenId: z.string().min(1).max(140),
  chain: chainSchema,
  address: z.string().min(1).max(64),
  dex: z.string().min(1).max(80),
  symbol: z.string().min(1).max(40),
  name: z.string().max(120),
  quoteSymbol: z.string().min(1).max(40),
  priceUsd: z.number().finite().positive().nullable(),
  liquidityUsd: z.number().finite().nonnegative().nullable(),
  volume24hUsd: z.number().finite().nonnegative().nullable(),
  marketCapUsd: z.number().finite().nonnegative().nullable(),
  fdvUsd: z.number().finite().nonnegative().nullable(),
  priceChange24h: z.number().finite().nullable(),
  createdAt: z.iso.datetime().nullable(),
  provenance: provenanceSchema,
});
export type DexPair = z.infer<typeof dexPairSchema>;
export const capabilityNames = [
  'mintable',
  'freezable',
  'balance_mutable',
  'closable',
  'fee_upgradable',
  'hook_upgradable',
  'non_transferable',
  'default_state_upgradable',
] as const;
export const securitySchema = z.object({
  tokenId: z.string().min(1).max(140),
  capabilities: z.object(
    Object.fromEntries(
      capabilityNames.map((name) => [name, z.boolean().nullable()]),
    ) as Record<(typeof capabilityNames)[number], z.ZodNullable<z.ZodBoolean>>,
  ),
  top10HolderShare: z.number().min(0).max(1).nullable(),
  holderCount: z.number().int().nonnegative().nullable(),
  trustedToken: z.boolean().nullable(),
  provenance: provenanceSchema,
});
export type TokenSecurity = z.infer<typeof securitySchema>;
const componentSchema = z
  .object({
    name: z.string().min(1).max(80),
    weight: z.number().min(0).max(1),
    value: z.number().finite().nullable(),
    unit: z.enum(['BOOLEAN', 'SHARE', 'PERCENT', 'RATIO', 'ZSCORE']),
    score: z.number().min(0).max(100).nullable(),
    state: z.enum([
      'AVAILABLE',
      'MISSING_INPUT',
      'STALE_INPUT',
      'INSUFFICIENT_HISTORY',
    ]),
    reason: z.string().max(260),
    inputs: z.array(provenanceSchema).max(4),
  })
  .refine(
    (value) =>
      value.state === 'AVAILABLE'
        ? value.value !== null && value.score !== null
        : value.value === null && value.score === null,
    'Availability must agree with observed values',
  );
export type RiskComponent = z.infer<typeof componentSchema>;
const categorySchema = z
  .object({
    name: z.enum(['CONTRACT', 'OWNERSHIP', 'LIQUIDITY', 'MARKET_STRUCTURE']),
    score: z.number().min(0).max(100).nullable(),
    partialScore: z.number().min(0).max(100).nullable(),
    coverage: z.number().min(0).max(1),
    components: z.array(componentSchema).min(1).max(8),
  })
  .superRefine((value, context) => {
    const coverage = value.components.reduce(
      (sum, component) =>
        sum + (component.score === null ? 0 : component.weight),
      0,
    );
    const contribution = value.components.reduce(
      (sum, c) => sum + (c.score ?? 0) * c.weight,
      0,
    );
    const expectedScore =
      coverage >= 1 - 1e-9 ? Math.min(100, contribution) : null;
    const expectedPartial =
      coverage > 0 ? Math.min(100, contribution / coverage) : null;
    const coherent = (actual: number | null, expected: number | null) =>
      actual === null || expected === null
        ? actual === expected
        : Math.abs(actual - expected) < 1e-6;
    if (
      !coherent(value.score, expectedScore) ||
      !coherent(value.partialScore, expectedPartial) ||
      Math.abs(coverage - value.coverage) > 1e-6 ||
      (value.score !== null && coverage < 1 - 1e-9) ||
      Math.abs(value.components.reduce((sum, c) => sum + c.weight, 0) - 1) >
        1e-9
    )
      context.addIssue({
        code: 'custom',
        message:
          'Risk category requires coherent component weights and coverage',
      });
  });
export const riskVersion = 'token-risk:v1';
export const vacuumVersion = 'liquidity-vacuum:v1';
export const riskSnapshotSchema = z.object({
  tokenId: z.string().min(1),
  pairId: z.string().min(1).nullable(),
  bucketAt: z.iso.datetime(),
  calculatedAt: z.iso.datetime(),
  categories: z
    .array(categorySchema)
    .length(4)
    .refine(
      (categories) => new Set(categories.map((c) => c.name)).size === 4,
      'All four separate categories required',
    ),
  liquidityChange1h: z.number().finite().nullable(),
  volumeLiquidityRatio: z.number().finite().nonnegative().nullable(),
  vacuum: z.enum([
    'UNAVAILABLE',
    'HEALTHY',
    'THINNING',
    'VACUUM_FORMING',
    'CRITICAL',
  ]),
  vacuumReason: z.string().max(260),
  provenance: provenanceSchema,
});
export type RiskSnapshot = z.infer<typeof riskSnapshotSchema>;
export const tokenResponseSchema = z.object({
  state: z.enum(['READY', 'EMPTY', 'NOT_CONFIGURED', 'UNAVAILABLE']),
  observedAt: z.iso.datetime(),
  tokens: z
    .array(
      z.object({
        id: z.string(),
        chain: chainSchema,
        address: z.string(),
        symbol: z.string().max(40),
        name: z.string().max(120),
      }),
    )
    .max(8),
  pairs: z.array(dexPairSchema).max(24),
  security: z.array(securitySchema).max(8),
  risks: z.array(riskSnapshotSchema).max(8),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;
const clamp = (value: number) => Math.max(0, Math.min(100, value));
export function calculateTokenRisk(
  token: TokenReference,
  pairs: DexPair[],
  history: DexPair[],
  security: TokenSecurity | null,
  features: Feature[],
  now: Date,
): RiskSnapshot {
  const id = tokenId(token);
  const pair = pairs
    .filter((p) => p.tokenId === id)
    .sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1))[0];
  const pairFresh =
    !!pair &&
    freshness(pair.provenance.sourceTimestamp, now, 1800000) === 'FRESH';
  const securityFresh =
    !!security &&
    security.tokenId === id &&
    freshness(security.provenance.sourceTimestamp, now, 7200000) === 'FRESH';
  const prior =
    pair &&
    history
      .filter(
        (p) =>
          p.id === pair.id &&
          Date.parse(p.provenance.sourceTimestamp) <=
            Date.parse(pair.provenance.sourceTimestamp) - 3600000 &&
          Date.parse(p.provenance.sourceTimestamp) >=
            Date.parse(pair.provenance.sourceTimestamp) - 4500000,
      )
      .sort(
        (a, b) =>
          Date.parse(b.provenance.sourceTimestamp) -
          Date.parse(a.provenance.sourceTimestamp),
      )[0];
  const change =
    pairFresh &&
    pair.liquidityUsd !== null &&
    prior?.liquidityUsd &&
    prior.liquidityUsd > 0
      ? 100 * (pair.liquidityUsd / prior.liquidityUsd - 1)
      : null;
  const ratio =
    pairFresh && pair.liquidityUsd && pair.volume24hUsd !== null
      ? pair.volume24hUsd / pair.liquidityUsd
      : null;
  function component(
    name: string,
    weight: number,
    value: number | null,
    unit: RiskComponent['unit'],
    transform: (value: number) => number,
    inputs: Provenance[],
    reason: string,
    state: RiskComponent['state'] = 'MISSING_INPUT',
  ): RiskComponent {
    return {
      name,
      weight,
      value,
      unit,
      score: value === null ? null : clamp(transform(value)),
      state: value === null ? state : 'AVAILABLE',
      reason,
      inputs,
    };
  }
  function category(
    name: RiskSnapshot['categories'][number]['name'],
    components: RiskComponent[],
  ) {
    const coverage = Math.min(
      1,
      components.reduce((sum, c) => sum + (c.score === null ? 0 : c.weight), 0),
    );
    const contribution = components.reduce(
      (sum, c) => sum + (c.score ?? 0) * c.weight,
      0,
    );
    return {
      name,
      components,
      coverage,
      score: coverage >= 1 - 1e-9 ? clamp(contribution) : null,
      partialScore: coverage ? clamp(contribution / coverage) : null,
    };
  }
  const contract = category(
    'CONTRACT',
    capabilityNames.map((name, index) =>
      component(
        name,
        [0.2, 0.2, 0.2, 0.1, 0.1, 0.1, 0.05, 0.05][index]!,
        securityFresh && security.capabilities[name] !== null
          ? Number(security.capabilities[name])
          : null,
        'BOOLEAN',
        (value) => value * 100,
        security ? [security.provenance] : [],
        'Provider-reported capability; descriptive, not an allegation or proof of exploitation',
        security && !securityFresh ? 'STALE_INPUT' : 'MISSING_INPUT',
      ),
    ),
  );
  const ownership = category('OWNERSHIP', [
    component(
      'Reported top-10 holder concentration',
      0.4,
      securityFresh ? security.top10HolderShare : null,
      'SHARE',
      (value) => value * 100,
      security ? [security.provenance] : [],
      'Provider-reported supply fraction; custodians/pools are not identified as owners',
    ),
    ...[
      'Creator concentration',
      'Connected-wallet concentration',
      'Fresh-wallet concentration',
    ].map((name) =>
      component(
        name,
        0.2,
        null,
        'SHARE',
        clamp,
        [],
        'Ownership relationships are not observed',
      ),
    ),
  ]);
  const liquidity = category('LIQUIDITY', [
    component(
      'Same-pool liquidity change 1h',
      0.4,
      change,
      'PERCENT',
      (value) => -value * 2,
      pair && prior ? [pair.provenance, prior.provenance] : [],
      'Observed same-pool polling history; USD liquidity is not executable depth',
      pairFresh ? 'INSUFFICIENT_HISTORY' : 'STALE_INPUT',
    ),
    component(
      '24h volume / current liquidity',
      0.25,
      ratio,
      'RATIO',
      (value) => value * 10,
      pair ? [pair.provenance] : [],
      'Turnover pressure proxy; rolling volume divided by current stock',
    ),
    component(
      'Liquidity / reported market cap',
      0.2,
      pairFresh &&
        pair.liquidityUsd !== null &&
        pair.marketCapUsd &&
        pair.marketCapUsd > 0 &&
        (pair.fdvUsd === null || pair.marketCapUsd <= pair.fdvUsd)
        ? pair.liquidityUsd / pair.marketCapUsd
        : null,
      'RATIO',
      (value) => 100 - (value / 0.05) * 100,
      pair ? [pair.provenance] : [],
      pair &&
        pair.marketCapUsd !== null &&
        pair.fdvUsd !== null &&
        pair.marketCapUsd > pair.fdvUsd
        ? 'Reported market cap exceeds FDV; supply/scope discrepancy is not reconciled. Ratio unavailable.'
        : 'FDV never substitutes for missing market cap; reported scope remains unverified',
    ),
    component(
      'Selected-pool LP concentration',
      0.15,
      null,
      'SHARE',
      clamp,
      [],
      'GoPlus largest-pool holders cannot be attributed reliably to the selected DEX pool',
    ),
  ]);
  const cexId =
    id === tokenId(defaultTokens[0]!) ? 'binance:spot:SOLUSDT' : null;
  const feature = (name: Feature['name']) =>
    features.find(
      (f) =>
        f.marketId === cexId &&
        f.name === name &&
        f.state === 'AVAILABLE' &&
        freshness(f.calculatedAt, now, 900000) === 'FRESH',
    );
  const oi = feature('oi_change_24h'),
    funding = feature('funding_zscore'),
    returns = feature('return_24h'),
    volume = feature('volume_acceleration');
  const structure = category('MARKET_STRUCTURE', [
    component(
      'CEX OI 24h expansion',
      0.3,
      oi?.value ?? null,
      'PERCENT',
      (value) => value * 2,
      oi ? [oi.provenance] : [],
      'Explicit wrapped SOL to SOL mapping only; no symbol-based mapping',
    ),
    component(
      'CEX funding extreme',
      0.2,
      funding?.value ?? null,
      'ZSCORE',
      (value) => (Math.abs(value) / 3) * 100,
      funding ? [funding.provenance] : [],
      'Indicative-rate positioning, uncalibrated',
    ),
    component(
      'CEX price / OI divergence',
      0.3,
      returns?.value != null && oi?.value != null
        ? returns.value < 0 && oi.value > 0
          ? oi.value
          : 0
        : null,
      'PERCENT',
      (value) => value * 2,
      returns && oi ? [returns.provenance, oi.provenance] : [],
      'Falling 24h price with rising OI; no exchange-flow inference',
    ),
    component(
      'CEX base-volume collapse',
      0.2,
      volume?.value ?? null,
      'RATIO',
      (value) => (1 - value) * 100,
      volume ? [volume.provenance] : [],
      'Turnover contraction proxy; exchange inflow unavailable',
    ),
  ]);
  const vacuum =
    change === null || ratio === null
      ? 'UNAVAILABLE'
      : change <= -30 && ratio >= 5
        ? 'CRITICAL'
        : change <= -10 && ratio >= 3
          ? 'VACUUM_FORMING'
          : change <= -5 || ratio >= 2
            ? 'THINNING'
            : 'HEALTHY';
  return riskSnapshotSchema.parse({
    tokenId: id,
    pairId: pair?.id ?? null,
    bucketAt: bucket(now, 15),
    calculatedAt: now.toISOString(),
    categories: [contract, ownership, liquidity, structure],
    liquidityChange1h: change,
    volumeLiquidityRatio: ratio,
    vacuum,
    vacuumReason: `${vacuumVersion}: DEX pool proxy only; USD changes can reflect valuation, not withdrawals. Same-pool 1h history required; CEX depth, spread and wallet distribution absent. Not a safety certification.`,
    provenance: {
      providerId: 'risk-engine',
      source: 'dex+security+explicit-cex-features',
      sourceTimestamp:
        pair?.provenance.sourceTimestamp ??
        security?.provenance.sourceTimestamp ??
        now.toISOString(),
      ingestedAt: now.toISOString(),
      quality: 'DERIVED',
      methodologyVersion: riskVersion,
    },
  });
}
