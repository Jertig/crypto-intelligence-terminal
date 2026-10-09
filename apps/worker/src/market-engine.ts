import { setTimeout as delay } from 'node:timers/promises';
import { BinanceProvider, normalizeStream } from '@terminal/providers/binance';
import { BinanceStream } from '@terminal/providers/stream';
import { ProviderError, retryDelay } from '@terminal/providers';
import {
  persistMarkets,
  persistObservations,
  recordProviderRun,
  runMarketRetention,
} from '@terminal/db/market';
import type { DatabaseConnection } from '@terminal/db';
import type { Candle, Market, Snapshot } from '@terminal/domain/market';

const defaultSymbols = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'SUIUSDT',
  'AAVEUSDT',
  'NEARUSDT',
];
export class MarketEngine {
  private readonly abort = new AbortController();
  private readonly provider: BinanceProvider;
  private stream: BinanceStream | undefined;
  private latest = new Map<string, Snapshot>();
  private closedCandles = new Map<string, Candle>();
  private markets: Market[] = [];
  private loops: Promise<void>[] = [];
  private streamState = 'NOT_CONNECTED';
  private streamObserved = 0;
  private lastStreamLog = 0;
  private lastRetention = 0;
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly config: {
      BINANCE_REST_BASE_URL?: string | undefined;
      BINANCE_FUTURES_BASE_URL?: string | undefined;
      BINANCE_WS_BASE_URL?: string | undefined;
      MARKET_SYMBOLS?: string | undefined;
    },
  ) {
    this.provider = new BinanceProvider({
      ...(config.BINANCE_REST_BASE_URL
        ? { spotUrl: config.BINANCE_REST_BASE_URL }
        : {}),
      ...(config.BINANCE_FUTURES_BASE_URL
        ? { futuresUrl: config.BINANCE_FUTURES_BASE_URL }
        : {}),
      signal: this.abort.signal,
    });
  }
  private async wait(ms: number) {
    await delay(ms, undefined, { signal: this.abort.signal }).catch(
      () => undefined,
    );
  }
  start() {
    this.loops = [this.spotLoop(), this.flushLoop(), this.derivativeLoop()];
  }
  private errorCode(error: unknown) {
    return error instanceof ProviderError
      ? error.code
      : 'PERSISTENCE_OR_CONFIGURATION_ERROR';
  }
  private async record(
    providerId: string,
    started: Date,
    rows: number,
    error?: unknown,
  ) {
    if (this.abort.signal.aborted) return;
    await recordProviderRun(
      this.connection,
      providerId,
      started,
      error ? 'FAILED' : 'SUCCESS',
      rows,
      error ? this.errorCode(error) : null,
    ).catch(() => {
      console.error('Provider run audit unavailable: DATABASE_UNAVAILABLE');
    });
  }
  private async spotLoop() {
    let attempt = 0;
    let backfilled = false;
    while (!this.abort.signal.aborted) {
      const started = new Date();
      try {
        if (!this.markets.length) {
          const requested =
            this.config.MARKET_SYMBOLS?.split(',') ?? defaultSymbols;
          const available = await this.provider.getMarkets(false, requested);
          const selected = requested.flatMap((symbol) => {
            const value = available.find((market) => market.symbol === symbol);
            return value ? [value] : [];
          });
          if (!selected.length) throw new ProviderError('EMPTY_RESPONSE');
          await persistMarkets(this.connection, selected);
          this.markets = selected;
          this.stream = new BinanceStream({
            symbols: this.markets.map((market) => market.symbol),
            ...(this.config.BINANCE_WS_BASE_URL
              ? { endpoint: this.config.BINANCE_WS_BASE_URL }
              : {}),
            onState: (state) => {
              this.streamState = state;
            },
            onMessage: (data) => {
              const value = normalizeStream(data, this.markets, new Date());
              if (value?.snapshot)
                this.latest.set(value.snapshot.marketId, value.snapshot);
              if (value?.candle) {
                if (this.closedCandles.size >= 1000) {
                  this.streamState = 'BUFFER_LIMIT';
                  return false;
                }
                this.closedCandles.set(
                  `${value.candle.marketId}:${value.candle.openTime}`,
                  value.candle,
                );
              }
              this.streamObserved = Date.now();
              this.streamState = 'CONNECTED';
              return true;
            },
          });
          this.stream.start();
        }
        const snapshots = await this.provider.getSnapshots(this.markets);
        if (!snapshots.length) throw new ProviderError('EMPTY_RESPONSE');
        const rows = await persistObservations(this.connection, { snapshots });
        await this.record(
          'binance:spot',
          started,
          rows,
          snapshots.length !== this.markets.length
            ? new ProviderError('MALFORMED_RESPONSE')
            : undefined,
        );
        attempt = 0;
        if (!backfilled) {
          for (const market of this.markets) {
            for (const timeframe of ['1m', '5m', '1h', '1d'] as const) {
              if (this.abort.signal.aborted) return;
              const candles = await this.provider.getCandles(
                market,
                timeframe,
                timeframe === '1h' ? 1000 : 240,
              );
              await persistObservations(this.connection, { candles });
              await this.wait(250);
            }
          }
          backfilled = true;
        } else {
          // Closed streams supply 1m history; bounded REST fills larger bars and gaps.
          const market =
            this.markets[Math.floor(Date.now() / 60000) % this.markets.length];
          if (market)
            for (const timeframe of ['1m', '5m', '1h', '1d'] as const) {
              const candles = await this.provider.getCandles(
                market,
                timeframe,
                timeframe === '1m' ? 1000 : 10,
              );
              await persistObservations(this.connection, { candles });
              await this.wait(250);
            }
        }
        await this.wait(60000);
      } catch (error) {
        await this.record('binance:spot', started, 0, error);
        const pause =
          error instanceof ProviderError
            ? retryDelay(attempt++, error.retryAfterMs)
            : retryDelay(attempt++);
        await this.wait(pause);
      }
    }
  }
  private async flushLoop() {
    while (!this.abort.signal.aborted) {
      await this.wait(5000);
      if (this.abort.signal.aborted) return;
      try {
        const snapshots = [...this.latest.values()];
        const candles = [...this.closedCandles.values()];
        this.latest.clear();
        this.closedCandles.clear();
        try {
          if (snapshots.length || candles.length)
            await persistObservations(this.connection, { snapshots, candles });
        } catch (error) {
          for (const value of snapshots)
            if (!this.latest.has(value.marketId))
              this.latest.set(value.marketId, value);
          for (const value of candles)
            if (this.closedCandles.size < 1000)
              this.closedCandles.set(
                `${value.marketId}:${value.openTime}`,
                value,
              );
          throw error;
        }
        if (this.markets.length && Date.now() - this.lastStreamLog > 60000) {
          const healthy =
            this.streamState === 'CONNECTED' &&
            Date.now() - this.streamObserved <= 45000;
          await this.record(
            'binance:spot:stream',
            new Date(),
            snapshots.length + candles.length,
            healthy
              ? undefined
              : new ProviderError(
                  this.streamState === 'MALFORMED'
                    ? 'MALFORMED_RESPONSE'
                    : 'UNAVAILABLE',
                ),
          );
          this.lastStreamLog = Date.now();
        }
        if (Date.now() - this.lastRetention > 3600000) {
          const result = await runMarketRetention(this.connection);
          console.info(
            `Market retention completed: ${result.removed} expired records removed.`,
          );
          this.lastRetention = Date.now();
        }
      } catch {
        console.error('Market batch unavailable: DATABASE_UNAVAILABLE');
      }
    }
  }
  private async derivativeLoop() {
    let attempt = 0;
    while (!this.abort.signal.aborted) {
      if (!this.markets.length) {
        await this.wait(5000);
        continue;
      }
      const started = new Date();
      try {
        const available = await this.provider.getMarkets(true);
        const selected = available
          .filter((market) =>
            this.markets.some((spot) => spot.base === market.base),
          )
          .slice(0, 30);
        if (!selected.length) throw new ProviderError('EMPTY_RESPONSE');
        await persistMarkets(this.connection, selected);
        const funding = await this.provider.getFunding(selected);
        if (!funding.length) throw new ProviderError('EMPTY_RESPONSE');
        let rows = await persistObservations(this.connection, { funding });
        for (const market of selected) {
          const oi = await this.provider.getOpenInterest(market);
          rows += await persistObservations(this.connection, { oi: [oi] });
          await this.wait(300);
        }
        await this.record(
          'binance:perpetual',
          started,
          rows,
          funding.length === selected.length
            ? undefined
            : new ProviderError('MALFORMED_RESPONSE'),
        );
        attempt = 0;
        await this.wait(300000);
      } catch (error) {
        await this.record('binance:perpetual', started, 0, error);
        await this.wait(
          Math.max(
            60000,
            retryDelay(
              attempt++,
              error instanceof ProviderError ? error.retryAfterMs : 0,
            ),
          ),
        );
      }
    }
  }
  async stop() {
    this.abort.abort();
    this.stream?.stop();
    await Promise.allSettled(this.loops);
  }
}
