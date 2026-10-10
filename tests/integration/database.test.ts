import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  type DatabaseConnection,
  providerHealth,
  workerHeartbeats,
} from '../../packages/db/src/index';
import { runMigrations } from '../../packages/db/src/migrate';
import {
  removeHeartbeat,
  saveHeartbeat,
} from '../../packages/db/src/heartbeat';

let connection: DatabaseConnection;
const now = new Date('2026-01-01T00:00:00Z');

beforeAll(async () => {
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error(
      'TEST_DATABASE_URL is required. Integration tests are never silently skipped.',
    );
  const target = new URL(value);
  if (
    target.pathname !== '/terminal_test' ||
    !['127.0.0.1', 'localhost'].includes(target.hostname)
  )
    throw new Error(
      'Tests require a local disposable database named terminal_test.',
    );
  connection = createDatabase(value);
  await connection.client`DROP SCHEMA IF EXISTS public CASCADE`;
  await connection.client`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await connection.client`CREATE SCHEMA public`;
  await runMigrations(value);
  await runMigrations(value);
});
afterEach(async () => {
  if (connection) {
    await connection.client`DELETE FROM provider_health`;
    await connection.client`DELETE FROM worker_heartbeats`;
  }
});
afterAll(async () => {
  if (connection) await connection.client.end({ timeout: 3 });
});

describe('PostgreSQL foundation', () => {
  it('migrates an empty database idempotently without seeding observations', async () => {
    const [migration] =
      await connection.client`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
    const [provider] =
      await connection.client`SELECT count(*)::int AS count FROM provider_health`;
    expect(migration?.count).toBe(5);
    expect(provider?.count).toBe(0);
  });
  it('enforces unique provider records', async () => {
    await connection.client`INSERT INTO provider_health(provider_id,status) VALUES ('fixture-only','DOWN')`;
    await expect(
      connection.client`INSERT INTO provider_health(provider_id,status) VALUES ('fixture-only','DOWN')`,
    ).rejects.toThrow();
  });
  it('rejects unobserved healthy states', async () => {
    await expect(
      connection.client`INSERT INTO provider_health(provider_id,status) VALUES ('fixture-only','HEALTHY')`,
    ).rejects.toThrow();
  });
  it('rejects unknown status and blank identity', async () => {
    await expect(
      connection.client`INSERT INTO provider_health(provider_id,status) VALUES ('fixture-only','UNKNOWN')`,
    ).rejects.toThrow();
    await expect(
      connection.client`INSERT INTO provider_health(provider_id,status) VALUES (' ','DOWN')`,
    ).rejects.toThrow();
  });
  it('preserves observed provider timestamps', async () => {
    await connection.db.insert(providerHealth).values({
      providerId: 'fixture-only',
      status: 'HEALTHY',
      lastSuccessAt: now,
      lastAttemptAt: now,
    });
    const [row] = await connection.db.select().from(providerHealth);
    expect(row?.lastSuccessAt).toEqual(now);
    expect(row?.lastAttemptAt).toEqual(now);
  });
  it('keeps heartbeat upserts bounded to one operational row', async () => {
    const instance = randomUUID();
    await saveHeartbeat(connection, instance, now, now);
    await saveHeartbeat(
      connection,
      instance,
      now,
      new Date(now.getTime() + 5000),
    );
    const rows = await connection.db.select().from(workerHeartbeats);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastSeenAt).toEqual(new Date(now.getTime() + 5000));
  });
  it('does not let an old worker remove a new instance heartbeat', async () => {
    const oldInstance = randomUUID();
    const newInstance = randomUUID();
    await saveHeartbeat(connection, oldInstance, now, now);
    await saveHeartbeat(connection, newInstance, now, now);
    await removeHeartbeat(connection, oldInstance);
    const [row] =
      await connection.client`SELECT instance_id FROM worker_heartbeats`;
    expect(row?.instance_id).toBe(newInstance);
    await removeHeartbeat(connection, newInstance);
    expect(
      await connection.client`SELECT * FROM worker_heartbeats`,
    ).toHaveLength(0);
  });
  it('rejects heartbeat time before worker start', async () => {
    await expect(
      saveHeartbeat(connection, randomUUID(), now, new Date(now.getTime() - 1)),
    ).rejects.toThrow();
  });
  it('rolls back failed transactions without partial operational records', async () => {
    await expect(
      connection.client.begin(async (transaction) => {
        await transaction`INSERT INTO provider_health(provider_id,status) VALUES ('rollback-fixture','DOWN')`;
        throw new Error('Intentional fixture rollback');
      }),
    ).rejects.toThrow('Intentional fixture rollback');
    expect(
      await connection.client`SELECT * FROM provider_health WHERE provider_id='rollback-fixture'`,
    ).toHaveLength(0);
  });
  it('records exactly the five approved quality classes', async () => {
    const classes =
      await connection.client`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid=pg_enum.enumtypid WHERE typname='data_quality' ORDER BY enumsortorder`;
    expect(classes.map((row) => row.enumlabel)).toEqual([
      'DIRECT',
      'AGGREGATED',
      'DERIVED',
      'ESTIMATED',
      'AI_INTERPRETATION',
    ]);
  });
});
