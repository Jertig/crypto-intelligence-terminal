import { describe, it, expect } from 'vitest';
import {
  storageState,
  ingestionAllowed,
  backupState,
  operationsSchema,
  type Operations,
} from '../../packages/domain/src/operations';
import { readEnvironment } from '../../packages/domain/src/environment';
import { sameOriginRequest } from '../../packages/domain/src/request-security';
import {
  retainedBackups,
  validateProduction,
} from '../../infra/ops/terminal.mjs';
const now = new Date('2026-09-02T12:00:00Z');
const disks = (percent: number): Operations['disks'] =>
  ['database', 'backups'].map((name) => ({
    name: name as 'database' | 'backups',
    totalBytes: 1000,
    availableBytes: 1000 - percent * 10,
  }));
const sample: Operations = {
  enabled: true,
  observedAt: now.toISOString(),
  databaseBytes: 1024,
  disks: disks(20),
  state: 'NORMAL',
  reasons: [],
  backup: null,
};
const config: Record<string, string> = {
  POSTGRES_PASSWORD: 'a'.repeat(32),
  POSTGRES_WEB_PASSWORD: 'b'.repeat(32),
  POSTGRES_WORKER_PASSWORD: 'c'.repeat(32),
  ACCESS_USER: 'operator',
  ACCESS_HASH: '$2a$14$' + 'a'.repeat(53),
  APP_ORIGIN: 'https://terminal.example.com',
  WEB_IMAGE: 'sha256:' + 'a'.repeat(64),
  WORKER_IMAGE: 'sha256:' + 'b'.repeat(64),
  POSTGRES_IMAGE: 'sha256:' + 'c'.repeat(64),
  CADDY_IMAGE: 'sha256:' + 'd'.repeat(64),
};
describe('bounded production operations', () => {
  it.each([
    [0, 'NORMAL'],
    [69, 'NORMAL'],
    [70, 'WARNING'],
    [79, 'WARNING'],
    [80, 'URGENT'],
    [89, 'URGENT'],
    [90, 'PROTECTED'],
    [100, 'PROTECTED'],
  ])('classifies %s percent filesystem usage as %s', (percent, state) =>
    expect(storageState(1024, disks(Number(percent)), true).state).toBe(state),
  );
  it('requires both measured filesystems and valid values; absence never implies free space', () => {
    expect(storageState(null, [], true).state).toBe('UNKNOWN');
    expect(storageState(1, [], true).state).toBe('UNKNOWN');
    expect(storageState(1, [disks(10)[0]!, disks(10)[0]!], true).state).toBe(
      'UNKNOWN',
    );
    expect(
      storageState(
        1,
        [{ name: 'database', totalBytes: 100, availableBytes: 101 }],
        false,
      ).state,
    ).toBe('UNKNOWN');
    expect(storageState(1, [], false).state).toBe('NORMAL');
  });
  it('protects the database budget independently of filesystem headroom', () => {
    expect(storageState(6 * 1024 ** 3, disks(20), true).state).toBe('WARNING');
    expect(storageState(8 * 1024 ** 3, disks(20), true).state).toBe(
      'PROTECTED',
    );
  });
  it('allows only current known safe observations; future, stale and protective states fail closed', () => {
    expect(ingestionAllowed(sample, now)).toBe(true);
    expect(ingestionAllowed(sample, new Date(now.getTime() + 120001))).toBe(
      false,
    );
    expect(ingestionAllowed(sample, new Date(now.getTime() - 1))).toBe(false);
    expect(ingestionAllowed(null, now)).toBe(false);
    for (const state of ['PROTECTED', 'UNKNOWN'] as const)
      expect(ingestionAllowed({ ...sample, state }, now)).toBe(false);
    expect(
      operationsSchema.safeParse({
        ...sample,
        disks: [...disks(1), ...disks(1)],
      }).success,
    ).toBe(false);
  });
  it('keeps absent, failed, old and future backup evidence distinct from successful local backup', () => {
    const backup = {
      lastSuccessAt: now.toISOString(),
      bytes: 100,
      digest: 'a'.repeat(64),
      error: null,
    };
    expect(backupState(null, now)).toBe('UNAVAILABLE');
    expect(backupState(backup, now)).toBe('LOCAL_BACKUP');
    expect(backupState(backup, new Date(now.getTime() - 1))).toBe(
      'STALE_OR_FAILED',
    );
    expect(
      backupState(backup, new Date(now.getTime() + 36 * 3600000 + 1)),
    ).toBe('STALE_OR_FAILED');
    expect(backupState({ ...backup, error: 'BACKUP_FAILED' }, now)).toBe(
      'STALE_OR_FAILED',
    );
  });
  it('retains seven daily, four weekly and three monthly latest buckets without duplicating overlapping archives', () => {
    const names = Array.from(
      { length: 100 },
      (_, i) =>
        `terminal-${new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10)}T120000Z.dump`,
    );
    const keep = retainedBackups([
      ...names,
      'unrelated.dump',
      'terminal-2026-02-31T120000Z.dump',
      names[0]!,
    ]);
    expect(keep.length).toBeLessThanOrEqual(14);
    expect(keep).toContain(names[0]);
    for (const name of names.slice(0, 7)) expect(keep).toContain(name);
    expect(
      keep.some((n) => n.includes('2026-08-') || n.includes('2026-07-')),
    ).toBe(true);
    expect(keep).not.toContain('unrelated.dump');
    expect(keep).not.toContain('terminal-2026-02-31T120000Z.dump');
    const sameDay = names[0]!.replace('120000', '140000');
    expect(retainedBackups([names[0]!, sameDay])).toEqual([sameDay]);
  });
  it('requires distinct strong role passwords, hashed gateway access, exact origin and pinned images', () => {
    expect(validateProduction(config)).toBe(true);
    for (const change of [
      { POSTGRES_WEB_PASSWORD: config.POSTGRES_PASSWORD! },
      { ACCESS_HASH: 'plain-password' },
      { APP_ORIGIN: 'http://terminal.example.com' },
      { APP_ORIGIN: 'https://terminal.example.com/path' },
      { APP_ORIGIN: 'https://localhost' },
      { WEB_IMAGE: 'latest' },
      { WORKER_IMAGE: 'latest' },
      { POSTGRES_IMAGE: 'latest' },
      { CADDY_IMAGE: 'latest' },
    ])
      expect(() => validateProduction({ ...config, ...change })).toThrow();
    expect(() =>
      validateProduction({ ...config, AI_ANALYST_ENABLED: 'true' }),
    ).toThrow();
  });
  it('isolates production-like QA and validates application HTTPS origin server-side', () => {
    const qa = {
      ...config,
      APP_ORIGIN: 'https://localhost:18443',
      MARKET_INGESTION_ENABLED: 'false',
      TOKEN_INGESTION_ENABLED: 'false',
    };
    expect(validateProduction(qa, true)).toBe(true);
    expect(() =>
      validateProduction({ ...qa, FRED_API_KEY: 'test-only-key' }, true),
    ).toThrow();
    expect(readEnvironment({ APP_ORIGIN: config.APP_ORIGIN }).APP_ORIGIN).toBe(
      config.APP_ORIGIN,
    );
    expect(() =>
      readEnvironment({ APP_ORIGIN: 'http://terminal.example.com' }),
    ).toThrow();
    const request = new Request('http://internal/api', {
      headers: { Host: 'terminal.example.com', Origin: config.APP_ORIGIN! },
    });
    expect(sameOriginRequest(request, config.APP_ORIGIN)).toBe(true);
    expect(sameOriginRequest(request, 'https://other.example.com')).toBe(false);
  });
});
