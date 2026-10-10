import { beforeEach, it, expect, vi } from 'vitest';
import { createDatabase } from '../../packages/db/src/index';
import { OperationsEngine } from '../../apps/worker/src/operations-engine';
import type { Operations } from '../../packages/domain/src/operations';
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  market: vi.fn(),
  features: vi.fn(),
  tokens: vi.fn(),
  wallets: vi.fn(),
  macro: vi.fn(),
  research: vi.fn(),
}));
vi.mock('../../packages/db/src/operations', () => ({
  saveOperations: mocks.save,
}));
vi.mock('../../packages/db/src/market', () => ({
  runMarketRetention: mocks.market,
}));
vi.mock('../../packages/db/src/intelligence', () => ({
  retainIntelligence: mocks.features,
}));
vi.mock('../../packages/db/src/tokens', () => ({
  retainTokenHistory: mocks.tokens,
}));
vi.mock('../../packages/db/src/wallets', () => ({
  retainWalletHistory: mocks.wallets,
}));
vi.mock('../../packages/db/src/events', () => ({
  retainMacroHistory: mocks.macro,
}));
vi.mock('../../packages/db/src/research', () => ({
  retainResearch: mocks.research,
}));
const sample = (): Operations => ({
  enabled: true,
  observedAt: new Date().toISOString(),
  databaseBytes: 1,
  disks: [
    { name: 'database', totalBytes: 1000, availableBytes: 900 },
    { name: 'backups', totalBytes: 1000, availableBytes: 900 },
  ],
  state: 'NORMAL',
  reasons: [],
  backup: null,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue(undefined);
});
it('pauses, retains without credentials, and resumes once measurements recover; repeated states do not restart engines', async () => {
  const c = createDatabase('postgresql://test:test@localhost:1/unused'),
    change = vi.fn(async () => {});
  let observation = sample();
  const observe = vi.fn(async () => observation),
    engine = new OperationsEngine(c, true, change, observe);
  try {
    await engine.tick();
    await engine.tick();
    observation = {
      ...sample(),
      state: 'PROTECTED',
      databaseBytes: 8 * 1024 ** 3,
    };
    await engine.tick();
    await engine.tick();
    observation = sample();
    await engine.tick();
    expect(change.mock.calls).toEqual([[true], [false], [true]]);
    for (const [name, fn] of Object.entries(mocks))
      if (name !== 'save') expect(fn).toHaveBeenCalledTimes(1);
    await engine.stop();
    const calls = observe.mock.calls.length;
    await engine.tick();
    expect(observe).toHaveBeenCalledTimes(calls);
  } finally {
    await engine.stop();
    await c.client.end({ timeout: 1 });
  }
});
it('pauses on failed status persistence and does not start on an unknown initial measurement', async () => {
  const c = createDatabase('postgresql://test:test@localhost:1/unused'),
    change = vi.fn(async () => {});
  let observation: Operations = {
    ...sample(),
    databaseBytes: null,
    disks: [],
    state: 'UNKNOWN',
  };
  const engine = new OperationsEngine(c, true, change, async () => observation),
    log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await engine.tick();
    expect(change).not.toHaveBeenCalled();
    expect(mocks.research).toHaveBeenCalledOnce();
    observation = sample();
    await engine.tick();
    mocks.save.mockRejectedValueOnce(new Error('SYNTHETIC DATABASE FAILURE'));
    await engine.tick();
    expect(change.mock.calls).toEqual([[true], [false]]);
    expect(log).toHaveBeenCalledOnce();
  } finally {
    log.mockRestore();
    await engine.stop();
    await c.client.end({ timeout: 1 });
  }
});
