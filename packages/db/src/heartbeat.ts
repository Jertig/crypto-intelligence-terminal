import { and, eq } from 'drizzle-orm';
import type { DatabaseConnection } from './index';
import { workerHeartbeats } from './schema';

export async function saveHeartbeat(
  connection: DatabaseConnection,
  instanceId: string,
  startedAt: Date,
  now: Date,
) {
  await connection.db
    .insert(workerHeartbeats)
    .values({ name: 'primary', instanceId, startedAt, lastSeenAt: now })
    .onConflictDoUpdate({
      target: workerHeartbeats.name,
      set: { instanceId, startedAt, lastSeenAt: now },
    });
}

export async function removeHeartbeat(
  connection: DatabaseConnection,
  instanceId: string,
) {
  await connection.db
    .delete(workerHeartbeats)
    .where(
      and(
        eq(workerHeartbeats.name, 'primary'),
        eq(workerHeartbeats.instanceId, instanceId),
      ),
    );
}
