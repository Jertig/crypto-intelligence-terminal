import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import {
  createDatabase,
  type DatabaseConnection,
} from '../../packages/db/src/index';
import { runMigrations } from '../../packages/db/src/migrate';
import {
  persistMacro,
  importEvents,
  computeEventImpacts,
  queryEvents,
  queryMacro,
  retainMacroHistory,
} from '../../packages/db/src/events';
import {
  persistMarkets,
  persistObservations,
  recordProviderRun,
} from '../../packages/db/src/market';
import { FredProvider } from '../../packages/providers/src/fred';
import {
  macroResponseSchema,
  eventsResponseSchema,
} from '../../packages/domain/src/events';
import {
  eventFixture,
  eventNow,
  eventTime,
  eventBar,
  eventMarket,
  macroFixture,
  fredFixture,
} from '../fixtures/events';
let connection: DatabaseConnection;
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL required');
  const t = new URL(url);
  if (
    t.pathname !== '/terminal_test' ||
    !['localhost', '127.0.0.1'].includes(t.hostname)
  )
    throw new Error('Local disposable terminal_test required');
  await runMigrations(url);
  connection = createDatabase(url);
});
beforeEach(async () => {
  await connection.client`TRUNCATE macro_observations,research_events,markets CASCADE`;
  await connection.client`DELETE FROM provider_health WHERE provider_id='fred'`;
});
afterAll(async () => {
  if (connection) await connection.client.end({ timeout: 3 });
});
describe('macro/events persistence', () => {
  it('bounds observed versions and old periods without credentials, preserves retained as-of evidence and serializes pruning', async () => {
    await persistMacro(connection, [macroFixture('2010-01-01', 1)], eventNow);
    for (let i = 0; i < 14; i++) {
      const clock = new Date(eventNow.getTime() + i * 1000);
      await persistMacro(
        connection,
        [macroFixture('2026-09-01', 100 + i, clock)],
        clock,
      );
    }
    const [bounded] =
      await connection.client`SELECT count(*)::int n FROM macro_observations WHERE date='2026-09-01'`;
    expect(bounded?.n).toBe(12);
    const pruneAt = new Date(eventNow.getTime() + 20000);
    const counts = await Promise.all([
      retainMacroHistory(connection, pruneAt),
      retainMacroHistory(connection, pruneAt),
    ]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    const rows =
      await connection.client`SELECT date,observation FROM macro_observations ORDER BY collected_at`;
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.date === '2026-09-01')).toBe(true);
    const q = await queryMacro(
      connection,
      new Date(eventNow.getTime() + 20000),
    );
    expect(q.series.find((s) => s.id === 'SP500')?.observations[0]?.value).toBe(
      113,
    );
    expect(
      (await queryMacro(connection, eventNow)).series.find(
        (s) => s.id === 'SP500',
      )?.observations,
    ).toEqual([]);
  });
  it('preserves provider fixture lineage, missing observations and idempotent versions', async () => {
    const p = new FredProvider({
      apiKey: 'synthetic-test',
      now: () => eventNow,
      fetchFn: async () => Response.json(fredFixture('.')),
    });
    const rows = await p.observations('SP500');
    expect(await persistMacro(connection, rows, eventNow)).toBe(1);
    expect(await persistMacro(connection, rows, eventNow)).toBe(0);
    const q = macroResponseSchema.parse(await queryMacro(connection, eventNow));
    expect(q.series.find((s) => s.id === 'SP500')?.observations[0]).toEqual(
      rows[0],
    );
  });
  it('retains changed observed revisions, rejects future batches, and supports collection as-of', async () => {
    await persistMacro(connection, [macroFixture()], eventNow);
    const later = new Date(eventNow.getTime() + 86400000);
    await persistMacro(
      connection,
      [macroFixture('2026-09-01', 101, later)],
      later,
    );
    expect(
      (await queryMacro(connection, eventNow)).series.find(
        (s) => s.id === 'SP500',
      )?.observations[0]?.value,
    ).toBe(100);
    expect(
      (await queryMacro(connection, later)).series.find((s) => s.id === 'SP500')
        ?.observations[0]?.value,
    ).toBe(101);
    expect(
      await persistMacro(
        connection,
        [macroFixture('2026-09-01', 101, new Date(later.getTime() + 86400000))],
        new Date(later.getTime() + 86400000),
      ),
    ).toBe(0);
    await expect(
      persistMacro(
        connection,
        [macroFixture('2026-09-01', 99, later)],
        eventNow,
      ),
    ).rejects.toThrow('INVALID_MACRO_BATCH');
    const [count] =
      await connection.client`SELECT count(*)::int n FROM macro_observations`;
    expect(count?.n).toBe(2);
  });
  it('serializes concurrent ingestion without duplicate revisions', async () => {
    const counts = await Promise.all([
      persistMacro(connection, [macroFixture()], eventNow),
      persistMacro(connection, [macroFixture()], eventNow),
    ]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
  });
  it('imports immutable sourced events idempotently and rolls back conflicting batches', async () => {
    expect(await importEvents(connection, [eventFixture], eventNow)).toBe(1);
    expect(await importEvents(connection, [eventFixture], eventNow)).toBe(0);
    await expect(
      importEvents(
        connection,
        [
          { ...eventFixture, id: 'new-event' },
          { ...eventFixture, actual: 99 },
        ],
        eventNow,
      ),
    ).rejects.toThrow('IMMUTABLE_EVENT_CONFLICT');
    expect((await queryEvents(connection, eventNow)).events).toHaveLength(1);
  });
  it('computes fixture→persistence→impact→validated response without inventing missing derivatives', async () => {
    await persistMarkets(connection, [eventMarket], eventNow);
    await persistObservations(connection, {
      candles: Array.from({ length: 11 }, (_, i) => eventBar(i - 6)),
    });
    await importEvents(connection, [eventFixture], eventNow);
    expect(await computeEventImpacts(connection, eventNow)).toBe(4);
    const q = eventsResponseSchema.parse(
        await queryEvents(connection, eventNow),
      ),
      r = q.impacts.find((i) => i.windowMinutes === 5)!;
    expect(r.returnPct).not.toBeNull();
    expect(r.volumeAbnormalityPct).toBe(100);
    expect(r.oiChangePct).toBeNull();
    expect(r.provenance.methodologyVersion).toBe('event-impact:v1');
    await computeEventImpacts(connection, eventNow);
    expect((await queryEvents(connection, eventNow)).impacts).toHaveLength(4);
  });
  it('reports independent credential failure, stale success and future-success health without refreshing values', async () => {
    await recordProviderRun(
      connection,
      'fred',
      eventNow,
      'FAILED',
      0,
      'CREDENTIALS_NOT_CONFIGURED',
      eventNow,
    );
    expect((await queryMacro(connection, eventNow)).provider.errorCode).toBe(
      'CREDENTIALS_NOT_CONFIGURED',
    );
    await recordProviderRun(
      connection,
      'fred',
      eventNow,
      'SUCCESS',
      0,
      null,
      eventNow,
    );
    expect(
      (await queryMacro(connection, new Date(eventNow.getTime() + 7200001)))
        .provider.status,
    ).toBe('STALE');
    expect((await queryMacro(connection, eventTime)).provider.status).toBe(
      'STALE',
    );
  });
  it('excludes future-collected events and rejects database payload identity mismatches', async () => {
    await importEvents(connection, [eventFixture], eventNow);
    expect(
      (await queryEvents(connection, new Date(eventTime.getTime() - 1))).events,
    ).toEqual([]);
    await expect(
      connection.client`INSERT INTO research_events (id,timestamp,observation) VALUES ('wrong',${eventTime.toISOString()},${JSON.stringify(eventFixture)}::jsonb)`,
    ).rejects.toMatchObject({ code: '23514' });
  });
});
