import { z } from 'zod';
import { provenanceSchema } from './index';
import { validSolanaAddress } from './token-risk';

export const walletAddressSchema = z
  .string()
  .refine(validSolanaAddress, 'Invalid Solana address');
export const walletConfigSchema = z.object({
  address: walletAddressSchema,
  label: z.string().trim().max(80).default('Unlabeled'),
  labelSource: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .default('Operator configuration; not independently verified'),
});
export type WalletConfig = z.infer<typeof walletConfigSchema>;
export function configuredWallets(value?: string): WalletConfig[] {
  const wallets = z
    .array(walletConfigSchema)
    .max(8)
    .parse(value ? JSON.parse(value) : []);
  if (new Set(wallets.map((w) => w.address)).size !== wallets.length)
    throw new Error('DUPLICATE_TRACKED_WALLET');
  return wallets;
}
export const walletTransferSchema = z.object({
  from: walletAddressSchema.nullable(),
  to: walletAddressSchema.nullable(),
  asset: walletAddressSchema.or(z.literal('SOL')),
  amount: z.number().finite().nonnegative(),
  unit: z.enum(['LAMPORTS', 'TOKEN_UNITS']),
});
export const walletTransactionSchema = z
  .object({
    signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/),
    timestamp: z.iso.datetime(),
    slot: z.number().int().nonnegative().safe(),
    type: z.string().min(1).max(80),
    source: z.string().min(1).max(80),
    failed: z.boolean(),
    transfers: z.array(walletTransferSchema).max(128),
    provenance: provenanceSchema,
  })
  .superRefine((t, context) => {
    if (
      t.provenance.sourceTimestamp !== t.timestamp ||
      t.provenance.quality !== 'AGGREGATED' ||
      t.provenance.providerId !== 'helius' ||
      Date.parse(t.timestamp) > Date.parse(t.provenance.ingestedAt)
    )
      context.addIssue({
        code: 'custom',
        message: 'Incoherent transaction provenance',
      });
  });
export type WalletTransaction = z.infer<typeof walletTransactionSchema>;
export const reputationWeights = [
  [
    'Realized performance',
    0.25,
    'Cost basis and realized outcomes unavailable',
  ],
  [
    'Early-entry quality',
    0.2,
    'Token launch timing and complete entries unavailable',
  ],
  ['Consistency', 0.15, 'Calibrated performance history unavailable'],
  ['Capital efficiency', 0.15, 'Invested capital and valuation unavailable'],
  ['Rug avoidance', 0.1, 'Audited adverse outcomes and holdings unavailable'],
  ['Holding discipline', 0.1, 'Complete position lifecycle unavailable'],
  [
    'Cluster confidence',
    0.05,
    'Transfer relationships do not establish common ownership',
  ],
] as const;
export function analyzeWallet(
  address: string,
  history: WalletTransaction[],
  now: Date,
) {
  walletAddressSchema.parse(address);
  const eligible = history.filter(
    (t) =>
      !t.failed &&
      Date.parse(t.provenance.ingestedAt) <= now.getTime() &&
      Date.parse(t.timestamp) <= now.getTime() &&
      Date.parse(t.timestamp) >= now.getTime() - 30 * 86400000,
  );
  const unique = [
    ...new Map(eligible.map((t) => [t.signature, t])).values(),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const liquidityTypes = new Set([
    'ADD_LIQUIDITY',
    'REMOVE_LIQUIDITY',
    'ADD_BALANCE_LIQUIDITY',
    'ADD_IMBALANCE_LIQUIDITY',
    'ADD_LIQUIDITY_ONE_SIDE',
  ]);
  const liquidity = unique.filter((t) => liquidityTypes.has(t.type)).length;
  const swaps = unique.filter((t) => t.type === 'SWAP').length;
  const transfers = unique.filter((t) => t.type === 'TRANSFER').length;
  const behavior =
    unique.length < 5
      ? 'UNCLASSIFIED'
      : liquidity >= 3 && liquidity / unique.length >= 0.5
        ? 'LIQUIDITY_PROVIDER'
        : swaps >= 3 && swaps / unique.length >= 0.5
          ? 'SWAP_ACTIVE'
          : transfers >= 3 && transfers / unique.length >= 0.5
            ? 'TRANSFER_ACTIVE'
            : 'UNCLASSIFIED';
  const counterparties = new Map<string, Set<string>>();
  for (const tx of unique)
    for (const transfer of tx.transfers) {
      if (transfer.amount === 0 || transfer.from === transfer.to) continue;
      const other =
        transfer.from === address
          ? transfer.to
          : transfer.to === address
            ? transfer.from
            : null;
      if (!other || other === address) continue;
      const evidence = counterparties.get(other) ?? new Set<string>();
      evidence.add(tx.signature);
      counterparties.set(other, evidence);
    }
  const relationships = [...counterparties]
    .filter(([, s]) => s.size >= 3)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([counterparty, s]) => ({
      counterparty,
      kind: 'frequent_counterparty' as const,
      count: s.size,
      signatures: [...s].slice(-3),
      reason:
        'At least three distinct successful transactions with positive direct transfers in the retained 30-day sample. No ownership inference.',
    }));
  return {
    methodologyVersion: 'wallet-evidence:v1',
    provenance: {
      providerId: 'derived',
      source: 'wallet_transactions retained sample; computation as-of time',
      sourceTimestamp: now.toISOString(),
      ingestedAt: now.toISOString(),
      quality: 'DERIVED' as const,
      methodologyVersion: 'wallet-evidence:v1',
    },
    inputEndAt: unique.at(-1)?.timestamp ?? null,
    calculatedAt: now.toISOString(),
    sampleSize: unique.length,
    firstObservedAt: unique[0]?.timestamp ?? null,
    behavior,
    behaviorReason:
      'Descriptive inference from successful retained activity in 30 days; minimum five transactions, dominant class ≥50% and at least three. Not a lifetime style or profitability claim.',
    swaps,
    transfers,
    liquidity,
    relationships,
    reputation: {
      version: 'wallet-reputation:v1',
      state: 'UNCALIBRATED' as const,
      score: null,
      coverage: 0,
      components: reputationWeights.map(([name, weight, reason]) => ({
        name,
        weight,
        value: null,
        reason,
      })),
      confidence: 'Insufficient evidence; backtesting and calibration required',
    },
  };
}
export type WalletAnalysis = ReturnType<typeof analyzeWallet>;
export function walletRelationshipGroups(
  wallets: {
    address: string;
    analysis: Pick<WalletAnalysis, 'relationships'>;
  }[],
) {
  const groups = new Map<string, Set<string>>();
  for (const wallet of wallets)
    for (const relationship of wallet.analysis.relationships) {
      const members =
        groups.get(relationship.counterparty) ?? new Set<string>();
      members.add(wallet.address);
      groups.set(relationship.counterparty, members);
    }
  return [...groups]
    .filter(([, members]) => members.size >= 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 20)
    .map(([counterparty, members]) => ({
      id: `counterparty:${counterparty}`,
      counterparty,
      members: [...members].sort(),
      methodologyVersion: 'wallet-relationships:v1',
      reason:
        'Tracked addresses share an observed frequent counterparty. This may be a router or service; common ownership is unproven.',
    }));
}
export type WalletResponse = {
  state: 'READY' | 'NOT_CONFIGURED' | 'UNAVAILABLE';
  observedAt: string;
  provider: {
    status: string;
    lastSuccessAt: string | null;
    errorCode: string | null;
  };
  wallets: (WalletConfig & {
    firstObservedAt: string | null;
    lastPolledAt: string | null;
    lastAttemptAt: string | null;
    coverage: 'BOUNDED' | 'TRUNCATED' | 'UNAVAILABLE';
    transactions: WalletTransaction[];
    analysis: WalletAnalysis;
    compactedCount: number;
  })[];
};
const analysisSchema = z.object({
  methodologyVersion: z.literal('wallet-evidence:v1'),
  provenance: provenanceSchema.safeExtend({
    quality: z.literal('DERIVED'),
    methodologyVersion: z.literal('wallet-evidence:v1'),
  }),
  inputEndAt: z.iso.datetime().nullable(),
  calculatedAt: z.iso.datetime(),
  sampleSize: z.number().int().min(0).max(500),
  firstObservedAt: z.iso.datetime().nullable(),
  behavior: z.enum([
    'UNCLASSIFIED',
    'LIQUIDITY_PROVIDER',
    'SWAP_ACTIVE',
    'TRANSFER_ACTIVE',
  ]),
  behaviorReason: z.string(),
  swaps: z.number().int().nonnegative(),
  transfers: z.number().int().nonnegative(),
  liquidity: z.number().int().nonnegative(),
  relationships: z
    .array(
      z.object({
        counterparty: walletAddressSchema,
        kind: z.literal('frequent_counterparty'),
        count: z.number().int().min(3),
        signatures: z.array(walletTransactionSchema.shape.signature).max(3),
        reason: z.string(),
      }),
    )
    .max(20),
  reputation: z.object({
    version: z.literal('wallet-reputation:v1'),
    state: z.literal('UNCALIBRATED'),
    score: z.null(),
    coverage: z.literal(0),
    components: z
      .array(
        z.object({
          name: z.string(),
          weight: z.number().min(0).max(1),
          value: z.null(),
          reason: z.string(),
        }),
      )
      .length(7),
    confidence: z.string(),
  }),
});
export const walletResponseSchema = z.object({
  state: z.enum(['READY', 'NOT_CONFIGURED', 'UNAVAILABLE']),
  observedAt: z.iso.datetime(),
  provider: z.object({
    status: z.string(),
    lastSuccessAt: z.iso.datetime().nullable(),
    errorCode: z.string().nullable(),
  }),
  wallets: z
    .array(
      walletConfigSchema.extend({
        firstObservedAt: z.iso.datetime().nullable(),
        lastPolledAt: z.iso.datetime().nullable(),
        lastAttemptAt: z.iso.datetime().nullable().default(null),
        coverage: z.enum(['BOUNDED', 'TRUNCATED', 'UNAVAILABLE']),
        transactions: z.array(walletTransactionSchema).max(100),
        analysis: analysisSchema,
        compactedCount: z.number().int().nonnegative(),
      }),
    )
    .max(8),
});
