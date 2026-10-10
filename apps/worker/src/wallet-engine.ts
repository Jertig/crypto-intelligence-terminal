import { setTimeout as delay } from 'node:timers/promises';
import { configuredWallets } from '@terminal/domain/wallets';
import {
  HeliusProvider,
  collectWalletHistory,
} from '@terminal/providers/helius';
import { ProviderError } from '@terminal/providers';
import type { DatabaseConnection } from '@terminal/db';
import {
  configureWallets,
  persistWalletHistory,
  reserveWalletRequest,
  queryWallets,
  markWalletAttempt,
  retainWalletHistory,
} from '@terminal/db/wallets';
import { recordProviderRun } from '@terminal/db/market';
import { markTokenProviderPartial } from '@terminal/db/tokens';
export class WalletEngine {
  private readonly abort = new AbortController();
  private task: Promise<void> | undefined;
  private readonly wallets;
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly config: {
      HELIUS_API_KEY?: string | undefined;
      TRACKED_WALLETS?: string | undefined;
    },
  ) {
    this.wallets = configuredWallets(config.TRACKED_WALLETS);
  }
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
    let initialized = false,
      nextRetention = 0;
    while (!this.abort.signal.aborted) {
      const started = new Date();
      let rows = 0,
        successes = 0,
        partial = false,
        failure: unknown;
      try {
        if (!initialized) {
          await configureWallets(this.connection, this.wallets);
          initialized = true;
        }
        if (Date.now() >= nextRetention) {
          await retainWalletHistory(
            this.connection,
            new Date(),
            this.abort.signal,
          );
          nextRetention = Date.now() + 3600000;
        }
        if (!this.config.HELIUS_API_KEY || !this.wallets.length) {
          await recordProviderRun(
            this.connection,
            'helius',
            started,
            'FAILED',
            0,
            !this.config.HELIUS_API_KEY
              ? 'CREDENTIALS_NOT_CONFIGURED'
              : 'WALLET_UNIVERSE_EMPTY',
          );
          await this.wait(900000);
          continue;
        }
        const provider = new HeliusProvider({
          apiKey: this.config.HELIUS_API_KEY,
          signal: this.abort.signal,
          fetchFn: async (input, options) => {
            if (!(await reserveWalletRequest(this.connection)))
              throw new ProviderError('LOCAL_BUDGET_EXHAUSTED');
            const address = new URL(String(input)).pathname.split('/')[3];
            if (!address) throw new Error('INVALID_WALLET_REQUEST');
            await markWalletAttempt(this.connection, address);
            return fetch(input, options);
          },
        });
        const observed = await queryWallets(this.connection);
        const wallets = [...this.wallets].sort((a, b) =>
          (
            observed.wallets.find((w) => w.address === a.address)
              ?.lastAttemptAt ?? ''
          ).localeCompare(
            observed.wallets.find((w) => w.address === b.address)
              ?.lastAttemptAt ?? '',
          ),
        );
        for (const wallet of wallets) {
          if (this.abort.signal.aborted) break;
          try {
            const batch = await collectWalletHistory(provider, wallet.address);
            if (this.abort.signal.aborted) break;
            const { transactions, truncated } = batch;
            if (batch.error) failure = batch.error;
            partial ||= truncated;
            rows += await persistWalletHistory(
              this.connection,
              wallet.address,
              transactions,
              truncated,
            );
            successes++;
            if (
              batch.error instanceof ProviderError &&
              ['RATE_LIMIT', 'LOCAL_BUDGET_EXHAUSTED'].includes(
                batch.error.code,
              )
            )
              break;
          } catch (error) {
            failure = error;
            partial = true;
            if (
              error instanceof ProviderError &&
              ['RATE_LIMIT', 'LOCAL_BUDGET_EXHAUSTED'].includes(error.code)
            )
              break;
          }
          await this.wait(1000);
        }
        if (this.abort.signal.aborted) break;
        await recordProviderRun(
          this.connection,
          'helius',
          started,
          failure && !successes ? 'FAILED' : 'SUCCESS',
          rows,
          failure instanceof ProviderError ? failure.code : null,
        );
        if (partial && (!failure || successes))
          await markTokenProviderPartial(this.connection, 'helius');
      } catch {
        console.error(
          'Wallet ingestion unavailable: DATABASE_OR_CONFIGURATION_ERROR',
        );
      }
      await this.wait(
        Math.max(
          900000,
          failure instanceof ProviderError ? failure.retryAfterMs : 0,
        ),
      );
    }
  }
}
