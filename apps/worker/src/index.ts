import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '@terminal/db';
import { saveHeartbeat } from '@terminal/db/heartbeat';
import { drainWorkerDatabase } from './shutdown';
import { readEnvironment } from '@terminal/domain/environment';
import { isHeartbeatFresh } from '@terminal/domain/health';
import { MarketEngine } from './market-engine';
import { TokenEngine } from './token-engine';
import { WalletEngine } from './wallet-engine';
import { MacroEngine } from './macro-engine';
import { ResearchEngine } from './research-engine';
import { OperationsEngine } from './operations-engine';

async function start() {
  const config = readEnvironment(process.env, true);
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
  const connection = createDatabase(config.DATABASE_URL);
  const instanceId = randomUUID();
  const startedAt = new Date();
  let lastSuccessAt: Date | null = null;
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  let engines: { start(): void; stop(): Promise<void> }[] = [];
  const operations = new OperationsEngine(
    connection,
    config.STORAGE_GUARD_ENABLED === 'true',
    async (allowed) => {
      if (!allowed || stopping) {
        const previous = engines;
        engines = [];
        await Promise.all(previous.map((engine) => engine.stop()));
      } else if (!engines.length) {
        engines = [
          ...(config.MARKET_INGESTION_ENABLED !== 'false'
            ? [new MarketEngine(connection, config)]
            : []),
          ...(config.TOKEN_INGESTION_ENABLED === 'true' ||
          (config.TOKEN_INGESTION_ENABLED !== 'false' &&
            config.MARKET_INGESTION_ENABLED !== 'false')
            ? [new TokenEngine(connection, config)]
            : []),
          new WalletEngine(connection, config),
          new MacroEngine(connection, config.FRED_API_KEY),
          new ResearchEngine(connection),
        ];
        engines.forEach((engine) => engine.start());
      }
    },
  );

  async function beat() {
    try {
      const now = new Date();
      await saveHeartbeat(connection, instanceId, startedAt, now);
      lastSuccessAt = now;
    } catch {
      lastSuccessAt = null;
      console.error('Worker heartbeat failed: DATABASE_UNAVAILABLE');
    }
  }

  await beat();
  if (!lastSuccessAt) {
    await connection.client.end({ timeout: 3 });
    throw new Error('DATABASE_UNAVAILABLE');
  }

  const server = createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }
    const ready =
      !stopping &&
      lastSuccessAt !== null &&
      isHeartbeatFresh(lastSuccessAt, new Date());
    response.writeHead(ready ? 200 : 503, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    response.end(
      JSON.stringify({
        status: ready ? 'ok' : 'unavailable',
        mode:
          config.MARKET_INGESTION_ENABLED !== 'false' ? 'market-core' : 'idle',
        ingestion: !engines.length
          ? 'PROTECTED_OR_INITIALIZING'
          : config.MARKET_INGESTION_ENABLED !== 'false'
            ? 'RUNNING'
            : 'DISABLED',
      }),
    );
  });

  server.on('error', () => {
    void shutdown(1);
  });
  server.listen(config.WORKER_PORT, '0.0.0.0');
  function schedule() {
    if (stopping) return;
    timer = setTimeout(() => {
      pending = beat().finally(schedule);
    }, config.HEARTBEAT_INTERVAL_MS);
  }
  schedule();
  operations.start();

  async function shutdown(exitCode: number) {
    if (stopping) return;
    stopping = true;
    clearTimeout(timer);
    const deadline = setTimeout(() => process.exit(1), 8000);
    deadline.unref();
    const httpClosed = new Promise<void>((resolve) =>
      server.close(() => resolve()),
    );
    server.closeAllConnections();
    await drainWorkerDatabase(connection, config.DATABASE_URL!, instanceId, [
      operations.stop(),
      ...engines.map((engine) => engine.stop()),
    ]);
    await pending;
    await httpClosed;
    clearTimeout(deadline);
    process.exitCode = exitCode;
  }

  process.once('SIGTERM', () => {
    void shutdown(0);
  });
  process.once('SIGINT', () => {
    void shutdown(0);
  });
  console.info(
    config.MARKET_INGESTION_ENABLED !== 'false'
      ? 'Worker ready. Bounded public market ingestion enabled.'
      : 'Worker ready. Market ingestion explicitly disabled.',
  );
}

start().catch(() => {
  console.error(
    'Worker startup failed. Check environment, migrations, and database connectivity.',
  );
  process.exitCode = 1;
});
