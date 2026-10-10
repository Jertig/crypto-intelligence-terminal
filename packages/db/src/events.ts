import { and, eq, lte, desc, sql, inArray } from 'drizzle-orm';
import type { DatabaseConnection } from './index';
import {
  macroObservations,
  researchEvents,
  eventImpacts,
  markets,
  ohlcv,
  fundingRates,
  openInterest,
  providerHealth,
} from './schema';
import {
  macroObservationSchema,
  macroSeries,
  eventSchema,
  eventImpact,
  impactWindows,
  type MacroObservation,
  type ResearchEvent,
  type EventsResponse,
  type MacroResponse,
} from '@terminal/domain/events';
import type { Provenance } from '@terminal/domain';
import { providerFreshnessMs } from '@terminal/domain/health';

export async function retainMacroHistory(
  connection: DatabaseConnection,
  now = new Date(),
  signal?: AbortSignal,
) {
  const cutoff = new Date(now.getTime() - 5 * 366 * 86400000)
    .toISOString()
    .slice(0, 10);
  let deleted = 0;
  for (const s of macroSeries) {
    if (signal?.aborted) break;
    deleted += await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`macro:${s.id}`}))`,
      );
      const rows = await tx.execute(
        sql`WITH ranked AS (SELECT series_id,date,collected_at,row_number() OVER (PARTITION BY date ORDER BY collected_at DESC) AS rank FROM macro_observations WHERE series_id=${s.id}), expired AS (SELECT series_id,date,collected_at FROM ranked WHERE date<${cutoff} OR rank>12 ORDER BY date,collected_at LIMIT 1000) DELETE FROM macro_observations m USING expired e WHERE m.series_id=e.series_id AND m.date=e.date AND m.collected_at=e.collected_at RETURNING m.date`,
      );
      return rows.length;
    });
  }
  return deleted;
}

export async function persistMacro(
  connection: DatabaseConnection,
  input: MacroObservation[],
  now = new Date(),
) {
  if (input.length > 2000) throw new Error('MACRO_BATCH_LIMIT');
  const rows = input.map((r) => macroObservationSchema.parse(r));
  if (
    new Set(rows.map((r) => r.seriesId)).size > 1 ||
    new Set(rows.map((r) => r.date)).size !== rows.length ||
    rows.some((r) => Date.parse(r.provenance.ingestedAt) > now.getTime())
  )
    throw new Error('INVALID_MACRO_BATCH');
  if (!rows.length) return 0;
  return connection.db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`macro:${rows[0]!.seriesId}`}))`,
    );
    const old = await tx.execute(
      sql`SELECT DISTINCT ON (date) date, observation FROM macro_observations WHERE series_id=${rows[0]!.seriesId} AND ${inArray(
        macroObservations.date,
        rows.map((r) => r.date),
      )} ORDER BY date,collected_at DESC`,
    );
    const previous = new Map(
      old.map((r) => [String(r.date), r.observation as MacroObservation]),
    );
    const changed = rows.filter((r) => {
      const p = previous.get(r.date);
      return (
        !p ||
        (r.provenance.ingestedAt > p.provenance.ingestedAt &&
          r.value !== p.value)
      );
    });
    if (!changed.length) return 0;
    const result = await tx
      .insert(macroObservations)
      .values(
        changed.map((r) => ({
          seriesId: r.seriesId,
          date: r.date,
          collectedAt: new Date(r.provenance.ingestedAt),
          observation: r,
        })),
      )
      .onConflictDoNothing()
      .returning();
    await tx.execute(
      sql`WITH ranked AS (SELECT series_id,date,collected_at,row_number() OVER (PARTITION BY date ORDER BY collected_at DESC) AS rank FROM macro_observations WHERE series_id=${rows[0]!.seriesId} AND ${inArray(
        macroObservations.date,
        changed.map((r) => r.date),
      )}) DELETE FROM macro_observations m USING ranked r WHERE r.rank>12 AND m.series_id=r.series_id AND m.date=r.date AND m.collected_at=r.collected_at`,
    );
    return result.length;
  });
}
export async function importEvents(
  connection: DatabaseConnection,
  input: ResearchEvent[],
  now = new Date(),
) {
  if (input.length > 50) throw new Error('EVENT_IMPORT_LIMIT');
  const rows = input.map((r) => eventSchema.parse(r));
  if (
    rows.some((r) => Date.parse(r.collectedAt) > now.getTime()) ||
    new Set(rows.map((r) => r.id)).size !== rows.length
  )
    throw new Error('INVALID_EVENT_IMPORT');
  if (!rows.length) return 0;
  return connection.db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('event-import'))`,
    );
    const existing = await tx.select().from(researchEvents);
    if (
      existing.length +
        rows.filter((r) => !existing.some((e) => e.id === r.id)).length >
      2000
    )
      throw new Error('EVENT_STORAGE_LIMIT');
    for (const r of rows) {
      const old = existing.find((e) => e.id === r.id);
      if (
        old &&
        JSON.stringify(eventSchema.parse(old.observation)) !== JSON.stringify(r)
      )
        throw new Error('IMMUTABLE_EVENT_CONFLICT');
    }
    return (
      await tx
        .insert(researchEvents)
        .values(
          rows.map((r) => ({
            id: r.id,
            timestamp: new Date(r.timestamp),
            observation: r,
          })),
        )
        .onConflictDoNothing()
        .returning()
    ).length;
  });
}
const provenance = (r: {
  source: string;
  providerId: string;
  sourceTimestamp: Date;
  ingestedAt: Date;
  quality: Provenance['quality'];
  methodologyVersion: string | null;
}): Provenance => ({
  source: r.source,
  providerId: r.providerId,
  sourceTimestamp: r.sourceTimestamp.toISOString(),
  ingestedAt: r.ingestedAt.toISOString(),
  quality: r.quality,
  ...(r.methodologyVersion ? { methodologyVersion: r.methodologyVersion } : {}),
});
export async function computeEventImpacts(
  connection: DatabaseConnection,
  now = new Date(),
  signal?: AbortSignal,
) {
  const events = await connection.db
    .select()
    .from(researchEvents)
    .where(
      and(
        lte(researchEvents.timestamp, now),
        sql`${researchEvents.timestamp}>=${new Date(now.getTime() - 30 * 86400000).toISOString()}`,
      ),
    )
    .orderBy(desc(researchEvents.timestamp))
    .limit(50);
  const marketRows = await connection.db
    .select()
    .from(markets)
    .where(
      sql`${markets.base} IN ('BTC','ETH','SOL') AND ${markets.quote}='USDT'`,
    );
  let count = 0;
  for (const e of events)
    for (const asset of e.observation.affectedAssets) {
      if (signal?.aborted) return count;
      const spot = marketRows.find(
          (m) => m.base === asset && m.kind === 'SPOT',
        ),
        perp = marketRows.find(
          (m) => m.base === asset && m.kind === 'PERPETUAL',
        );
      const from = new Date(e.timestamp.getTime() - 1441 * 60000),
        until = new Date(
          Math.min(now.getTime(), e.timestamp.getTime() + 1440 * 60000),
        );
      const bars = spot
        ? await connection.db
            .select()
            .from(ohlcv)
            .where(
              and(
                eq(ohlcv.marketId, spot.id),
                eq(ohlcv.timeframe, '1m'),
                sql`${ohlcv.closeTime} BETWEEN ${from.toISOString()} AND ${until.toISOString()}`,
                lte(ohlcv.ingestedAt, now),
                lte(ohlcv.sourceTimestamp, now),
              ),
            )
            .orderBy(ohlcv.openTime)
            .limit(2882)
        : [];
      const oi = perp
        ? await connection.db
            .select()
            .from(openInterest)
            .where(
              and(
                eq(openInterest.marketId, perp.id),
                sql`${openInterest.sourceTimestamp} BETWEEN ${from.toISOString()} AND ${until.toISOString()}`,
                lte(openInterest.ingestedAt, now),
              ),
            )
            .orderBy(openInterest.sourceTimestamp)
            .limit(500)
        : [];
      const funding = perp
        ? await connection.db
            .select()
            .from(fundingRates)
            .where(
              and(
                eq(fundingRates.marketId, perp.id),
                sql`${fundingRates.sourceTimestamp} BETWEEN ${from.toISOString()} AND ${until.toISOString()}`,
                lte(fundingRates.ingestedAt, now),
              ),
            )
            .orderBy(fundingRates.sourceTimestamp)
            .limit(500)
        : [];
      const input = {
        candles: bars.map((b) => ({
          marketId: b.marketId,
          timeframe: b.timeframe,
          openTime: b.openTime.toISOString(),
          closeTime: b.closeTime.toISOString(),
          open: Number(b.open),
          high: Number(b.high),
          low: Number(b.low),
          close: Number(b.close),
          volume: Number(b.volume),
          provenance: provenance(b),
        })),
        oi: oi.map((r) => ({
          marketId: r.marketId,
          quantity: Number(r.quantity),
          unit: r.unit,
          provenance: provenance(r),
        })),
        funding: funding.map((r) => ({
          marketId: r.marketId,
          rate: Number(r.rate),
          markPrice: Number(r.markPrice),
          nextFundingAt: r.nextFundingAt.toISOString(),
          provenance: provenance(r),
        })),
      };
      for (const minutes of impactWindows) {
        const observation = eventImpact(
          e.observation,
          asset,
          minutes,
          input,
          now,
        );
        await connection.db
          .insert(eventImpacts)
          .values({
            eventId: e.id,
            asset,
            windowMinutes: minutes,
            calculatedAt: now,
            observation,
          })
          .onConflictDoUpdate({
            target: [
              eventImpacts.eventId,
              eventImpacts.asset,
              eventImpacts.windowMinutes,
            ],
            set: { calculatedAt: now, observation },
            setWhere: lte(eventImpacts.calculatedAt, now),
          });
        count++;
      }
    }
  return count;
}
export async function queryEvents(
  connection: DatabaseConnection,
  now = new Date(),
): Promise<EventsResponse> {
  const events = await connection.db
    .select()
    .from(researchEvents)
    .where(
      sql`(${researchEvents.observation}->>'collectedAt')::timestamptz<=${now.toISOString()}`,
    )
    .orderBy(desc(researchEvents.timestamp))
    .limit(100);
  const ids = events.map((e) => e.id);
  const impacts = ids.length
    ? await connection.db
        .select()
        .from(eventImpacts)
        .where(
          and(
            inArray(eventImpacts.eventId, ids),
            lte(eventImpacts.calculatedAt, now),
          ),
        )
        .limit(1200)
    : [];
  return {
    state: events.length ? 'READY' : 'EMPTY',
    observedAt: now.toISOString(),
    events: events.map((r) => r.observation),
    impacts: impacts.map((r) => r.observation),
  };
}
export async function queryMacro(
  connection: DatabaseConnection,
  now = new Date(),
): Promise<MacroResponse> {
  const health = (
    await connection.db
      .select()
      .from(providerHealth)
      .where(eq(providerHealth.providerId, 'fred'))
      .limit(1)
  )[0];
  const series: MacroResponse['series'] = [];
  for (const definition of macroSeries) {
    const rows =
      await connection.client`SELECT * FROM (SELECT DISTINCT ON (date) observation,date FROM macro_observations WHERE series_id=${definition.id} AND collected_at<=${now.toISOString()} ORDER BY date,collected_at DESC) latest ORDER BY date DESC LIMIT 2000`;
    series.push({
      ...definition,
      observations: rows
        .map((r) => macroObservationSchema.parse(r.observation))
        .reverse(),
    });
  }
  const crypto: MacroResponse['crypto'] = [];
  for (const asset of ['BTC', 'ETH', 'SOL']) {
    const market = (
      await connection.db
        .select()
        .from(markets)
        .where(
          and(
            eq(markets.base, asset),
            eq(markets.quote, 'USDT'),
            eq(markets.kind, 'SPOT'),
          ),
        )
        .limit(1)
    )[0];
    const rows = market
      ? await connection.db
          .select({ openTime: ohlcv.openTime, close: ohlcv.close })
          .from(ohlcv)
          .where(
            and(
              eq(ohlcv.marketId, market.id),
              eq(ohlcv.timeframe, '1d'),
              lte(ohlcv.closeTime, now),
              lte(ohlcv.ingestedAt, now),
              lte(ohlcv.sourceTimestamp, now),
            ),
          )
          .orderBy(desc(ohlcv.openTime))
          .limit(2000)
      : [];
    crypto.push({
      asset,
      points: rows
        .map((r) => ({
          date: r.openTime.toISOString().slice(0, 10),
          value: Number(r.close),
        }))
        .reverse(),
    });
  }
  const age = health?.lastSuccessAt
    ? now.getTime() - health.lastSuccessAt.getTime()
    : Infinity;
  return {
    state: series.some((s) => s.observations.length)
      ? 'READY'
      : health
        ? 'EMPTY'
        : 'NOT_CONFIGURED',
    observedAt: now.toISOString(),
    provider: {
      status:
        health?.lastSuccessAt && (age < 0 || age > providerFreshnessMs('fred'))
          ? 'STALE'
          : (health?.status ?? 'NOT_CONFIGURED'),
      lastSuccessAt: health?.lastSuccessAt?.toISOString() ?? null,
      errorCode: health?.errorCode ?? null,
    },
    series,
    crypto,
  };
}
