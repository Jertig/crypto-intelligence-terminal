import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function createDatabase(url: string) {
  const client = postgres(url, {
    max: 2,
    connect_timeout: 3,
    idle_timeout: 10,
    prepare: false,
  });
  return { client, db: drizzle(client, { schema }) };
}

export type DatabaseConnection = ReturnType<typeof createDatabase>;
export { providerHealth, workerHeartbeats } from './schema';
