import { eq } from 'drizzle-orm';
import {
  createDatabase,
  workerHeartbeats,
  type DatabaseConnection,
} from '@terminal/db';
import { readEnvironment } from '@terminal/domain/environment';
import { systemHealth, type DatabaseState } from '@terminal/domain/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
let connection: DatabaseConnection | undefined;

export async function GET(request: Request) {
  let database: DatabaseState = 'NOT_CONFIGURED';
  let heartbeat: Date | null = null;
  try {
    const config = readEnvironment(process.env);
    if (config.DATABASE_URL) {
      try {
        connection ??= createDatabase(config.DATABASE_URL);
        await connection.client`SELECT 1`;
        const [record] = await connection.db
          .select({ lastSeenAt: workerHeartbeats.lastSeenAt })
          .from(workerHeartbeats)
          .where(eq(workerHeartbeats.name, 'primary'))
          .limit(1);
        heartbeat = record?.lastSeenAt ?? null;
        database = 'READY';
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
  const result = systemHealth(database, heartbeat, new Date());
  const readinessRequested =
    new URL(request.url).searchParams.get('ready') === '1';
  return Response.json(result, {
    status: readinessRequested && !result.ready ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
