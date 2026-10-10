import { statfs, open } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import type { DatabaseConnection } from '@terminal/db';
import { saveOperations } from '@terminal/db/operations';
import { runMarketRetention } from '@terminal/db/market';
import { retainIntelligence } from '@terminal/db/intelligence';
import { retainTokenHistory } from '@terminal/db/tokens';
import { retainWalletHistory } from '@terminal/db/wallets';
import { retainMacroHistory } from '@terminal/db/events';
import { retainResearch } from '@terminal/db/research';
import {
  backupStatusSchema,
  storageState,
  ingestionAllowed,
  type Operations,
} from '@terminal/domain/operations';

// One serial observer in the existing worker, independent of provider credentials.
export class OperationsEngine {
  private readonly abort = new AbortController();
  private task: Promise<void> | undefined;
  private allowed = false;
  private retained = 0;
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly enabled: boolean,
    private readonly change: (allowed: boolean) => Promise<void>,
    private readonly observe?: () => Promise<Operations>,
  ) {}
  start() {
    this.task = this.run();
  }
  async stop() {
    this.abort.abort();
    await this.task;
  }
  private async sample(): Promise<Operations> {
    const now = new Date(),
      disks: Operations['disks'] = [];
    let databaseBytes: number | null = null,
      backup: Operations['backup'] = null;
    try {
      const [row] = await this.connection
        .client`SELECT pg_database_size(current_database())::text AS bytes`;
      databaseBytes = Number(row!.bytes);
      if (this.enabled) {
        for (const [name, path] of [
          ['database', '/capacity'],
          ['backups', '/operations'],
        ] as const) {
          const s = await statfs(path);
          disks.push({
            name,
            totalBytes: s.blocks * s.bsize,
            availableBytes: s.bavail * s.bsize,
          });
        }
      }
    } catch {
      /* Incomplete measurements produce UNKNOWN, never a guessed value. */
    }
    if (this.enabled) {
      try {
        const file = await open('/operations/backup-status.json', 'r');
        try {
          const f = Buffer.alloc(4097);
          const { bytesRead } = await file.read(f, 0, f.length, 0);
          if (bytesRead <= 4096)
            backup = backupStatusSchema.parse(
              JSON.parse(f.subarray(0, bytesRead).toString('utf8')),
            );
        } finally {
          await file.close();
        }
      } catch {
        /* Missing/malformed backup status stays explicitly unavailable. */
      }
    }
    return {
      enabled: this.enabled,
      observedAt: now.toISOString(),
      databaseBytes,
      disks,
      backup,
      ...storageState(databaseBytes, disks, this.enabled),
    };
  }
  private async maintain() {
    if (Date.now() - this.retained < 3600000) return;
    const signal = this.abort.signal;
    const steps = [
      () => runMarketRetention(this.connection),
      () => retainIntelligence(this.connection),
      () => retainTokenHistory(this.connection),
      () => retainWalletHistory(this.connection, new Date(), signal),
      () => retainMacroHistory(this.connection, new Date(), signal),
      () => retainResearch(this.connection),
    ];
    for (const step of steps) {
      if (signal.aborted) return;
      await step();
    }
    this.retained = Date.now();
  }
  async tick() {
    if (this.abort.signal.aborted) return;
    try {
      const sample = this.observe ? await this.observe() : await this.sample();
      const allowed = !this.enabled || ingestionAllowed(sample);
      // Pause first, so a failed status write cannot leave provider ingestion running.
      if (!allowed && this.allowed) {
        this.allowed = false;
        await this.change(false);
      }
      await saveOperations(this.connection, sample);
      if (allowed && !this.allowed && !this.abort.signal.aborted) {
        this.allowed = true;
        await this.change(true);
      }
      await this.maintain();
    } catch {
      if (this.enabled && this.allowed) {
        this.allowed = false;
        await this.change(false);
      }
      if (!this.abort.signal.aborted)
        console.error(
          'Operations unavailable; protected ingestion and retained evidence remain explicit.',
        );
    }
  }
  private async run() {
    while (!this.abort.signal.aborted) {
      await this.tick();
      await delay(60000, undefined, { signal: this.abort.signal }).catch(
        () => undefined,
      );
    }
  }
}
