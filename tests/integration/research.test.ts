import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import {
  createDatabase,
  type DatabaseConnection,
} from '../../packages/db/src/index';
import { runMigrations } from '../../packages/db/src/migrate';
import {
  mutateResearch,
  queryResearch,
  queryReport,
  querySavedView,
  retainResearch,
  evaluateResearch,
  reportDigest,
} from '../../packages/db/src/research';
import { type AnalystRequest } from '../../packages/domain/src/analyst';
import { componentSchema } from '../../packages/domain/src/intelligence';
const now = new Date('2026-09-02T12:00:00Z'),
  request: AnalystRequest = {
    asset: 'SOL',
    question: 'Synthetic QA, not live.',
    tools: ['market', 'risk', 'providers'],
  };
let c: DatabaseConnection;
async function id(action: Parameters<typeof mutateResearch>[1]) {
  const x = await mutateResearch(c, action, now);
  if (!('id' in x)) throw new Error('Expected created record');
  return x.id;
}
beforeAll(async () => {
  const u = process.env.TEST_DATABASE_URL;
  if (!u) throw new Error('TEST_DATABASE_URL required');
  const p = new URL(u);
  if (
    p.pathname !== '/terminal_test' ||
    !['127.0.0.1', 'localhost'].includes(p.hostname)
  )
    throw new Error('Local disposable terminal_test required');
  await runMigrations(u);
  c = createDatabase(u);
});
beforeEach(async () => {
  // Risk fixtures belong to tracked tokens, independently of exchange markets.
  // Clear both roots so the empty-evidence case is independent of suite order.
  await c.client`TRUNCATE watchlists,research_notes,ai_queries,saved_views,report_snapshots,alerts,provider_health,markets,tracked_tokens,narrative_snapshots CASCADE`;
});
afterAll(async () => {
  if (c) await c.client.end({ timeout: 3 });
});
describe('bounded persistent research workflow', () => {
  it('uses complete narrative baselines, excludes future calculation time and preserves last known input across partial gaps', async () => {
    const a = await id({
      action: 'CREATE_ALERT',
      title: 'QA narrative',
      rule: { kind: 'NARRATIVE_CHANGE', narrative: 'l1', threshold: 5 },
    });
    await c.client`INSERT INTO narratives(id,label,taxonomy_version) VALUES('l1','SYNTHETIC QA','curated-taxonomy:v1') ON CONFLICT(id) DO NOTHING`;
    const components = componentSchema.shape.name.options.map((name) => ({
      name,
      weight: 1 / 6,
      value: 50,
      availableAssetWeight: 1,
      reason: 'SYNTHETIC QA only',
    }));
    await c.client`INSERT INTO narrative_snapshots(narrative_id,bucket_at,calculated_at,score,partial_score,coverage,asset_count,components,source,provider_id,source_timestamp,ingested_at,quality,methodology_version) VALUES('l1',${now.toISOString()},${now.toISOString()},50,50,1,1,${JSON.stringify(components)}::jsonb,'SYNTHETIC QA only','terminal:narratives',${now.toISOString()},${now.toISOString()},'DERIVED','narrative-rotation:v1')`;
    await evaluateResearch(c, now);
    let out = await queryResearch(c);
    expect(out.alerts[0]!.evaluation!.state).toBe('UNKNOWN');
    expect(out.notifications).toHaveLength(0);
    const next = new Date(now.getTime() + 60000);
    await c.client`UPDATE narrative_snapshots SET score=56,partial_score=56,source_timestamp=${next.toISOString()},calculated_at=${next.toISOString()},bucket_at=${next.toISOString()},ingested_at=${next.toISOString()} WHERE narrative_id='l1'`;
    await evaluateResearch(c, next);
    await evaluateResearch(c, next);
    out = await queryResearch(c);
    expect(out.notifications).toHaveLength(1);
    expect(out.alerts[0]!.evaluation!.state).toBe('TRIGGERED');
    await c.client`UPDATE narrative_snapshots SET score=NULL,coverage=0.5 WHERE narrative_id='l1'`;
    await evaluateResearch(c, next);
    out = await queryResearch(c);
    expect(out.alerts[0]!.evaluation!.state).toBe('UNKNOWN');
    expect(out.alerts[0]!.evaluation!.value).toBe(56);
    expect(out.notifications).toHaveLength(1);
    await c.client`UPDATE narrative_snapshots SET score=60,coverage=1,calculated_at=${new Date(next.getTime() + 60000).toISOString()} WHERE narrative_id='l1'`;
    await evaluateResearch(c, next);
    expect((await queryResearch(c)).alerts[0]!.evaluation!.state).toBe(
      'UNKNOWN',
    );
    const fresh = new Date(next.getTime() + 60000);
    await c.client`UPDATE narrative_snapshots SET source_timestamp=${fresh.toISOString()},ingested_at=${fresh.toISOString()},bucket_at=${fresh.toISOString()} WHERE narrative_id='l1'`;
    await evaluateResearch(c, fresh);
    out = await queryResearch(c);
    expect(out.alerts.find((r) => r.id === a)!.evaluation!.state).toBe('CLEAR');
    expect(out.notifications.map((n) => n.state).sort()).toEqual([
      'RECOVERED',
      'TRIGGERED',
    ]);
  });
  it('persists idempotent watchlist items and cascades deletion without changing tracked ingestion', async () => {
    const l = await id({ action: 'CREATE_WATCHLIST', title: 'QA watch' });
    await mutateResearch(
      c,
      { action: 'WATCH_ITEM', id: l, symbol: 'SOL', remove: false },
      now,
    );
    await mutateResearch(
      c,
      { action: 'WATCH_ITEM', id: l, symbol: 'SOL', remove: false },
      now,
    );
    expect((await queryResearch(c, now)).watchlists[0]!.items).toEqual(['SOL']);
    await mutateResearch(c, { action: 'DELETE', table: 'watchlists', id: l });
    expect((await c.client`SELECT * FROM watchlist_items`).length).toBe(0);
    expect((await c.client`SELECT * FROM markets`).length).toBe(0);
  });
  it('serializes concurrent inserts at the global list cap and leaves existing records intact', async () => {
    for (let i = 0; i < 19; i++)
      await id({ action: 'CREATE_WATCHLIST', title: `QA ${i}` });
    const r = await Promise.allSettled([
      mutateResearch(c, {
        action: 'CREATE_WATCHLIST',
        title: 'QA concurrent A',
      }),
      mutateResearch(c, {
        action: 'CREATE_WATCHLIST',
        title: 'QA concurrent B',
      }),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((await queryResearch(c)).watchlists).toHaveLength(20);
  });
  it('enforces item caps and duplicate item requests do not consume capacity', async () => {
    const l = await id({ action: 'CREATE_WATCHLIST', title: 'QA capped' });
    await c.client`INSERT INTO watchlist_items SELECT ${l}::uuid, 'QA'||i FROM generate_series(1,30) i`;
    await mutateResearch(c, {
      action: 'WATCH_ITEM',
      id: l,
      symbol: 'QA1',
      remove: false,
    });
    await expect(
      mutateResearch(c, {
        action: 'WATCH_ITEM',
        id: l,
        symbol: 'QA31',
        remove: false,
      }),
    ).rejects.toThrow('RESEARCH_CAPACITY');
  });
  it('keeps notes plain text and rejects lost-update conflicts', async () => {
    const n = await id({
      action: 'SAVE_NOTE',
      title: 'QA note',
      asset: 'SOL',
      body: '<script>synthetic opinion</script>',
    });
    let out = await queryResearch(c, now);
    expect(out.notes[0]!.body).toContain('<script>');
    const edit = {
      action: 'SAVE_NOTE' as const,
      id: n,
      title: 'QA revised',
      asset: 'SOL' as const,
      body: 'Revised operator opinion',
      expectedUpdatedAt: out.notes[0]!.updatedAt,
    };
    await mutateResearch(c, edit, new Date(now.getTime() + 1));
    await expect(
      mutateResearch(c, edit, new Date(now.getTime() + 2)),
    ).rejects.toThrow('RESEARCH_CONFLICT');
    out = await queryResearch(c);
    expect(out.notes[0]!.body).toBe('Revised operator opinion');
  });
  it('advances note versions even when two server observations share the same millisecond', async () => {
    const n = await id({
      action: 'SAVE_NOTE',
      title: 'QA clock',
      asset: 'SOL',
      body: 'Initial operator text',
    });
    const action = {
      action: 'SAVE_NOTE' as const,
      id: n,
      title: 'QA clock',
      asset: 'SOL' as const,
      body: 'Changed operator text',
      expectedUpdatedAt: now.toISOString(),
    };
    await mutateResearch(c, action, now);
    expect((await queryResearch(c)).notes[0]!.updatedAt).toBe(
      new Date(now.getTime() + 1).toISOString(),
    );
    await expect(
      mutateResearch(c, { ...action, body: 'Stale overwrite' }, now),
    ).rejects.toThrow('RESEARCH_CONFLICT');
    expect((await queryResearch(c)).notes[0]!.body).toBe(
      'Changed operator text',
    );
  });
  it('saves typed tool queries and scanner view settings and rejects malformed IDs/columns', async () => {
    await id({ action: 'SAVE_QUERY', title: 'QA query', query: request });
    const v = await id({
      action: 'SAVE_VIEW',
      title: 'QA view',
      view: { filter: 'SOL', sort: 'price', desc: false, hidden: ['funding'] },
    });
    expect(await querySavedView(c, v)).toEqual({
      filter: 'SOL',
      sort: 'price',
      desc: false,
      hidden: ['funding'],
    });
    expect((await queryResearch(c)).queries[0]!.query).toEqual(request);
    await expect(
      mutateResearch(c, {
        action: 'SAVE_VIEW',
        title: 'bad',
        view: { filter: '', sort: 'price', desc: true, hidden: ['base'] },
      }),
    ).rejects.toThrow();
  });
  it('captures all six memo sections without AI, excludes bodies from index and roundtrips stable JSONB digests', async () => {
    const r = await id({
      action: 'CAPTURE_REPORT',
      title: 'QA absent evidence',
      query: request,
    });
    const report = await queryReport(c, r);
    expect(report.memo.providerState).toBe('NOT_CONFIGURED');
    expect(report.memo.confidence).toBe('INSUFFICIENT');
    expect(report.memo.counterEvidence.length).toBeGreaterThan(0);
    expect(report.memo.sources).toEqual([]);
    expect(reportDigest(report.memo)).toBe(report.digest);
    expect(reportDigest({ b: 2, a: 1 })).toBe(reportDigest({ a: 1, b: 2 }));
    expect(JSON.stringify((await queryResearch(c)).reports)).not.toContain(
      'counterEvidence',
    );
  });
  it('blocks report updates at PostgreSQL and detects forged digests', async () => {
    const r = await id({
      action: 'CAPTURE_REPORT',
      title: 'QA immutable',
      query: request,
    });
    await expect(
      c.client`UPDATE report_snapshots SET title='changed' WHERE id=${r}`,
    ).rejects.toThrow('immutable');
    await c.client`INSERT INTO report_snapshots(title,asset,observed_at,confidence,digest,memo) SELECT 'QA corrupt',asset,observed_at,confidence,repeat('0',64),memo FROM report_snapshots WHERE id=${r}`;
    const [bad] =
      await c.client`SELECT id FROM report_snapshots WHERE title='QA corrupt'`;
    await expect(queryReport(c, bad!.id)).rejects.toThrow('REPORT_INTEGRITY');
  });
  it('prunes expired reports and notification storage without provider credentials; notes persist', async () => {
    await id({
      action: 'SAVE_NOTE',
      title: 'QA retained',
      asset: 'SOL',
      body: 'Operator opinion',
    });
    const old = new Date(now.getTime() - 91 * 86400000);
    await mutateResearch(
      c,
      { action: 'CAPTURE_REPORT', title: 'QA expired', query: request },
      old,
    );
    await id({
      action: 'CAPTURE_REPORT',
      title: 'QA retained',
      query: request,
    });
    const a = await id({
      action: 'CREATE_ALERT',
      title: 'QA cap',
      rule: { kind: 'PROVIDER_DOWN', provider: 'fred' },
    });
    const e = {
      version: 'research-alerts:v1',
      state: 'TRIGGERED',
      reason: 'Synthetic QA',
      observedAt: now.toISOString(),
      value: null,
      sourceTimestamp: null,
      evidence: [],
      unit: '',
    };
    await c.client`INSERT INTO alert_notifications(alert_id,state,evaluation,created_at) SELECT ${a}::uuid,'TRIGGERED',${JSON.stringify(e)}::jsonb,${now.toISOString()}::timestamptz FROM generate_series(1,1005)`;
    await c.client`INSERT INTO alert_notifications(alert_id,state,evaluation,created_at) VALUES(${a},'TRIGGERED',${JSON.stringify(e)}::jsonb,${old.toISOString()}::timestamptz)`;
    await retainResearch(c, now);
    expect((await queryResearch(c, now)).reports.map((r) => r.title)).toEqual([
      'QA retained',
    ]);
    expect(
      (await c.client`SELECT count(*)::int n FROM alert_notifications`)[0]!.n,
    ).toBe(1000);
    expect((await queryResearch(c)).notes).toHaveLength(1);
  });
  it('provider failures trigger once, UNKNOWN never recovers, and observed recovery generates one transition', async () => {
    await id({
      action: 'CREATE_ALERT',
      title: 'QA provider',
      rule: { kind: 'PROVIDER_DOWN', provider: 'fred' },
    });
    await c.client`INSERT INTO provider_health(provider_id,status,error_code,updated_at,last_attempt_at) VALUES('fred','DOWN','CREDENTIALS_NOT_CONFIGURED',${now.toISOString()},${now.toISOString()})`;
    await evaluateResearch(c, now);
    await evaluateResearch(c, now);
    let out = await queryResearch(c, now);
    expect(out.notifications).toHaveLength(1);
    expect(out.alerts[0]!.evaluation!.reason).toContain(
      'do not establish a remote service outage',
    );
    await evaluateResearch(c, new Date(now.getTime() + 7200001));
    out = await queryResearch(c);
    expect(out.alerts[0]!.evaluation!.state).toBe('UNKNOWN');
    expect(out.notifications).toHaveLength(1);
    await c.client`UPDATE provider_health SET status='HEALTHY',error_code=NULL,last_success_at=${now.toISOString()},updated_at=${now.toISOString()} WHERE provider_id='fred'`;
    await evaluateResearch(c, now);
    out = await queryResearch(c);
    expect(out.notifications.map((n) => n.state).sort()).toEqual([
      'RECOVERED',
      'TRIGGERED',
    ]);
  });
  it('missing threshold remains UNKNOWN while successful empty evidence triggers data-risk; disabled rules are inert', async () => {
    await id({
      action: 'CREATE_ALERT',
      title: 'QA threshold',
      rule: {
        kind: 'THRESHOLD',
        asset: 'SOL',
        metric: 'price',
        operator: 'ABOVE',
        threshold: 1,
      },
    });
    const a = await id({
      action: 'CREATE_ALERT',
      title: 'QA empty',
      rule: { kind: 'DATA_RISK', asset: 'SOL', tool: 'market' },
    });
    await evaluateResearch(c, now);
    let out = await queryResearch(c);
    expect(
      out.alerts.find((a) => a.title === 'QA threshold')!.evaluation!.state,
    ).toBe('UNKNOWN');
    expect(out.notifications).toHaveLength(1);
    await mutateResearch(
      c,
      { action: 'TOGGLE_ALERT', id: a, enabled: false },
      new Date(now.getTime() + 1),
    );
    await evaluateResearch(c, new Date(now.getTime() + 60000));
    out = await queryResearch(c);
    expect(out.notifications).toHaveLength(1);
  });
  it('rejects oversized report/note SQL and invalid query/view contracts at database boundary', async () => {
    await expect(
      c.client`INSERT INTO research_notes(title,asset,body,updated_at) VALUES('bad','SOL',repeat('x',3001),now())`,
    ).rejects.toThrow();
    await expect(
      c.client`INSERT INTO ai_queries(title,asset,question,tools) VALUES('bad','SOL','q',ARRAY['execute_trade'])`,
    ).rejects.toThrow();
    await expect(
      c.client`INSERT INTO saved_views(title,filter,sort,descending,hidden) VALUES('bad','','price',true,ARRAY['base'])`,
    ).rejects.toThrow();
  });
});
