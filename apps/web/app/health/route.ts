import { eq } from 'drizzle-orm';
import { workerHeartbeats } from '@terminal/db';
import { configuredDatabase } from '../../lib/database';
import { freshness } from '@terminal/domain/market';
import { systemHealth, type DatabaseState } from '@terminal/domain/health';
import { providerHealth } from '@terminal/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  let database: DatabaseState = 'NOT_CONFIGURED';
  let heartbeat: Date | null = null;
  let providers: { providerId: string; status: string }[] = [];
  try {
    const connection = configuredDatabase();
    if (connection) {
      try {
        await connection.client`SELECT 1`;
        const [record] = await connection.db
          .select({ lastSeenAt: workerHeartbeats.lastSeenAt })
          .from(workerHeartbeats)
          .where(eq(workerHeartbeats.name, 'primary'))
          .limit(1);
        heartbeat = record?.lastSeenAt ?? null;
        database = 'READY';
        const health = await connection.db
          .select({
            providerId: providerHealth.providerId,
            status: providerHealth.status,
            lastSuccessAt: providerHealth.lastSuccessAt,
          })
          .from(providerHealth)
          .limit(30);
        providers = health.map((row) => ({
          providerId: row.providerId,
          status:
            row.lastSuccessAt &&
            freshness(
              row.lastSuccessAt,
              new Date(),
              row.providerId.includes('perpetual') ? 600000 : 90000,
            ) === 'STALE'
              ? 'STALE'
              : row.status,
        }));
      } catch {
        database = 'UNAVAILABLE';
      }
    }
  } catch {
    return Response.json(
      { status: 'error', ready: false, error: 'INVALID_CONFIGURATION' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const result = {
    ...systemHealth(database, heartbeat, new Date()),
    phase: 2,
    providers: {
      configured: new Set(providers.map((row) => row.providerId.split(':')[0]))
        .size,
      state: providers.length ? 'OBSERVED' : 'NOT_CONFIGURED',
      capabilities: providers,
    },
    ingestion: providers.length ? 'OBSERVED' : 'WAITING_OR_DISABLED',
  };
  const readinessRequested =
    new URL(request.url).searchParams.get('ready') === '1';
  return Response.json(result, {
    status: readinessRequested && !result.ready ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
