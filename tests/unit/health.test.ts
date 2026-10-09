import { describe, expect, it } from 'vitest';
import {
  isHeartbeatFresh,
  providerHealthSchema,
  systemHealth,
} from '../../packages/domain/src/health';
import {
  EnvironmentError,
  readEnvironment,
} from '../../packages/domain/src/environment';

const now = new Date('2026-01-01T00:01:00Z');

describe('environment validation', () => {
  it('permits an unconfigured web shell with safe defaults', () => {
    expect(readEnvironment({})).toEqual({
      WORKER_PORT: 3001,
      HEARTBEAT_INTERVAL_MS: 5000,
    });
    expect(
      readEnvironment({
        DATABASE_URL: '',
        WORKER_PORT: '',
        HEARTBEAT_INTERVAL_MS: '',
      }),
    ).toEqual({
      DATABASE_URL: undefined,
      WORKER_PORT: 3001,
      HEARTBEAT_INTERVAL_MS: 5000,
    });
  });
  it('requires a database for the worker', () => {
    expect(() => readEnvironment({}, true)).toThrow(EnvironmentError);
  });
  it.each([
    'https://example.com',
    'not-a-uri',
    'postgresql://localhost/terminal',
  ])('rejects unsafe database configuration %s', (DATABASE_URL) => {
    expect(() => readEnvironment({ DATABASE_URL })).toThrow(EnvironmentError);
  });
  it.each(['0', '65536', 'not-a-port'])(
    'rejects invalid ports %s',
    (WORKER_PORT) => {
      expect(() => readEnvironment({ WORKER_PORT })).toThrow(EnvironmentError);
    },
  );
  it('rejects excessive or invalid heartbeat intervals', () => {
    expect(() => readEnvironment({ HEARTBEAT_INTERVAL_MS: '60000' })).toThrow(
      EnvironmentError,
    );
  });
  it('does not echo secrets in validation failures', () => {
    expect.assertions(2);
    try {
      readEnvironment({ DATABASE_URL: 'secret-sentinel' });
    } catch (error) {
      expect(String(error)).not.toContain('secret-sentinel');
      expect(String(error)).toContain('DATABASE_URL');
    }
  });
});

describe('system health', () => {
  it('distinguishes liveness from readiness with absent configuration', () => {
    expect(systemHealth('NOT_CONFIGURED', null, now)).toMatchObject({
      status: 'ok',
      ready: false,
      dependencies: { database: 'NOT_CONFIGURED', worker: 'NOT_CONFIGURED' },
    });
  });
  it('does not label unavailable or unstarted dependencies ready', () => {
    expect(systemHealth('UNAVAILABLE', now, now).ready).toBe(false);
    expect(systemHealth('READY', null, now).dependencies.worker).toBe(
      'NOT_STARTED',
    );
  });
  it('requires a fresh worker observation for readiness', () => {
    expect(systemHealth('READY', now, now).ready).toBe(true);
    expect(
      systemHealth('READY', new Date(now.getTime() - 30001), now).dependencies
        .worker,
    ).toBe('STALE');
  });
  it('handles the exact stale boundary, invalid dates, and future observations', () => {
    expect(isHeartbeatFresh(new Date(now.getTime() - 30000), now)).toBe(true);
    expect(isHeartbeatFresh(new Date('invalid'), now)).toBe(false);
    expect(isHeartbeatFresh(new Date(now.getTime() + 1), now)).toBe(false);
  });
  it('rejects a healthy provider with no successful observation', () => {
    expect(
      providerHealthSchema.safeParse({
        providerId: 'fixture-only',
        status: 'HEALTHY',
        lastSuccessAt: null,
        lastAttemptAt: null,
        updatedAt: now.toISOString(),
        errorCode: null,
      }).success,
    ).toBe(false);
  });
  it('does not invent a health state for an unconfigured provider', () => {
    expect(
      providerHealthSchema.safeParse({ status: 'NOT_CONFIGURED' }).success,
    ).toBe(false);
    expect(systemHealth('READY', now, now).providers).toEqual({
      configured: 0,
      state: 'NOT_CONFIGURED',
    });
  });
});
