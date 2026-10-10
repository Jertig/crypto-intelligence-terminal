import {
  operationsSchema,
  ingestionAllowed,
  type Operations,
} from '@terminal/domain/operations';
import { eq } from 'drizzle-orm';
import type { DatabaseConnection } from './index';
import { operationsStatus } from './schema';
export async function saveOperations(c: DatabaseConnection, input: Operations) {
  const observation = operationsSchema.parse(input);
  await c.db
    .insert(operationsStatus)
    .values({ id: 'primary', observation })
    .onConflictDoUpdate({ target: operationsStatus.id, set: { observation } });
}
export async function readOperations(
  c: DatabaseConnection,
): Promise<Operations | null> {
  const [row] = await c.db
    .select()
    .from(operationsStatus)
    .where(eq(operationsStatus.id, 'primary'))
    .limit(1);
  return row ? operationsSchema.parse(row.observation) : null;
}
export async function researchWritesAllowed(
  c: DatabaseConnection,
  enabled: boolean,
  now = new Date(),
) {
  return !enabled || ingestionAllowed(await readOperations(c), now);
}
