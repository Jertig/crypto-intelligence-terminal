import { sql, eq, and, lte, desc } from 'drizzle-orm';
import type { DatabaseConnection } from './index';
import {
  markets,
  marketSnapshots,
  featureSnapshots,
  riskSnapshots,
  trackedTokens,
  providerHealth,
  researchEvents,
  macroObservations,
} from './schema';
import {
  analystRequestSchema,
  analystTools,
  type AnalystRequest,
  type AnalystTool,
  type Evidence,
  type ToolResult,
} from '@terminal/domain/analyst';
import type { Provenance } from '@terminal/domain';
import { featureVersion } from '@terminal/domain/intelligence';
import { providerFreshnessMs } from '@terminal/domain/health';
import { macroObservationSchema } from '@terminal/domain/events';
import {
  defaultTokens,
  tokenId,
  riskVersion,
} from '@terminal/domain/token-risk';

type StoredProvenance = {
  source: string;
  providerId: string;
  sourceTimestamp: Date;
  ingestedAt: Date;
  quality: Provenance['quality'];
  methodologyVersion: string | null;
};
function provenance(r: StoredProvenance): Provenance {
  return {
    source: r.source,
    providerId: r.providerId,
    sourceTimestamp: r.sourceTimestamp.toISOString(),
    ingestedAt: r.ingestedAt.toISOString(),
    quality: r.quality,
    ...(r.methodologyVersion
      ? { methodologyVersion: r.methodologyVersion }
      : {}),
  };
}
const numeric = (n: string | null) => (n === null ? null : Number(n));
export async function readAnalystEvidence(
  connection: DatabaseConnection,
  request: AnalystRequest,
  tool: AnalystTool,
  now = new Date(),
): Promise<ToolResult> {
  analystRequestSchema.parse(request);
  if (!analystTools.includes(tool) || !request.tools.includes(tool))
    throw new Error('TOOL_OUTSIDE_SCOPE');
  const evidence: Evidence[] = [];
  const add = (
    identity: string,
    subject: string,
    label: string,
    value: Evidence['value'],
    unit: string,
    p: Provenance,
    maxAgeMs: number,
    limitation: string,
  ) => {
    evidence.push({
      id: `${tool}:${identity}`,
      tool,
      subject,
      label,
      value,
      unit,
      provenance: p,
      maxAgeMs,
      limitation,
    });
  };
  let limitation = '';
  if (tool === 'market') {
    const rows = await connection.db
      .select({ m: markets, s: marketSnapshots })
      .from(markets)
      .innerJoin(marketSnapshots, eq(markets.id, marketSnapshots.marketId))
      .where(
        and(
          eq(markets.base, request.asset),
          eq(markets.quote, 'USDT'),
          eq(markets.kind, 'SPOT'),
          lte(marketSnapshots.ingestedAt, now),
          lte(marketSnapshots.sourceTimestamp, now),
        ),
      )
      .orderBy(markets.id)
      .limit(4);
    for (const { m, s } of rows)
      for (const [label, value, unit] of [
        ['price', numeric(s.price), 'USDT'],
        ['change_24h', numeric(s.change24h), 'percent'],
        ['quote_volume_24h', numeric(s.quoteVolume24h), 'USDT'],
      ] as const)
        add(
          `${m.id}.${label}`,
          m.base,
          label,
          value,
          unit,
          provenance(s),
          90000,
          'Venue-reported spot snapshot; not total-market valuation or causal evidence.',
        );
  } else if (tool === 'features') {
    const rows = await connection.db
      .select({ f: featureSnapshots })
      .from(featureSnapshots)
      .innerJoin(markets, eq(markets.id, featureSnapshots.marketId))
      .where(
        and(
          eq(markets.base, request.asset),
          eq(markets.kind, 'SPOT'),
          eq(markets.quote, 'USDT'),
          eq(featureSnapshots.methodologyVersion, featureVersion),
          lte(featureSnapshots.calculatedAt, now),
          lte(featureSnapshots.ingestedAt, now),
        ),
      )
      .orderBy(desc(featureSnapshots.calculatedAt))
      .limit(1);
    const f = rows[0]?.f;
    if (f)
      for (const [label, value] of [
        ['return_1h', f.return1h],
        ['return_24h', f.return24h],
        ['relative_strength_btc', f.relativeStrengthBtc],
        ['volume_zscore', f.volumeZscore],
        ['funding_zscore', f.fundingZscore],
        ['oi_change_1h', f.oiChange1h],
      ] as const) {
        const metadata = f.metadata.find((m) => m.name === label);
        if (!metadata) continue;
        const p = metadata.provenance;
        if (
          Date.parse(p.ingestedAt) > now.getTime() ||
          Date.parse(p.sourceTimestamp) > now.getTime() ||
          metadata.inputs.some((i) => Date.parse(i.to) > now.getTime())
        )
          continue;
        add(
          `${request.asset}.${label}`,
          request.asset,
          label,
          metadata.state === 'AVAILABLE' ? numeric(value) : null,
          metadata.unit,
          p,
          1200000,
          `Feature state: ${metadata.state}. Missing input is not zero. See market-features:v1 methodology; causal attribution is unavailable.`,
        );
      }
  } else if (tool === 'risk') {
    const rows =
      request.asset === 'SOL'
        ? await connection.db
            .select({ r: riskSnapshots, t: trackedTokens })
            .from(riskSnapshots)
            .innerJoin(
              trackedTokens,
              eq(trackedTokens.id, riskSnapshots.tokenId),
            )
            .where(
              and(
                eq(trackedTokens.id, tokenId(defaultTokens[0]!)),
                eq(riskSnapshots.methodologyVersion, riskVersion),
                eq(trackedTokens.active, true),
                lte(riskSnapshots.calculatedAt, now),
                lte(riskSnapshots.ingestedAt, now),
                lte(riskSnapshots.sourceTimestamp, now),
              ),
            )
            .orderBy(desc(riskSnapshots.calculatedAt))
            .limit(1)
        : [];
    limitation =
      'Only the canonical Solana wrapped-SOL mint maps to SOL. BTC/ETH token mapping is unavailable; symbols cannot establish identity.';
    for (const { r, t } of rows) {
      for (const category of r.categories) {
        const inputs = category.components.flatMap((c) => c.inputs);
        const p = provenance(r);
        if (inputs.length) {
          p.sourceTimestamp = inputs.reduce(
            (oldest, i) =>
              Date.parse(i.sourceTimestamp) < Date.parse(oldest)
                ? i.sourceTimestamp
                : oldest,
            inputs[0]!.sourceTimestamp,
          );
          p.source = [...new Set(inputs.map((i) => i.source))].join(' + ');
          if (
            inputs.some(
              (i) =>
                Date.parse(i.sourceTimestamp) > now.getTime() ||
                Date.parse(i.ingestedAt) > now.getTime(),
            )
          )
            continue;
        }
        add(
          `${t.symbol}.${category.name.toLowerCase()}`,
          request.asset,
          `${category.name.toLowerCase()}_risk`,
          category.score,
          'score/100',
          p,
          1800000,
          `Coverage ${category.coverage}; partial values are not complete risk. Reported capability/concentration does not establish exploitation, ownership or insider status.`,
        );
      }
      add(
        `${t.symbol}.liquidity_change_1h`,
        request.asset,
        'liquidity_change_1h',
        numeric(r.liquidityChange1h),
        'percent',
        provenance(r),
        1800000,
        'Same-pool DEX USD proxy only; not executable depth, spread, slippage or holder ownership.',
      );
    }
  } else if (tool === 'wallet') {
    limitation =
      'Observed tracked-wallet counts only; no asset-specific flow, USD balance, PnL, reputation, ownership or insider conclusion.';
    if (request.asset === 'SOL') {
      const rows =
        await connection.client`SELECT w.address,w.coverage,count(t.signature)::int AS count,max(t.timestamp) AS latest,max((t.observation->'provenance'->>'ingestedAt')::timestamptz) AS collected FROM tracked_wallets w LEFT JOIN wallet_transactions t ON t.wallet_address=w.address AND t.timestamp<=${now.toISOString()} AND (t.observation->'provenance'->>'ingestedAt')::timestamptz<=${now.toISOString()} WHERE w.active GROUP BY w.address,w.coverage ORDER BY w.address LIMIT 8`;
      for (const r of rows) {
        if (!r.latest || !r.collected) continue;
        add(
          String(r.address),
          String(r.address),
          'retained_transaction_count',
          Number(r.count),
          'observed records',
          {
            source: 'retained-wallet-counts:v1',
            providerId: 'terminal:wallet',
            sourceTimestamp: new Date(String(r.latest)).toISOString(),
            ingestedAt: new Date(String(r.collected)).toISOString(),
            quality: 'DERIVED',
            methodologyVersion: 'retained-wallet-counts:v1',
          },
          1800000,
          `${limitation} Sample coverage: ${String(r.coverage)}; failed transactions may be included.`,
        );
      }
    }
  } else if (tool === 'events') {
    limitation =
      'Sourced release records only; event presence does not establish attribution or causation. No expected/actual value invented.';
    const rows = await connection.db
      .select()
      .from(researchEvents)
      .where(
        and(
          lte(researchEvents.timestamp, now),
          sql`${researchEvents.timestamp}>=${new Date(now.getTime() - 7 * 86400000).toISOString()}::timestamptz`,
          sql`${researchEvents.observation}->'affectedAssets' ? ${request.asset}`,
          sql`(${researchEvents.observation}->>'collectedAt')::timestamptz<=${now.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(desc(researchEvents.timestamp))
      .limit(6);
    for (const e of rows)
      add(
        e.id,
        request.asset,
        'sourced_event',
        e.observation.title,
        'release title',
        {
          source: e.observation.source,
          providerId: 'terminal:manual-events',
          sourceTimestamp: e.timestamp.toISOString(),
          ingestedAt: e.observation.collectedAt,
          quality: 'DIRECT',
        },
        7 * 86400000,
        limitation,
      );
  } else if (tool === 'macro') {
    limitation =
      'Latest observed SP500, DGS10 and DTWEXBGS periods only. Economic period is not release time; no macro causal or exact-DXY inference.';
    for (const seriesId of ['SP500', 'DGS10', 'DTWEXBGS']) {
      const rows = await connection.db
        .select()
        .from(macroObservations)
        .where(
          and(
            eq(macroObservations.seriesId, seriesId),
            lte(macroObservations.collectedAt, now),
          ),
        )
        .orderBy(
          desc(macroObservations.date),
          desc(macroObservations.collectedAt),
        )
        .limit(1);
      for (const r of rows) {
        const o = macroObservationSchema.parse(r.observation);
        add(
          seriesId,
          seriesId,
          `period_${o.date}`,
          o.value,
          seriesId === 'DGS10' ? 'percent' : 'index',
          o.provenance,
          7200000,
          limitation,
        );
      }
    }
  } else {
    const rows = await connection.db
      .select()
      .from(providerHealth)
      .orderBy(providerHealth.providerId)
      .limit(12);
    for (const r of rows)
      add(
        r.providerId.replaceAll(':', '.'),
        r.providerId,
        'provider_status',
        r.status,
        'status',
        {
          source: 'provider-health:v1',
          providerId: 'terminal:health',
          sourceTimestamp: (r.lastSuccessAt ?? r.updatedAt).toISOString(),
          ingestedAt: r.updatedAt.toISOString(),
          quality: 'DERIVED',
          methodologyVersion: 'provider-health:v1',
        },
        providerFreshnessMs(r.providerId),
        `Stored provider status; error ${r.errorCode ?? 'none'}. A fresh heartbeat does not prove source coverage.`,
      );
  }
  return {
    tool,
    state: evidence.length ? 'READY' : 'EMPTY',
    evidence,
    limitation:
      limitation ||
      'No matching retained evidence is available when empty; no substitute estimates.',
  };
}
