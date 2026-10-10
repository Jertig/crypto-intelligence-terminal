import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import {
  createDatabase,
  type DatabaseConnection,
} from '../../packages/db/src/index';
import { runMigrations } from '../../packages/db/src/migrate';
import {
  saveOperations,
  readOperations,
  researchWritesAllowed,
} from '../../packages/db/src/operations';
import type { Operations } from '../../packages/domain/src/operations';
let c: DatabaseConnection;
const now = new Date('2026-09-02T12:00:00Z'),
  sample: Operations = {
    enabled: true,
    observedAt: now.toISOString(),
    databaseBytes: 100,
    disks: [
      { name: 'database', totalBytes: 1000, availableBytes: 900 },
      { name: 'backups', totalBytes: 1000, availableBytes: 900 },
    ],
    state: 'NORMAL',
    reasons: [],
    backup: null,
  };
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL required');
  const u = new URL(url);
  if (
    u.pathname !== '/terminal_test' ||
    !['localhost', '127.0.0.1'].includes(u.hostname)
  )
    throw new Error('Guarded disposable database required');
  await runMigrations(url);
  c = createDatabase(url);
});
beforeEach(async () => {
  await c.client`TRUNCATE operations_status`;
});
afterAll(async () => {
  await c?.client.end({ timeout: 3 });
});
it('roundtrips one bounded observation and upserts without history growth', async () => {
  await saveOperations(c, sample);
  await saveOperations(c, { ...sample, databaseBytes: 200 });
  expect((await readOperations(c))?.databaseBytes).toBe(200);
  const [r] =
    await c.client`SELECT count(*)::int AS count FROM operations_status`;
  expect(r!.count).toBe(1);
});
it('fails production research writes closed on absent, stale, future, unknown and protective storage', async () => {
  expect(await researchWritesAllowed(c, true, now)).toBe(false);
  expect(await researchWritesAllowed(c, false, now)).toBe(true);
  await saveOperations(c, sample);
  expect(await researchWritesAllowed(c, true, now)).toBe(true);
  expect(
    await researchWritesAllowed(c, true, new Date(now.getTime() + 120001)),
  ).toBe(false);
  expect(
    await researchWritesAllowed(c, true, new Date(now.getTime() - 1)),
  ).toBe(false);
  for (const state of ['UNKNOWN', 'PROTECTED'] as const) {
    await saveOperations(c, { ...sample, state });
    expect(await researchWritesAllowed(c, true, now)).toBe(false);
  }
});
it('enforces the singleton key and payload byte bound at PostgreSQL', async () => {
  await expect(
    c.client`INSERT INTO operations_status(id,observation) VALUES('unbounded','{}')`,
  ).rejects.toThrow();
  await expect(
    c.client`INSERT INTO operations_status(id,observation) VALUES('primary',${JSON.stringify({ x: 'a'.repeat(9000) })}::jsonb)`,
  ).rejects.toThrow();
  await expect(
    saveOperations(c, { ...sample, databaseBytes: -1 }),
  ).rejects.toThrow();
});
