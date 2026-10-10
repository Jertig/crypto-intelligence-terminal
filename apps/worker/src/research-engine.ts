import { setTimeout as delay } from 'node:timers/promises';
import type { DatabaseConnection } from '@terminal/db';
import { evaluateResearch, retainResearch } from '@terminal/db/research';
export class ResearchEngine {
  private readonly abort = new AbortController();
  private task: Promise<void> | undefined;
  constructor(private readonly connection: DatabaseConnection) {}
  start() {
    this.task = this.run();
  }
  async stop() {
    this.abort.abort();
    await this.task;
  }
  private async run() {
    let retained = 0;
    while (!this.abort.signal.aborted) {
      try {
        const now = new Date();
        if (now.getTime() - retained >= 3600000) {
          await retainResearch(this.connection, now);
          retained = now.getTime();
        }
        if (!this.abort.signal.aborted)
          await evaluateResearch(this.connection, now, this.abort.signal);
      } catch {
        if (!this.abort.signal.aborted)
          console.error('Research alerts unavailable: DATABASE_UNAVAILABLE');
      }
      await delay(60000, undefined, { signal: this.abort.signal }).catch(
        () => undefined,
      );
    }
  }
}
