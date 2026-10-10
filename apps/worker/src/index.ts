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

async function start() {
  const config = readEnvironment(process.env, true);
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
  const connection = createDatabase(config.DATABASE_URL);
  const instanceId = randomUUID();
  const walletEngine = new WalletEngine(connection, config);
  const macroEngine = new MacroEngine(connection, config.FRED_API_KEY);
  const researchEngine = new ResearchEngine(connection);
  const startedAt = new Date();
  let lastSuccessAt: Date | null = null;
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  const marketEngine =
    config.MARKET_INGESTION_ENABLED === 'false'
      ? undefined
      : new MarketEngine(connection, config);
  const tokenEngine =
    config.TOKEN_INGESTION_ENABLED === 'true' ||
    (config.TOKEN_INGESTION_ENABLED !== 'false' &&
      config.MARKET_INGESTION_ENABLED !== 'false')
      ? new TokenEngine(connection, config)
      : undefined;

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
  tokenEngine?.start();
  walletEngine.start();
  macroEngine.start();
  researchEngine.start();

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
      ...(marketEngine ? [marketEngine.stop()] : []),
      ...(tokenEngine ? [tokenEngine.stop()] : []),
      walletEngine.stop(),
      macroEngine.stop(),
      researchEngine.stop(),
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
