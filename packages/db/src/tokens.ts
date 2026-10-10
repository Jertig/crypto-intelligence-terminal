import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DatabaseConnection } from './index';
import {
  trackedTokens,
  dexPairs,
  dexSnapshots,
  tokenSecuritySnapshots,
  riskSnapshots,
  providerHealth,
} from './schema';
import {
  tokenId,
  tokenReferenceSchema,
  dexPairSchema,
  securitySchema,
  riskSnapshotSchema,
  riskVersion,
  calculateTokenRisk,
  type TokenReference,
  type DexPair,
  type TokenSecurity,
  type RiskSnapshot,
  type TokenResponse,
} from '@terminal/domain/token-risk';
import { bucket } from '@terminal/domain/intelligence';
import type { Provenance } from '@terminal/domain';
import { queryIntelligence } from './intelligence';
const writeProvenance = (p: Provenance) => ({
  providerId: p.providerId,
  source: p.source,
  sourceTimestamp: new Date(p.sourceTimestamp),
  ingestedAt: new Date(p.ingestedAt),
  quality: p.quality,
  methodologyVersion: p.methodologyVersion ?? null,
});
const readProvenance = (p: {
  providerId: string;
  source: string;
  sourceTimestamp: Date;
  ingestedAt: Date;
  quality: Provenance['quality'];
  methodologyVersion: string | null;
}): Provenance => ({
  providerId: p.providerId,
  source: p.source,
  sourceTimestamp: p.sourceTimestamp.toISOString(),
  ingestedAt: p.ingestedAt.toISOString(),
  quality: p.quality,
  ...(p.methodologyVersion ? { methodologyVersion: p.methodologyVersion } : {}),
});
const number = (value: string | null) =>
  value === null ? null : Number(value);
export async function markTokenProviderPartial(
  connection: DatabaseConnection,
  provider: string,
) {
  await connection.db
    .update(providerHealth)
    .set({ status: 'DEGRADED', errorCode: 'PARTIAL_COVERAGE' })
    .where(eq(providerHealth.providerId, provider));
}
export async function configureTokenUniverse(
  connection: DatabaseConnection,
  input: TokenReference[],
) {
  const tokens = input.map((t) => tokenReferenceSchema.parse(t));
  if (
    !tokens.length ||
    tokens.length > 8 ||
    new Set(tokens.map(tokenId)).size !== tokens.length
  )
    throw new Error('TOKEN_UNIVERSE_LIMIT');
  await connection.db.transaction(async (tx) => {
    await tx.update(trackedTokens).set({ active: false });
    for (const token of tokens)
      await tx
        .insert(trackedTokens)
        .values({
          id: tokenId(token),
          ...token,
          symbol: token.address.slice(0, 8),
          name: 'Metadata unavailable',
          active: true,
        })
        .onConflictDoUpdate({
          target: trackedTokens.id,
          set: { active: true },
        });
  });
}
export async function persistDexPairs(
  connection: DatabaseConnection,
  input: DexPair[],
) {
  const pairs = input.map((p) => dexPairSchema.parse(p));
  if (
    pairs.length > 24 ||
    new Set(pairs.map((p) => p.id)).size !== pairs.length
  )
    throw new Error('DEX_BATCH_LIMIT');
  await connection.db.transaction(async (tx) => {
    if (pairs.length)
      await tx
        .update(dexPairs)
        .set({ active: false })
        .where(
          inArray(dexPairs.tokenId, [...new Set(pairs.map((p) => p.tokenId))]),
        );
    for (const pair of pairs) {
      await tx
        .update(trackedTokens)
        .set({ symbol: pair.symbol, name: pair.name })
        .where(eq(trackedTokens.id, pair.tokenId));
      const saved = await tx
        .insert(dexPairs)
        .values({
          id: pair.id,
          tokenId: pair.tokenId,
          address: pair.address,
          dex: pair.dex,
          quoteSymbol: pair.quoteSymbol,
          createdAt: pair.createdAt ? new Date(pair.createdAt) : null,
          active: true,
        })
        .onConflictDoUpdate({
          target: dexPairs.id,
          set: { dex: pair.dex, quoteSymbol: pair.quoteSymbol, active: true },
          setWhere: sql`${dexPairs.tokenId} = excluded.token_id`,
        })
        .returning({ id: dexPairs.id });
      if (!saved.length) throw new Error('DEX_PAIR_IDENTITY_CONFLICT');
      const row = {
        pairId: pair.id,
        bucketAt: new Date(
          bucket(new Date(pair.provenance.sourceTimestamp), 15),
        ),
        priceUsd: pair.priceUsd === null ? null : String(pair.priceUsd),
        liquidityUsd:
          pair.liquidityUsd === null ? null : String(pair.liquidityUsd),
        volume24hUsd:
          pair.volume24hUsd === null ? null : String(pair.volume24hUsd),
        marketCapUsd:
          pair.marketCapUsd === null ? null : String(pair.marketCapUsd),
        fdvUsd: pair.fdvUsd === null ? null : String(pair.fdvUsd),
        priceChange24h:
          pair.priceChange24h === null ? null : String(pair.priceChange24h),
        ...writeProvenance(pair.provenance),
      };
      await tx
        .insert(dexSnapshots)
        .values(row)
        .onConflictDoUpdate({
          target: [dexSnapshots.pairId, dexSnapshots.bucketAt],
          set: row,
          setWhere: sql`excluded.source_timestamp >= ${dexSnapshots.sourceTimestamp}`,
        });
    }
  });
  return pairs.length;
}
export async function persistTokenSecurity(
  connection: DatabaseConnection,
  input: TokenSecurity,
) {
  const value = securitySchema.parse(input),
    flags = value.capabilities;
  const row = {
    tokenId: value.tokenId,
    bucketAt: new Date(bucket(new Date(value.provenance.sourceTimestamp), 60)),
    mintable: flags.mintable,
    freezable: flags.freezable,
    balanceMutable: flags.balance_mutable,
    closable: flags.closable,
    feeUpgradable: flags.fee_upgradable,
    hookUpgradable: flags.hook_upgradable,
    nonTransferable: flags.non_transferable,
    defaultStateUpgradable: flags.default_state_upgradable,
    top10HolderShare:
      value.top10HolderShare === null ? null : String(value.top10HolderShare),
    holderCount: value.holderCount === null ? null : String(value.holderCount),
    trustedToken: value.trustedToken,
    ...writeProvenance(value.provenance),
  };
  await connection.db
    .insert(tokenSecuritySnapshots)
    .values(row)
    .onConflictDoUpdate({
      target: [tokenSecuritySnapshots.tokenId, tokenSecuritySnapshots.bucketAt],
      set: row,
      setWhere: sql`excluded.source_timestamp >= ${tokenSecuritySnapshots.sourceTimestamp}`,
    });
}
export async function persistTokenRisk(
  connection: DatabaseConnection,
  input: RiskSnapshot[],
) {
  if (
    input.length > 8 ||
    new Set(input.map((s) => s.tokenId)).size !== input.length
  )
    throw new Error('RISK_BATCH_LIMIT');
  const values = input.map((s) => riskSnapshotSchema.parse(s));
  await connection.db.transaction(async (tx) => {
    for (const value of values) {
      const contract = value.categories.find((c) => c.name === 'CONTRACT')!,
        ownership = value.categories.find((c) => c.name === 'OWNERSHIP')!,
        liquidity = value.categories.find((c) => c.name === 'LIQUIDITY')!,
        structure = value.categories.find(
          (c) => c.name === 'MARKET_STRUCTURE',
        )!;
      const stringify = (v: number | null) => (v === null ? null : String(v));
      const row = {
        tokenId: value.tokenId,
        pairId: value.pairId,
        bucketAt: new Date(value.bucketAt),
        calculatedAt: new Date(value.calculatedAt),
        contractScore: stringify(contract.score),
        contractCoverage: String(contract.coverage),
        ownershipScore: stringify(ownership.score),
        ownershipCoverage: String(ownership.coverage),
        liquidityScore: stringify(liquidity.score),
        liquidityCoverage: String(liquidity.coverage),
        structureScore: stringify(structure.score),
        structureCoverage: String(structure.coverage),
        categories: value.categories,
        liquidityChange1h: stringify(value.liquidityChange1h),
        volumeLiquidityRatio: stringify(value.volumeLiquidityRatio),
        vacuum: value.vacuum,
        vacuumReason: value.vacuumReason,
        ...writeProvenance(value.provenance),
      };
      await tx
        .insert(riskSnapshots)
        .values(row)
        .onConflictDoUpdate({
          target: [
            riskSnapshots.tokenId,
            riskSnapshots.bucketAt,
            riskSnapshots.methodologyVersion,
          ],
          set: row,
          setWhere: sql`excluded.calculated_at >= ${riskSnapshots.calculatedAt}`,
        });
    }
  });
}
export async function queryTokens(
  connection: DatabaseConnection,
  now = new Date(),
): Promise<TokenResponse> {
  const tokens = await connection.db
    .select({
      id: trackedTokens.id,
      chain: trackedTokens.chain,
      address: trackedTokens.address,
      symbol: trackedTokens.symbol,
      name: trackedTokens.name,
    })
    .from(trackedTokens)
    .where(eq(trackedTokens.active, true))
    .limit(8);
  const ids = tokens.map((t) => t.id);
  if (!ids.length)
    return {
      state: 'EMPTY',
      observedAt: now.toISOString(),
      tokens: [],
      pairs: [],
      security: [],
      risks: [],
    };
  const cutoff = new Date(now.getTime() - 86400000).toISOString();
  const observations = await connection.db
    .selectDistinctOn([dexPairs.id])
    .from(dexSnapshots)
    .innerJoin(dexPairs, eq(dexSnapshots.pairId, dexPairs.id))
    .innerJoin(trackedTokens, eq(dexPairs.tokenId, trackedTokens.id))
    .where(
      and(
        inArray(dexPairs.tokenId, ids),
        eq(dexPairs.active, true),
        sql`${dexSnapshots.sourceTimestamp} >= ${cutoff}::timestamptz AND ${dexSnapshots.sourceTimestamp} <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(dexPairs.id, desc(dexSnapshots.sourceTimestamp))
    .limit(48);
  const pairs: DexPair[] = tokens.flatMap((token) =>
    observations
      .filter((r) => r.dex_pairs.tokenId === token.id)
      .sort(
        (a, b) =>
          Number(b.dex_snapshots.liquidityUsd ?? -1) -
          Number(a.dex_snapshots.liquidityUsd ?? -1),
      )
      .slice(0, 3)
      .map((row) =>
        dexPairSchema.parse({
          id: row.dex_pairs.id,
          tokenId: token.id,
          chain: token.chain,
          address: row.dex_pairs.address,
          dex: row.dex_pairs.dex,
          symbol: token.symbol,
          name: token.name,
          quoteSymbol: row.dex_pairs.quoteSymbol,
          createdAt: row.dex_pairs.createdAt?.toISOString() ?? null,
          priceUsd: number(row.dex_snapshots.priceUsd),
          liquidityUsd: number(row.dex_snapshots.liquidityUsd),
          volume24hUsd: number(row.dex_snapshots.volume24hUsd),
          marketCapUsd: number(row.dex_snapshots.marketCapUsd),
          fdvUsd: number(row.dex_snapshots.fdvUsd),
          priceChange24h: number(row.dex_snapshots.priceChange24h),
          provenance: readProvenance(row.dex_snapshots),
        }),
      ),
  );
  const securityRows = await connection.db
    .selectDistinctOn([tokenSecuritySnapshots.tokenId])
    .from(tokenSecuritySnapshots)
    .where(
      and(
        inArray(tokenSecuritySnapshots.tokenId, ids),
        sql`${tokenSecuritySnapshots.sourceTimestamp} >= ${cutoff}::timestamptz AND ${tokenSecuritySnapshots.sourceTimestamp} <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(
      tokenSecuritySnapshots.tokenId,
      desc(tokenSecuritySnapshots.sourceTimestamp),
    )
    .limit(8);
  const security = securityRows.map((row) =>
    securitySchema.parse({
      tokenId: row.tokenId,
      capabilities: {
        mintable: row.mintable,
        freezable: row.freezable,
        balance_mutable: row.balanceMutable,
        closable: row.closable,
        fee_upgradable: row.feeUpgradable,
        hook_upgradable: row.hookUpgradable,
        non_transferable: row.nonTransferable,
        default_state_upgradable: row.defaultStateUpgradable,
      },
      top10HolderShare: number(row.top10HolderShare),
      holderCount: number(row.holderCount),
      trustedToken: row.trustedToken,
      provenance: readProvenance(row),
    }),
  );
  const riskRows = await connection.db
    .selectDistinctOn([riskSnapshots.tokenId])
    .from(riskSnapshots)
    .where(
      and(
        inArray(riskSnapshots.tokenId, ids),
        eq(riskSnapshots.methodologyVersion, riskVersion),
        sql`${riskSnapshots.calculatedAt} >= ${cutoff}::timestamptz AND ${riskSnapshots.calculatedAt} <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(riskSnapshots.tokenId, desc(riskSnapshots.calculatedAt))
    .limit(8);
  const risks = riskRows.map((row) =>
    riskSnapshotSchema.parse({
      ...row,
      bucketAt: row.bucketAt.toISOString(),
      calculatedAt: row.calculatedAt.toISOString(),
      liquidityChange1h: number(row.liquidityChange1h),
      volumeLiquidityRatio: number(row.volumeLiquidityRatio),
      provenance: readProvenance(row),
    }),
  );
  return {
    state: pairs.length || security.length ? 'READY' : 'EMPTY',
    observedAt: now.toISOString(),
    tokens: tokens.map((t) => ({
      ...t,
      chain: tokenReferenceSchema.parse(t).chain,
    })),
    pairs,
    security,
    risks,
  };
}
export async function computeTokenRisk(
  connection: DatabaseConnection,
  references: TokenReference[],
  now = new Date(),
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const current = await queryTokens(connection, now);
  const features = (await queryIntelligence(connection, now)).features;
  const results: RiskSnapshot[] = [];
  for (const reference of references) {
    signal?.throwIfAborted();
    const id = tokenId(reference),
      pairs = current.pairs.filter((p) => p.tokenId === id);
    const history: DexPair[] = [];
    for (const pair of pairs) {
      const rows = await connection.db
        .select()
        .from(dexSnapshots)
        .where(
          and(
            eq(dexSnapshots.pairId, pair.id),
            sql`${dexSnapshots.sourceTimestamp} <= ${new Date(Date.parse(pair.provenance.sourceTimestamp) - 3600000).toISOString()}::timestamptz AND ${dexSnapshots.sourceTimestamp} >= ${new Date(Date.parse(pair.provenance.sourceTimestamp) - 4500000).toISOString()}::timestamptz`,
          ),
        )
        .orderBy(desc(dexSnapshots.sourceTimestamp))
        .limit(1);
      for (const row of rows)
        history.push({
          ...pair,
          priceUsd: number(row.priceUsd),
          liquidityUsd: number(row.liquidityUsd),
          volume24hUsd: number(row.volume24hUsd),
          marketCapUsd: number(row.marketCapUsd),
          fdvUsd: number(row.fdvUsd),
          priceChange24h: number(row.priceChange24h),
          provenance: readProvenance(row),
        });
    }
    results.push(
      calculateTokenRisk(
        reference,
        pairs,
        history,
        current.security.find((s) => s.tokenId === id) ?? null,
        features,
        now,
      ),
    );
  }
  signal?.throwIfAborted();
  await persistTokenRisk(connection, results);
  return results.length;
}
export async function retainTokenHistory(
  connection: DatabaseConnection,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - 180 * 86400000).toISOString();
  let count = 0;
  for (const table of [dexSnapshots, tokenSecuritySnapshots, riskSnapshots]) {
    const removed = await connection.db.execute(
      sql`DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE ${table.bucketAt}<${cutoff}::timestamptz LIMIT 5000) RETURNING 1`,
    );
    count += removed.length;
  }
  return count;
}
