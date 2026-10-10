import { createHash } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DatabaseConnection } from './index';
import {
  watchlists,
  watchlistItems,
  researchNotes,
  aiQueries,
  savedViews,
  reportSnapshots,
  alerts,
  alertNotifications,
  providerHealth,
} from './schema';
import {
  researchActionSchema,
  researchResponseSchema,
  savedViewSchema,
  reportSchema,
  evaluationSchema,
  alertRuleSchema,
  emptyResearch,
  evaluateAlert,
  narrativeAlert,
  notificationTransition,
  researchVersion,
  type ResearchAction,
  type Evaluation,
} from '@terminal/domain/research';
import {
  runAnalyst,
  analystMemoSchema,
  type AnalystRequest,
  type AnalystMemo,
} from '@terminal/domain/analyst';
import { providerFreshnessMs } from '@terminal/domain/health';
import { readAnalystEvidence } from './analyst';
import { queryIntelligence } from './intelligence';
import { narrativeVersion } from '@terminal/domain/intelligence';

// Stable JSONB-independent digest: JSONB reorders object keys, never arrays.
export function reportDigest(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b, 'en'))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
export async function captureResearchMemo(
  c: DatabaseConnection,
  request: AnalystRequest,
  now = new Date(),
  signal?: AbortSignal,
) {
  return runAnalyst(
    request,
    (t) => readAnalystEvidence(c, request, t, now),
    now,
    undefined,
    signal,
  );
}
export async function mutateResearch(
  c: DatabaseConnection,
  input: ResearchAction,
  now = new Date(),
) {
  const a = researchActionSchema.parse(input);
  // Capture outside the write lock. Evidence reads never invoke an AI provider.
  const memo =
    a.action === 'CAPTURE_REPORT'
      ? analystMemoSchema.parse(await captureResearchMemo(c, a.query, now))
      : null;
  if (memo && Buffer.byteLength(JSON.stringify(memo)) > 120000)
    throw new Error('REPORT_TOO_LARGE');
  return c.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(747001)`);
    const capacity = async (
      table:
        | typeof watchlists
        | typeof watchlistItems
        | typeof researchNotes
        | typeof aiQueries
        | typeof savedViews
        | typeof reportSnapshots
        | typeof alerts,
      cap: number,
    ) => {
      const r = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(table);
      if (r[0]!.count >= cap) throw new Error('RESEARCH_CAPACITY');
    };
    switch (a.action) {
      case 'CREATE_WATCHLIST':
        await capacity(watchlists, 20);
        return (
          await tx
            .insert(watchlists)
            .values({ title: a.title })
            .returning({ id: watchlists.id })
        )[0]!;
      case 'WATCH_ITEM': {
        const list = await tx
          .select()
          .from(watchlists)
          .where(eq(watchlists.id, a.id));
        if (!list.length) throw new Error('RESEARCH_NOT_FOUND');
        if (a.remove) {
          await tx
            .delete(watchlistItems)
            .where(
              and(
                eq(watchlistItems.watchlistId, a.id),
                eq(watchlistItems.symbol, a.symbol),
              ),
            );
          break;
        }
        const items = await tx
          .select()
          .from(watchlistItems)
          .where(eq(watchlistItems.watchlistId, a.id))
          .limit(31);
        if (items.some((i) => i.symbol === a.symbol)) break;
        if (items.length >= 30) throw new Error('RESEARCH_CAPACITY');
        await tx
          .insert(watchlistItems)
          .values({ watchlistId: a.id, symbol: a.symbol });
        break;
      }
      case 'SAVE_NOTE': {
        if (a.id) {
          const r = await tx
            .update(researchNotes)
            .set({
              title: a.title,
              asset: a.asset,
              body: a.body,
              updatedAt: sql`GREATEST(${now.toISOString()}::timestamptz,${researchNotes.updatedAt}+interval '1 millisecond')`,
            })
            .where(
              and(
                eq(researchNotes.id, a.id),
                eq(researchNotes.updatedAt, new Date(a.expectedUpdatedAt!)),
              ),
            )
            .returning({ id: researchNotes.id });
          if (!r.length) throw new Error('RESEARCH_CONFLICT');
          return r[0]!;
        }
        await capacity(researchNotes, 100);
        return (
          await tx
            .insert(researchNotes)
            .values({
              title: a.title,
              asset: a.asset,
              body: a.body,
              updatedAt: now,
            })
            .returning({ id: researchNotes.id })
        )[0]!;
      }
      case 'SAVE_QUERY':
        await capacity(aiQueries, 50);
        return (
          await tx
            .insert(aiQueries)
            .values({ title: a.title, ...a.query })
            .returning({ id: aiQueries.id })
        )[0]!;
      case 'SAVE_VIEW':
        await capacity(savedViews, 50);
        return (
          await tx
            .insert(savedViews)
            .values({
              title: a.title,
              filter: a.view.filter,
              sort: a.view.sort,
              descending: a.view.desc,
              hidden: a.view.hidden,
            })
            .returning({ id: savedViews.id })
        )[0]!;
      case 'CAPTURE_REPORT':
        await capacity(reportSnapshots, 50);
        return (
          await tx
            .insert(reportSnapshots)
            .values({
              title: a.title,
              asset: a.query.asset,
              observedAt: now,
              createdAt: now,
              confidence: memo!.confidence,
              digest: reportDigest(memo),
              memo: memo!,
            })
            .returning({ id: reportSnapshots.id })
        )[0]!;
      case 'CREATE_ALERT':
        await capacity(alerts, 20);
        return (
          await tx
            .insert(alerts)
            .values({
              title: a.title,
              kind: a.rule.kind,
              rule: a.rule,
              updatedAt: now,
            })
            .returning({ id: alerts.id })
        )[0]!;
      case 'TOGGLE_ALERT': {
        const r = await tx
          .update(alerts)
          .set({ enabled: a.enabled, updatedAt: now })
          .where(eq(alerts.id, a.id))
          .returning({ id: alerts.id });
        if (!r.length) throw new Error('RESEARCH_NOT_FOUND');
        break;
      }
      case 'DELETE': {
        const table = {
          watchlists,
          notes: researchNotes,
          queries: aiQueries,
          views: savedViews,
          reports: reportSnapshots,
          alerts,
        }[a.table];
        const r = await tx
          .delete(table)
          .where(eq(table.id, a.id))
          .returning({ id: table.id });
        if (!r.length) throw new Error('RESEARCH_NOT_FOUND');
        break;
      }
    }
    return { ok: true };
  });
}
export async function queryResearch(c: DatabaseConnection, now = new Date()) {
  const out = emptyResearch('READY', now);
  const lists = await c.db
    .select()
    .from(watchlists)
    .orderBy(desc(watchlists.createdAt))
    .limit(20);
  const items = await c.db.select().from(watchlistItems).limit(600);
  out.watchlists = lists.map((r) => ({
    id: r.id,
    title: r.title,
    items: items
      .filter((i) => i.watchlistId === r.id)
      .map((i) => i.symbol)
      .sort(),
  }));
  out.notes = (
    await c.db
      .select()
      .from(researchNotes)
      .orderBy(desc(researchNotes.updatedAt))
      .limit(100)
  ).map((r) => ({
    ...r,
    asset: r.asset as 'BTC' | 'ETH' | 'SOL',
    updatedAt: r.updatedAt.toISOString(),
  }));
  out.queries = (
    await c.db
      .select()
      .from(aiQueries)
      .orderBy(desc(aiQueries.createdAt))
      .limit(50)
  ).map((r) => ({
    id: r.id,
    title: r.title,
    query: {
      asset: r.asset as AnalystRequest['asset'],
      question: r.question,
      tools: r.tools as AnalystRequest['tools'],
    },
  }));
  out.views = (
    await c.db
      .select()
      .from(savedViews)
      .orderBy(desc(savedViews.createdAt))
      .limit(50)
  ).map((r) => ({
    id: r.id,
    title: r.title,
    view: savedViewSchema.parse({
      filter: r.filter,
      sort: r.sort,
      desc: r.descending,
      hidden: r.hidden,
    }),
  }));
  // Report bodies are never included in the index response.
  out.reports = (
    await c.db
      .select({
        id: reportSnapshots.id,
        title: reportSnapshots.title,
        asset: reportSnapshots.asset,
        observedAt: reportSnapshots.observedAt,
        createdAt: reportSnapshots.createdAt,
        confidence: reportSnapshots.confidence,
        digest: reportSnapshots.digest,
      })
      .from(reportSnapshots)
      .orderBy(desc(reportSnapshots.createdAt))
      .limit(50)
  ).map((r) => ({
    ...r,
    asset: r.asset as AnalystRequest['asset'],
    observedAt: r.observedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    confidence: r.confidence as AnalystMemo['confidence'],
  }));
  out.alerts = (await c.db.select().from(alerts).limit(20)).map((r) => ({
    id: r.id,
    title: r.title,
    rule: r.rule,
    enabled: r.enabled,
    evaluation: r.evaluation,
  }));
  out.notifications = (
    await c.db
      .select()
      .from(alertNotifications)
      .orderBy(desc(alertNotifications.createdAt), desc(alertNotifications.id))
      .limit(100)
  ).map((r) => ({
    ...r,
    state: r.state as 'TRIGGERED' | 'RECOVERED',
    createdAt: r.createdAt.toISOString(),
  }));
  return researchResponseSchema.parse(out);
}
export async function queryReport(c: DatabaseConnection, id: string) {
  const [r] = await c.db
    .select()
    .from(reportSnapshots)
    .where(eq(reportSnapshots.id, id))
    .limit(1);
  if (!r) throw new Error('RESEARCH_NOT_FOUND');
  const memo = analystMemoSchema.parse(r.memo);
  if (reportDigest(memo) !== r.digest) throw new Error('REPORT_INTEGRITY');
  return reportSchema.parse({
    id: r.id,
    title: r.title,
    digest: r.digest,
    memo,
  });
}
export async function querySavedView(c: DatabaseConnection, id: string) {
  const [r] = await c.db
    .select()
    .from(savedViews)
    .where(eq(savedViews.id, id))
    .limit(1);
  if (!r) throw new Error('RESEARCH_NOT_FOUND');
  return savedViewSchema.parse({
    filter: r.filter,
    sort: r.sort,
    desc: r.descending,
    hidden: r.hidden,
  });
}
export async function retainResearch(c: DatabaseConnection, now = new Date()) {
  await c.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(747001)`);
    await tx
      .delete(reportSnapshots)
      .where(
        sql`${reportSnapshots.createdAt}<${new Date(now.getTime() - 90 * 86400000).toISOString()}::timestamptz`,
      );
    await tx
      .delete(alertNotifications)
      .where(
        sql`${alertNotifications.createdAt}<${new Date(now.getTime() - 30 * 86400000).toISOString()}::timestamptz`,
      );
    await tx.execute(
      sql`DELETE FROM ${alertNotifications} WHERE id IN (SELECT id FROM ${alertNotifications} ORDER BY created_at DESC,id DESC OFFSET 1000)`,
    );
  });
}
export async function evaluateResearch(
  c: DatabaseConnection,
  now = new Date(),
  signal?: AbortSignal,
) {
  const rules = await c.db
    .select()
    .from(alerts)
    .where(eq(alerts.enabled, true))
    .limit(20);
  const cache = new Map<string, Promise<AnalystMemo>>();
  const health = rules.some((r) => r.kind === 'PROVIDER_DOWN')
    ? await c.db.select().from(providerHealth).limit(12)
    : [];
  const intelligence = rules.some((r) => r.kind === 'NARRATIVE_CHANGE')
    ? await queryIntelligence(c, now)
    : null;
  for (const r of rules) {
    if (signal?.aborted) break;
    const rule = alertRuleSchema.parse(r.rule);
    let e: Evaluation = {
      version: researchVersion,
      state: 'UNKNOWN',
      reason: 'Required current evidence unavailable.',
      observedAt: now.toISOString(),
      value: null,
      sourceTimestamp: null,
      evidence: [],
      unit: '',
    };
    if (rule.kind === 'PROVIDER_DOWN') {
      const h = health.find((x) => x.providerId === rule.provider);
      const age = h ? now.getTime() - h.updatedAt.getTime() : -1;
      if (h && age >= 0 && age <= providerFreshnessMs(rule.provider))
        e = {
          ...e,
          state: h.status === 'HEALTHY' ? 'CLEAR' : 'TRIGGERED',
          reason: `Provider ${h.providerId}: ${h.status}; ${h.errorCode ?? 'no recorded error'}. Configuration failures do not establish a remote service outage.`,
          value: h.status,
          sourceTimestamp: h.updatedAt.toISOString(),
          evidence: [h.providerId],
          unit: 'provider status',
        };
    } else if (rule.kind === 'NARRATIVE_CHANGE') {
      const n = intelligence?.narratives.find(
        (n) => n.narrativeId === rule.narrative,
      );
      const age = n
        ? now.getTime() - Date.parse(n.provenance.sourceTimestamp)
        : -1;
      if (
        n &&
        n.provenance.methodologyVersion === narrativeVersion &&
        n.coverage === 1 &&
        n.score !== null &&
        Date.parse(n.calculatedAt) <= now.getTime() &&
        Date.parse(n.bucketAt) <= now.getTime() &&
        age >= 0 &&
        age <= 1200000 &&
        Date.parse(n.provenance.ingestedAt) <= now.getTime()
      )
        e = narrativeAlert(
          rule,
          {
            ...e,
            state: 'CLEAR',
            value: n.score,
            sourceTimestamp: n.provenance.sourceTimestamp,
            evidence: [n.narrativeId, narrativeVersion],
            unit: 'score points',
          },
          r.evaluation ?? undefined,
        );
    } else {
      const request: AnalystRequest = {
        asset: rule.asset,
        question: 'Evaluate deterministic research conditions.',
        tools: [
          'market',
          'features',
          'risk',
          'wallet',
          'events',
          'macro',
          'providers',
        ],
      };
      if (!cache.has(rule.asset))
        cache.set(rule.asset, captureResearchMemo(c, request, now, signal));
      e = evaluateAlert(rule, await cache.get(rule.asset)!, now);
    }
    evaluationSchema.parse(e);
    await c.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(747001)`);
      const [current] = await tx
        .select()
        .from(alerts)
        .where(eq(alerts.id, r.id))
        .for('update');
      if (
        !current ||
        !current.enabled ||
        current.updatedAt.getTime() !== r.updatedAt.getTime()
      )
        return;
      const transition = notificationTransition(
        current.lastKnownState as Evaluation['state'],
        e.state,
      );
      // Missing inputs retain a known narrative baseline and last known state.
      const stored =
        rule.kind === 'NARRATIVE_CHANGE' &&
        e.value === null &&
        current.evaluation
          ? {
              ...e,
              value: current.evaluation.value,
              sourceTimestamp: current.evaluation.sourceTimestamp,
            }
          : e;
      await tx
        .update(alerts)
        .set({
          evaluation: stored,
          ...(e.state !== 'UNKNOWN' ? { lastKnownState: e.state } : {}),
        })
        .where(eq(alerts.id, r.id));
      if (transition)
        await tx.insert(alertNotifications).values({
          alertId: r.id,
          state: transition,
          evaluation: e,
          createdAt: now,
        });
      await tx.execute(
        sql`DELETE FROM ${alertNotifications} WHERE id IN (SELECT id FROM ${alertNotifications} ORDER BY created_at DESC,id DESC OFFSET 1000)`,
      );
    });
  }
}
