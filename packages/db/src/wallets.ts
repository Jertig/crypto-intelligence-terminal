import { and, desc, eq, lte, sql } from 'drizzle-orm';
import { type DatabaseConnection } from './index';
import {
  trackedWallets,
  walletTransactions,
  walletHistorySummaries,
  providerHealth,
  walletProviderBudget,
} from './schema';
import {
  walletConfigSchema,
  walletTransactionSchema,
  analyzeWallet,
  type WalletConfig,
  type WalletTransaction,
  type WalletResponse,
} from '@terminal/domain/wallets';
export async function reserveWalletRequest(
  connection: DatabaseConnection,
  now = new Date(),
) {
  const day = now.toISOString().slice(0, 10);
  const row = await connection.db
    .insert(walletProviderBudget)
    .values({ day, requests: 1 })
    .onConflictDoUpdate({
      target: walletProviderBudget.day,
      set: { requests: sql`${walletProviderBudget.requests}+1` },
      setWhere: sql`${walletProviderBudget.requests}<4`,
    })
    .returning();
  await connection.client`DELETE FROM wallet_provider_budget WHERE day<${new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)}`;
  return row.length === 1;
}
export async function configureWallets(
  connection: DatabaseConnection,
  input: WalletConfig[],
) {
  const wallets = input.map((w) => walletConfigSchema.parse(w));
  if (
    wallets.length > 8 ||
    new Set(wallets.map((w) => w.address)).size !== wallets.length
  )
    throw new Error('WALLET_UNIVERSE_LIMIT');
  await connection.db.transaction(async (tx) => {
    await tx.update(trackedWallets).set({ active: false });
    for (const w of wallets)
      await tx
        .insert(trackedWallets)
        .values(w)
        .onConflictDoUpdate({
          target: trackedWallets.address,
          set: { label: w.label, labelSource: w.labelSource, active: true },
        });
  });
}
export async function markWalletAttempt(
  connection: DatabaseConnection,
  address: string,
  now = new Date(),
) {
  await connection.db
    .update(trackedWallets)
    .set({ lastAttemptAt: now })
    .where(
      and(eq(trackedWallets.address, address), eq(trackedWallets.active, true)),
    );
}
export async function persistWalletHistory(
  connection: DatabaseConnection,
  address: string,
  input: WalletTransaction[],
  truncated: boolean,
  now = new Date(),
) {
  const history = input.map((t) => walletTransactionSchema.parse(t));
  if (
    history.length > 100 ||
    new Set(history.map((t) => t.signature)).size !== history.length ||
    history.some(
      (t) =>
        Date.parse(t.timestamp) > now.getTime() ||
        Date.parse(t.provenance.ingestedAt) > now.getTime(),
    )
  )
    throw new Error('INVALID_WALLET_BATCH');
  await connection.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${address}))`);
    const [wallet] = await tx
      .select()
      .from(trackedWallets)
      .where(eq(trackedWallets.address, address))
      .limit(1);
    if (!wallet?.active) throw new Error('WALLET_NOT_TRACKED');
    if (
      history.some(
        (t) =>
          t.provenance.source !== `/v0/addresses/${address}/transactions` ||
          t.provenance.methodologyVersion !== 'helius-enhanced:v1',
      )
    )
      throw new Error('INVALID_WALLET_BATCH');
    const [compacted] = await tx
      .select({
        last: sql<Date | null>`MAX(${walletHistorySummaries.lastObservedAt})`,
      })
      .from(walletHistorySummaries)
      .where(eq(walletHistorySummaries.walletAddress, address));
    const floor = compacted?.last
      ? new Date(compacted.last).getTime()
      : -Infinity;
    for (const t of history) {
      // Exclude replay below the compaction watermark; signature detail is no longer retained there.
      if (Date.parse(t.timestamp) <= floor) continue;
      if (Buffer.byteLength(JSON.stringify(t)) > 65536)
        throw new Error('WALLET_OBSERVATION_LIMIT');
      await tx
        .insert(walletTransactions)
        .values({
          walletAddress: address,
          signature: t.signature,
          timestamp: new Date(t.timestamp),
          observation: t,
        })
        .onConflictDoNothing();
    }
    const earliest = history.map((t) => t.timestamp).sort()[0];
    await tx
      .update(trackedWallets)
      .set({
        lastPolledAt: now,
        coverage: truncated
          ? 'TRUNCATED'
          : wallet.coverage === 'TRUNCATED'
            ? 'TRUNCATED'
            : 'BOUNDED',
        firstObservedAt: earliest
          ? new Date(
              Math.min(
                Date.parse(earliest),
                wallet.firstObservedAt?.getTime() ?? Infinity,
              ),
            )
          : wallet.firstObservedAt,
      })
      .where(eq(trackedWallets.address, address));
    await compactWalletRows(tx, address, now);
  });
  return history.length;
}
type WalletTransactionContext = Parameters<
  Parameters<DatabaseConnection['db']['transaction']>[0]
>[0];
async function compactWalletRows(
  tx: WalletTransactionContext,
  address: string,
  now: Date,
) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${address}))`);
  // Prune and compact atomically. Counts refer only to previously observed rows, never chain-wide totals.
  const excess = await tx.execute<{
    signature: string;
    observation: WalletTransaction;
    timestamp: Date;
  }>(
    sql`SELECT signature, observation, timestamp FROM (SELECT *, row_number() OVER (ORDER BY timestamp DESC, signature) AS rank FROM wallet_transactions WHERE wallet_address=${address}) history WHERE rank>500 OR timestamp<${new Date(now.getTime() - 90 * 86400000).toISOString()}::timestamptz ORDER BY timestamp LIMIT 1000`,
  );
  const summaries = new Map<
    string,
    { count: number; failed: number; first: Date; last: Date }
  >();
  for (const row of excess) {
    const time = new Date(row.timestamp),
      month = time.toISOString().slice(0, 7);
    const s = summaries.get(month) ?? {
      count: 0,
      failed: 0,
      first: time,
      last: time,
    };
    s.count++;
    if (row.observation.failed) s.failed++;
    s.first = new Date(Math.min(s.first.getTime(), time.getTime()));
    s.last = new Date(Math.max(s.last.getTime(), time.getTime()));
    summaries.set(month, s);
    await tx
      .delete(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletAddress, address),
          eq(walletTransactions.signature, row.signature),
        ),
      );
  }
  for (const [month, s] of summaries)
    await tx
      .insert(walletHistorySummaries)
      .values({
        walletAddress: address,
        month,
        transactionCount: s.count,
        failedCount: s.failed,
        firstObservedAt: s.first,
        lastObservedAt: s.last,
      })
      .onConflictDoUpdate({
        target: [
          walletHistorySummaries.walletAddress,
          walletHistorySummaries.month,
        ],
        set: {
          transactionCount: sql`${walletHistorySummaries.transactionCount}+excluded.transaction_count`,
          failedCount: sql`${walletHistorySummaries.failedCount}+excluded.failed_count`,
          firstObservedAt: sql`LEAST(${walletHistorySummaries.firstObservedAt},excluded.first_observed_at)`,
          lastObservedAt: sql`GREATEST(${walletHistorySummaries.lastObservedAt},excluded.last_observed_at)`,
        },
      });

  return excess.length;
}
export async function retainWalletHistory(
  connection: DatabaseConnection,
  now = new Date(),
  signal?: AbortSignal,
) {
  const addresses = await connection.db
    .select({ address: walletTransactions.walletAddress })
    .from(walletTransactions)
    .where(
      sql`${walletTransactions.timestamp}<${new Date(now.getTime() - 90 * 86400000).toISOString()}::timestamptz`,
    )
    .groupBy(walletTransactions.walletAddress)
    .orderBy(sql`MIN(${walletTransactions.timestamp})`)
    .limit(8);
  let deleted = 0;
  for (const wallet of addresses) {
    if (signal?.aborted) break;
    deleted += await connection.db.transaction((tx) =>
      compactWalletRows(tx, wallet.address, now),
    );
  }
  return deleted;
}
export async function queryWallets(
  connection: DatabaseConnection,
  now = new Date(),
): Promise<WalletResponse> {
  const wallets = await connection.db
    .select()
    .from(trackedWallets)
    .where(eq(trackedWallets.active, true))
    .orderBy(trackedWallets.address)
    .limit(8);
  const [health] = await connection.db
    .select()
    .from(providerHealth)
    .where(eq(providerHealth.providerId, 'helius'))
    .limit(1);
  const lastSuccess = health?.lastSuccessAt?.toISOString() ?? null;
  const stale =
    lastSuccess &&
    (now.getTime() - Date.parse(lastSuccess) > 1800000 ||
      Date.parse(lastSuccess) > now.getTime());
  const provider = {
    status:
      stale && health?.status === 'HEALTHY'
        ? 'STALE'
        : (health?.status ?? 'NOT_CONFIGURED'),
    lastSuccessAt: lastSuccess,
    errorCode: health?.errorCode ?? null,
  };
  const rows: WalletResponse['wallets'] = [];
  for (const w of wallets) {
    const history = await connection.db
      .select()
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletAddress, w.address),
          lte(walletTransactions.timestamp, now),
          sql`(${walletTransactions.observation}->'provenance'->>'ingestedAt')::timestamptz<=${now.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(
        desc(walletTransactions.timestamp),
        desc(walletTransactions.signature),
      )
      .limit(100);
    const [counts] = await connection.db
      .select({
        count: sql<number>`COALESCE(SUM(${walletHistorySummaries.transactionCount}),0)::integer`,
      })
      .from(walletHistorySummaries)
      .where(eq(walletHistorySummaries.walletAddress, w.address));
    // Analyze the full retained sample while limiting response transfer details to 100 transactions.
    const sample = await connection.db
      .select({ observation: walletTransactions.observation })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletAddress, w.address),
          lte(walletTransactions.timestamp, now),
          sql`(${walletTransactions.observation}->'provenance'->>'ingestedAt')::timestamptz<=${now.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(desc(walletTransactions.timestamp))
      .limit(500);
    rows.push({
      address: w.address,
      label: w.label,
      labelSource: w.labelSource,
      firstObservedAt: w.firstObservedAt?.toISOString() ?? null,
      lastPolledAt: w.lastPolledAt?.toISOString() ?? null,
      lastAttemptAt: w.lastAttemptAt?.toISOString() ?? null,
      coverage: w.coverage as 'UNAVAILABLE' | 'BOUNDED' | 'TRUNCATED',
      transactions: history.map((t) =>
        walletTransactionSchema.parse(t.observation),
      ),
      analysis: analyzeWallet(
        w.address,
        sample.map((t) => walletTransactionSchema.parse(t.observation)),
        now,
      ),
      compactedCount: counts?.count ?? 0,
    });
  }
  return {
    state: wallets.length ? 'READY' : 'NOT_CONFIGURED',
    observedAt: now.toISOString(),
    provider,
    wallets: rows,
  };
}
