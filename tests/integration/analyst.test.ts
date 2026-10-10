import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import {
  createDatabase,
  type DatabaseConnection,
} from '../../packages/db/src/index';
import { runMigrations } from '../../packages/db/src/migrate';
import {
  configureTokenUniverse,
  persistTokenRisk,
  persistDexPairs,
} from '../../packages/db/src/tokens';
import {
  defaultTokens,
  calculateTokenRisk,
  tokenId,
} from '../../packages/domain/src/token-risk';
import {
  configureWallets,
  persistWalletHistory,
} from '../../packages/db/src/wallets';
import { walletAddress, walletTx } from '../fixtures/wallets';
import { randomUUID } from 'node:crypto';
import { saveHeartbeat } from '../../packages/db/src/heartbeat';
import { drainWorkerDatabase } from '../../apps/worker/src/shutdown';
import {
  fixturePair,
  fixtureSecurity,
  tokenProvenance,
} from '../fixtures/token-risk';
import { readAnalystEvidence } from '../../packages/db/src/analyst';
import {
  persistMarkets,
  persistObservations,
  recordProviderRun,
} from '../../packages/db/src/market';
import { importEvents, persistMacro } from '../../packages/db/src/events';
import {
  runAnalyst,
  analystMemoSchema,
  type AnalystRequest,
} from '../../packages/domain/src/analyst';
import {
  eventMarket,
  eventFixture,
  eventNow,
  macroFixture,
} from '../fixtures/events';
let connection: DatabaseConnection;
const request: AnalystRequest = {
  asset: 'BTC',
  question: 'What evidence is retained?',
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
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL required');
  const target = new URL(url);
  if (
    target.pathname !== '/terminal_test' ||
    !['localhost', '127.0.0.1'].includes(target.hostname)
  )
    throw new Error('Local disposable terminal_test required');
  await runMigrations(url);
  connection = createDatabase(url);
});
beforeEach(async () => {
  await connection.client`TRUNCATE markets,research_events,macro_observations,tracked_tokens,tracked_wallets,provider_health CASCADE`;
  await persistMarkets(connection, [eventMarket], eventNow);
});
afterAll(async () => {
  if (connection) await connection.client.end({ timeout: 3 });
});
describe('bounded database analyst tools', () => {
  it('rolls back pending ingestion and removes only its own heartbeat on shutdown', async () => {
    const url = process.env.TEST_DATABASE_URL!;
    const draining = createDatabase(url),
      id = randomUUID();
    await saveHeartbeat(draining, id, eventNow, eventNow);
    await draining.client`INSERT INTO worker_heartbeats(name,instance_id,started_at,last_seen_at) VALUES('peer',${randomUUID()},${eventNow.toISOString()},${eventNow.toISOString()}) ON CONFLICT(name) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at`;
    let began!: () => void;
    const ready = new Promise<void>((resolve) => {
      began = resolve;
    });
    const pending = draining.client
      .begin(async (tx) => {
        await tx`INSERT INTO worker_heartbeats(name,instance_id,started_at,last_seen_at) VALUES('pending',${randomUUID()},${eventNow.toISOString()},${eventNow.toISOString()})`;
        began();
        await tx`SELECT pg_sleep(2)`;
      })
      .then(
        () => 'COMMITTED',
        () => 'CANCELLED',
      );
    await ready;
    await drainWorkerDatabase(draining, url, id, [pending]);
    expect(await pending).toBe('CANCELLED');
    const rows =
      await connection.client`SELECT name FROM worker_heartbeats WHERE name IN ('primary','pending','peer') ORDER BY name`;
    expect(rows.map((r) => r.name)).toEqual(['peer']);
    await connection.client`DELETE FROM worker_heartbeats WHERE name='peer'`;
  });
  it('maps only canonical wrapped SOL and refuses symbol-based token identity', async () => {
    await configureTokenUniverse(connection, defaultTokens);
    await connection.client`UPDATE tracked_tokens SET symbol='SOL' WHERE id=${tokenId(defaultTokens[1]!)}`;
    await persistTokenRisk(connection, [
      calculateTokenRisk(defaultTokens[1]!, [], [], null, [], eventNow),
    ]);
    const scoped = { ...request, asset: 'SOL' as const };
    expect(
      (await readAnalystEvidence(connection, scoped, 'risk', eventNow)).state,
    ).toBe('EMPTY');
    await persistTokenRisk(connection, [
      calculateTokenRisk(defaultTokens[0]!, [], [], null, [], eventNow),
    ]);
    const risk = await readAnalystEvidence(
      connection,
      scoped,
      'risk',
      eventNow,
    );
    expect(risk.evidence).toHaveLength(5);
    expect(new Set(risk.evidence.map((e) => e.id)).size).toBe(5);
    expect(risk.evidence.map((e) => e.label)).toContain('ownership_risk');
    expect(risk.evidence.every((e) => e.value === null)).toBe(true);
    const riskMemo = analystMemoSchema.parse(
      await runAnalyst(
        { ...scoped, tools: ['risk'] },
        () => Promise.resolve(risk),
        eventNow,
      ),
    );
    expect(riskMemo.derivedSignals).toHaveLength(5);
    expect(riskMemo.providerState).toBe('NOT_CONFIGURED');
    expect(riskMemo.confidence).toBe('INSUFFICIENT');
    const older = new Date(eventNow.getTime() - 45 * 60000);
    await persistDexPairs(connection, [fixturePair(1000, eventNow)]);
    const updated = calculateTokenRisk(
      defaultTokens[0]!,
      [fixturePair(1000, eventNow)],
      [],
      { ...fixtureSecurity(), provenance: tokenProvenance(older) },
      [],
      eventNow,
    );
    await persistTokenRisk(connection, [updated]);
    const timedMemo = analystMemoSchema.parse(
      await runAnalyst(
        { ...scoped, tools: ['risk'] },
        (t) => readAnalystEvidence(connection, scoped, t, eventNow),
        eventNow,
      ),
    );
    const contract = timedMemo.derivedSignals.find(
      (e) => e.label === 'contract_risk',
    );
    expect(contract?.value).toBe(0);
    expect(contract?.provenance.sourceTimestamp).toBe(older.toISOString());
    expect(contract?.provenance.source).toBe('synthetic-tests-only');
    expect(contract?.state).toBe('STALE');
    expect(
      (await readAnalystEvidence(connection, request, 'risk', eventNow)).state,
    ).toBe('EMPTY');
  });
  it('projects tracked-wallet counts without raw transactions or asset-flow/ownership claims', async () => {
    await configureWallets(connection, [
      {
        address: walletAddress,
        label: 'SYNTHETIC QA WALLET — NOT LIVE',
        labelSource: 'operator',
      },
    ]);
    await persistWalletHistory(
      connection,
      walletAddress,
      [walletTx()],
      false,
      eventNow,
    );
    const scoped = { ...request, asset: 'SOL' as const };
    const result = await readAnalystEvidence(
      connection,
      scoped,
      'wallet',
      eventNow,
    );
    expect(result.state).toBe('READY');
    expect(result.evidence[0]?.value).toBe(1);
    expect(result.evidence[0]?.unit).toBe('observed records');
    expect(result.limitation).toContain('no asset-specific flow');
    expect(JSON.stringify(result)).not.toContain(walletTx().signature);
    expect(result.evidence[0]?.provenance.quality).toBe('DERIVED');
    await expect(
      readAnalystEvidence(
        connection,
        { ...request, tools: ['market'] },
        'wallet',
        eventNow,
      ),
    ).rejects.toThrow('TOOL_OUTSIDE_SCOPE');
  });
  it('retrieves source values without DB writes, excludes future collection and withholds missing families', async () => {
    await persistObservations(connection, {
      snapshots: [
        {
          marketId: eventMarket.id,
          price: 100,
          change24h: 2,
          quoteVolume24h: 1000,
          provenance: {
            providerId: 'binance:spot',
            source: 'SYNTHETIC QA FIXTURE — NOT LIVE',
            sourceTimestamp: eventNow.toISOString(),
            ingestedAt: eventNow.toISOString(),
            quality: 'DIRECT',
          },
        },
      ],
    });
    const before =
      await connection.client`SELECT count(*)::int AS count FROM market_snapshots`;
    const memo = await runAnalyst(
      request,
      (t) => readAnalystEvidence(connection, request, t, eventNow),
      eventNow,
    );
    expect(analystMemoSchema.safeParse(memo).success).toBe(true);
    expect(memo.facts.find((e) => e.label === 'price')?.value).toBe(100);
    expect(memo.sources[0]?.provenance.quality).toBe('DIRECT');
    expect(memo.providerState).toBe('NOT_CONFIGURED');
    expect(memo.interpretations).toEqual([]);
    expect(memo.toolResults.find((t) => t.tool === 'wallet')?.state).toBe(
      'EMPTY',
    );
    expect(
      await connection.client`SELECT count(*)::int AS count FROM market_snapshots`,
    ).toEqual(before);
    await connection.client`UPDATE market_snapshots SET ingested_at=${new Date(eventNow.getTime() + 1000).toISOString()}`;
    expect(
      (await readAnalystEvidence(connection, request, 'market', eventNow))
        .evidence,
    ).toEqual([]);
  });
  it('keeps event release citations and macro period/collection time distinct in small projections', async () => {
    await importEvents(connection, [eventFixture], eventNow);
    await persistMacro(connection, [macroFixture()], eventNow);
    const events = await readAnalystEvidence(
        connection,
        request,
        'events',
        eventNow,
      ),
      macro = await readAnalystEvidence(connection, request, 'macro', eventNow);
    expect(events.evidence).toHaveLength(1);
    expect(events.evidence[0]?.value).toBe(eventFixture.title);
    expect(events.evidence[0]?.unit).toBe('release title');
    expect(events.evidence[0]?.provenance.source).toBe(eventFixture.source);
    expect(events.evidence[0]?.provenance.sourceTimestamp).toBe(
      eventFixture.timestamp,
    );
    expect(macro.evidence).toHaveLength(1);
    expect(macro.evidence[0]?.label).toBe('period_2026-09-01');
    expect(macro.evidence[0]?.provenance.ingestedAt).toBe(
      eventNow.toISOString(),
    );
    expect(JSON.stringify(macro).length).toBeLessThan(2000);
  });
  it('retrieves capped provider statuses and stale evidence never implies fresh market data', async () => {
    await recordProviderRun(
      connection,
      'fred',
      new Date(eventNow.getTime() - 3 * 3600000),
      'SUCCESS',
      1,
    );
    await connection.client`UPDATE provider_health SET last_success_at=${new Date(eventNow.getTime() - 3 * 3600000).toISOString()},updated_at=${eventNow.toISOString()} WHERE provider_id='fred'`;
    const memo = await runAnalyst(
      { ...request, tools: ['providers'] },
      (t) => readAnalystEvidence(connection, request, t, eventNow),
      eventNow,
    );
    expect(memo.derivedSignals[0]?.state).toBe('STALE');
    expect(memo.confidence).toBe('INSUFFICIENT');
    expect(memo.counterEvidence.join(' ')).toContain('STALE');
    expect(memo.interpretations).toEqual([]);
  });
});
