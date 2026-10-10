import { setTimeout as delay } from 'node:timers/promises';
import {
  DexScreenerProvider,
  GoPlusProvider,
} from '@terminal/providers/token-data';
import { ProviderError, retryDelay } from '@terminal/providers';
import { configuredTokens } from '@terminal/domain/token-risk';
import type { DatabaseConnection } from '@terminal/db';
import {
  configureTokenUniverse,
  persistDexPairs,
  persistTokenSecurity,
  computeTokenRisk,
  retainTokenHistory,
  markTokenProviderPartial,
} from '@terminal/db/tokens';
import { recordProviderRun } from '@terminal/db/market';

export class TokenEngine {
  private readonly abort = new AbortController();
  private readonly tokens;
  private readonly dex;
  private readonly security;
  private task: Promise<void> | undefined;
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly config: {
      TOKEN_UNIVERSE?: string | undefined;
      GOPLUS_API_KEY?: string | undefined;
      GOPLUS_ENABLED?: string | undefined;
    },
  ) {
    this.tokens = configuredTokens(config.TOKEN_UNIVERSE);
    this.dex = new DexScreenerProvider({ signal: this.abort.signal });
    this.security = new GoPlusProvider({
      signal: this.abort.signal,
      ...(config.GOPLUS_API_KEY ? { apiKey: config.GOPLUS_API_KEY } : {}),
    });
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
  private async audit(
    provider: string,
    started: Date,
    rows: number,
    error?: unknown,
    partial = false,
  ) {
    if (this.abort.signal.aborted) return;
    try {
      await recordProviderRun(
        this.connection,
        provider,
        started,
        error ? 'FAILED' : 'SUCCESS',
        rows,
        error instanceof ProviderError
          ? error.code
          : error
            ? 'PERSISTENCE_OR_CONFIGURATION_ERROR'
            : null,
      );
      if (partial && !error)
        await markTokenProviderPartial(this.connection, provider);
    } catch {
      console.error('Token provider audit unavailable: DATABASE_UNAVAILABLE');
    }
  }
  private async run() {
    let initialized = false,
      nextDex = 0,
      nextSecurity = 0,
      lastRetention = 0,
      attempt = 0;
    while (!this.abort.signal.aborted) {
      try {
        if (!initialized) {
          await configureTokenUniverse(this.connection, this.tokens);
          initialized = true;
        }
        let changed = false;
        if (Date.now() >= nextDex) {
          const started = new Date();
          try {
            const pairs = await this.dex.getPairs(this.tokens);
            if (this.abort.signal.aborted) break;
            const rows = await persistDexPairs(this.connection, pairs);
            await this.audit(
              'dexscreener',
              started,
              rows,
              undefined,
              new Set(pairs.map((p) => p.tokenId)).size < this.tokens.length,
            );
            attempt = 0;
            nextDex = Date.now() + 900000;
          } catch (error) {
            await this.audit('dexscreener', started, 0, error);
            nextDex =
              Date.now() +
              Math.max(
                60000,
                retryDelay(
                  attempt++,
                  error instanceof ProviderError ? error.retryAfterMs : 0,
                ),
              );
          }
          changed = true;
        }
        if (
          this.config.GOPLUS_ENABLED !== 'false' &&
          Date.now() >= nextSecurity
        ) {
          const started = new Date();
          let rows = 0,
            failure: unknown;
          for (const token of this.tokens) {
            if (this.abort.signal.aborted) break;
            try {
              const value = await this.security.getSecurity(token);
              if (this.abort.signal.aborted) break;
              await persistTokenSecurity(this.connection, value);
              rows++;
            } catch (error) {
              failure = error;
              if (error instanceof ProviderError && error.code === 'RATE_LIMIT')
                break;
            }
            await this.wait(1000);
          }
          await this.audit(
            'goplus',
            started,
            rows,
            rows ? undefined : failure,
            rows > 0 && rows < this.tokens.length,
          );
          nextSecurity =
            Date.now() +
            (rows === this.tokens.length
              ? 3600000
              : Math.max(
                  300000,
                  failure instanceof ProviderError ? failure.retryAfterMs : 0,
                ));
          changed = true;
        }
        if (this.abort.signal.aborted) break;
        if (changed) {
          const count = await computeTokenRisk(
            this.connection,
            this.tokens,
            new Date(),
            this.abort.signal,
          );
          console.info(
            `Token risk batch completed: ${count} configured tokens; sources and coverage retained.`,
          );
        }
        if (Date.now() - lastRetention >= 3600000) {
          const removed = await retainTokenHistory(this.connection);
          lastRetention = Date.now();
          console.info(
            `Token retention completed: ${removed} expired records removed.`,
          );
        }
      } catch {
        if (!this.abort.signal.aborted)
          console.error(
            'Token engine batch unavailable: PERSISTENCE_OR_CONFIGURATION_ERROR',
          );
      }
      await this.wait(10000);
    }
  }
}
