import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '@terminal/db';
import { removeHeartbeat, saveHeartbeat } from '@terminal/db/heartbeat';
import { readEnvironment } from '@terminal/domain/environment';
import { isHeartbeatFresh } from '@terminal/domain/health';
import { MarketEngine } from './market-engine';

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
  const marketEngine =
    config.MARKET_INGESTION_ENABLED === 'false'
      ? undefined
      : new MarketEngine(connection, config);

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
        mode: marketEngine ? 'market-core' : 'idle',
        ingestion: marketEngine ? 'RUNNING' : 'DISABLED',
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
  marketEngine?.start();

  async function shutdown(exitCode: number) {
    if (stopping) return;
    stopping = true;
    clearTimeout(timer);
    const deadline = setTimeout(() => process.exit(1), 8000);
    deadline.unref();
    await marketEngine?.stop();
    await pending;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      await removeHeartbeat(connection, instanceId);
    } catch {
      console.error(
        'Worker shutdown: heartbeat cleanup unavailable. It will age out.',
      );
    } finally {
      await connection.client.end({ timeout: 3 });
      clearTimeout(deadline);
      process.exitCode = exitCode;
    }
  }

  process.once('SIGTERM', () => {
    void shutdown(0);
  });
  process.once('SIGINT', () => {
    void shutdown(0);
  });
  console.info(
    marketEngine
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
