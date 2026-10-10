import { createDatabase, type DatabaseConnection } from '@terminal/db';
import { removeHeartbeat } from '@terminal/db/heartbeat';

/** Cancel queued/active ingestion before waiting; cleanup must not queue behind it. */
export async function drainWorkerDatabase(
  connection: DatabaseConnection,
  databaseUrl: string,
  instanceId: string,
  stoppingTasks: Promise<unknown>[],
) {
  await Promise.allSettled([
    ...stoppingTasks,
    connection.client.end({ timeout: 1 }),
  ]);
  const cleanup = createDatabase(databaseUrl);
  try {
    await removeHeartbeat(cleanup, instanceId);
  } catch {
    console.error(
      'Worker shutdown: heartbeat cleanup unavailable. It will age out.',
    );
  } finally {
    await cleanup.client.end({ timeout: 1 });
  }
}
