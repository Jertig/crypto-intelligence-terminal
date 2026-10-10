import { setTimeout as delay } from 'node:timers/promises';
import { macroSeries } from '@terminal/domain/events';
import { FredProvider } from '@terminal/providers/fred';
import { ProviderError } from '@terminal/providers';
import type { DatabaseConnection } from '@terminal/db';
import {
  persistMacro,
  computeEventImpacts,
  retainMacroHistory,
} from '@terminal/db/events';
import { recordProviderRun } from '@terminal/db/market';
import { markTokenProviderPartial } from '@terminal/db/tokens';
export class MacroEngine {
  private readonly abort = new AbortController();
  private task: Promise<void> | undefined;
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly key: string | undefined,
  ) {}
  start() {
    this.task = this.run();
  }
  async stop() {
    this.abort.abort();
    await this.task;
  }
  private async wait(ms: number) {
    await delay(ms, undefined, { signal: this.abort.signal }).catch(
      () => undefined,
    );
  }
  private async run() {
    while (!this.abort.signal.aborted) {
      const started = new Date();
      let rows = 0,
        successes = 0,
        failure: unknown;
      try {
        await retainMacroHistory(
          this.connection,
          new Date(),
          this.abort.signal,
        );
        if (this.key) {
          const provider = new FredProvider({
            apiKey: this.key,
            signal: this.abort.signal,
          });
          for (const s of macroSeries) {
            if (this.abort.signal.aborted) break;
            try {
              rows += await persistMacro(
                this.connection,
                await provider.observations(s.id),
              );
              successes++;
            } catch (error) {
              failure = error;
              if (error instanceof ProviderError && error.code === 'RATE_LIMIT')
                break;
            }
            await this.wait(1000);
          }
          if (!this.abort.signal.aborted) {
            await recordProviderRun(
              this.connection,
              'fred',
              started,
              successes ? 'SUCCESS' : 'FAILED',
              rows,
              successes === macroSeries.length
                ? undefined
                : failure instanceof ProviderError
                  ? failure.code
                  : 'UNAVAILABLE',
            );
            if (successes > 0 && successes < macroSeries.length)
              await markTokenProviderPartial(this.connection, 'fred');
          }
        } else
          await recordProviderRun(
            this.connection,
            'fred',
            started,
            'FAILED',
            0,
            'CREDENTIALS_NOT_CONFIGURED',
          );
        if (!this.abort.signal.aborted)
          await computeEventImpacts(
            this.connection,
            new Date(),
            this.abort.signal,
          );
      } catch {
        if (!this.abort.signal.aborted)
          console.error('Macro/event batch unavailable: DATABASE_UNAVAILABLE');
      }
      await this.wait(3600000);
    }
  }
}
