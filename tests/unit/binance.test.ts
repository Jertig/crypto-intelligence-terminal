import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BinanceProvider,
  normalizeTicker,
  normalizeStream,
  officialEndpoint,
} from '../../packages/providers/src/binance';
import {
  BinanceStream,
  type StreamSocket,
} from '../../packages/providers/src/stream';
import { ProviderError, retryDelay } from '../../packages/providers/src/index';
import {
  candleSchema,
  freshness,
  retentionCutoff,
  type Market,
} from '../../packages/domain/src/market';

const now = new Date('2026-01-01T00:10:00Z');
const market: Market = {
  id: 'binance:spot:FIXTUREUSDT',
  assetId: 'binance:FIXTURE',
  venueId: 'binance',
  symbol: 'FIXTUREUSDT',
  base: 'FIXTURE',
  quote: 'USDT',
  kind: 'SPOT',
};
const ticker = {
  symbol: market.symbol,
  lastPrice: '10',
  priceChangePercent: '2',
  quoteVolume: '100',
  closeTime: now.getTime(),
};
const provider = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new BinanceProvider({
    now: () => now,
    fetcher: vi.fn(
      async () => new Response(JSON.stringify(body), { status, headers }),
    ),
  });
afterEach(() => vi.useRealTimers());

describe('public Binance normalization and failures', () => {
  it('bounds spot requests to selected symbols and ignores unrelated inactive malformed tickers', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify([ticker, { symbol: 'UNRELATED', lastPrice: '0' }]),
        ),
    );
    const instance = new BinanceProvider({ fetcher });
    expect(await instance.getSnapshots([market])).toHaveLength(1);
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(JSON.parse(url.searchParams.get('symbols') ?? '')).toEqual([
      market.symbol,
    ]);
    expect(() =>
      normalizeTicker(ticker, { ...market, kind: 'PERPETUAL' }, now),
    ).not.toThrow();
    expect(
      normalizeTicker(ticker, { ...market, kind: 'PERPETUAL' }, now).provenance
        .source,
    ).toBe('/fapi/v1/ticker/24hr');
  });
  it('normalizes identity without treating a symbol as globally canonical', async () => {
    const instance = provider({
      symbols: [
        {
          symbol: market.symbol,
          baseAsset: 'FIXTURE',
          quoteAsset: 'USDT',
          status: 'TRADING',
        },
      ],
    });
    expect(await instance.getMarkets()).toEqual([market]);
  });
  it('normalizes timestamped quote-unit observations and websocket messages', async () => {
    expect(await provider([ticker]).getSnapshots([market])).toEqual([
      normalizeTicker(ticker, market, now),
    ]);
    const value = normalizeStream(
      {
        stream: 'fixtureusdt@ticker',
        data: {
          e: '24hrTicker',
          s: market.symbol,
          c: '11',
          P: '3',
          q: '101',
          E: now.getTime(),
        },
      },
      [market],
      now,
    );
    expect(value?.snapshot?.price).toBe(11);
    expect(value?.snapshot?.provenance).toMatchObject({
      quality: 'DIRECT',
      providerId: 'binance:spot',
      sourceTimestamp: now.toISOString(),
    });
  });
  it.each([{}, [{ ...ticker, lastPrice: 'not-numeric' }]])(
    'rejects malformed provider responses',
    async (value) => {
      await expect(
        provider(value).getSnapshots([market]),
      ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    },
  );
  it('rejects empty observations, zero prices, and mismatched symbols', async () => {
    await expect(provider([]).getSnapshots([market])).rejects.toMatchObject({
      code: 'EMPTY_RESPONSE',
    });
    expect(() =>
      normalizeTicker({ ...ticker, lastPrice: '0' }, market, now),
    ).toThrow(ProviderError);
    expect(() =>
      normalizeTicker({ ...ticker, symbol: 'OTHERUSDT' }, market, now),
    ).toThrow(ProviderError);
  });
  it('honors rate limits and bounds backoff', async () => {
    await expect(
      provider({}, 429, { 'retry-after': '120' }).getMarkets(),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT', retryAfterMs: 120000 });
    expect(retryDelay(500, 0, 0)).toBe(60000);
    expect(retryDelay(0, 99999999, 0)).toBe(600000);
  });
  it('sanitizes HTTP and transport errors', async () => {
    await expect(
      provider({ error: 'sensitive upstream detail' }, 500).getMarkets(),
    ).rejects.toMatchObject({ code: 'HTTP_ERROR', message: 'HTTP_ERROR' });
    const instance = new BinanceProvider({
      fetcher: vi.fn(async () => {
        throw new Error('sensitive transport detail');
      }),
    });
    await expect(instance.getMarkets()).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      message: 'UNAVAILABLE',
    });
  });
  it('recognizes timeout without leaking its target', async () => {
    const signal = AbortSignal.abort();
    const instance = new BinanceProvider({
      signal,
      fetcher: vi.fn(async () => {
        throw new Error('aborted');
      }),
    });
    await expect(instance.getMarkets()).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });
  it('rejects oversized bodies and invalid JSON', async () => {
    const instance = new BinanceProvider({
      fetcher: vi.fn(async () => new Response('not-json')),
    });
    await expect(instance.getMarkets()).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
    await expect(
      provider({}, 200, { 'content-length': '9000000' }).getMarkets(),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });
  it('normalizes funding and OI with different units and independent timestamps', async () => {
    const perp: Market = {
      ...market,
      id: 'binance:perpetual:FIXTUREUSDT',
      kind: 'PERPETUAL',
    };
    const funding = await provider([
      {
        symbol: market.symbol,
        markPrice: '10',
        lastFundingRate: '0.0001',
        nextFundingTime: now.getTime() + 1000,
        time: now.getTime(),
      },
    ]).getFunding([perp]);
    expect(funding[0]?.rate).toBe(0.0001);
    const oi = await provider({
      symbol: market.symbol,
      openInterest: '10',
      time: now.getTime(),
    }).getOpenInterest(perp);
    expect(oi.unit).toBe('FIXTURE');
  });
  it('keeps incomplete candles out of historical research', async () => {
    const closed = [
      now.getTime() - 120000,
      '10',
      '12',
      '9',
      '11',
      '100',
      now.getTime() - 60001,
    ];
    const open = [
      now.getTime(),
      '10',
      '12',
      '9',
      '11',
      '100',
      now.getTime() + 59999,
    ];
    expect(
      await provider([closed, open]).getCandles(market, '1m', 2),
    ).toHaveLength(1);
    const invalid = {
      marketId: market.id,
      timeframe: '1m',
      openTime: new Date(closed[0] as number).toISOString(),
      closeTime: new Date(closed[6] as number).toISOString(),
      open: 10,
      high: 8,
      low: 9,
      close: 11,
      volume: 100,
      provenance: normalizeTicker(ticker, market, now).provenance,
    };
    expect(candleSchema.safeParse(invalid).success).toBe(false);
  });
  it('marks stale, future and invalid observations and preserves daily candles', () => {
    expect(freshness(new Date(now.getTime() - 90000), now)).toBe('FRESH');
    expect(freshness(new Date(now.getTime() - 90001), now)).toBe('STALE');
    expect(freshness('invalid', now)).toBe('STALE');
    expect(freshness(new Date(now.getTime() + 6000), now)).toBe('STALE');
    expect(freshness(null, now)).toBe('UNAVAILABLE');
    expect(retentionCutoff('1d', now)).toBeNull();
    expect(retentionCutoff('1m', now)?.toISOString()).toBe(
      '2025-12-02T00:10:00.000Z',
    );
  });
  it.each([
    'https://127.0.0.1',
    'https://example.com',
    'https://user:password@data-api.binance.vision',
    'https://data-api.binance.vision/private',
    'http://data-api.binance.vision',
  ])('rejects unsafe endpoint override %s', (url) => {
    expect(() => officialEndpoint(url, 'spot')).toThrow();
  });
});

describe('stream lifecycle', () => {
  it('reconnects and resubscribes with backoff, then stops permanently', () => {
    vi.useFakeTimers();
    const sockets: {
      listeners: Map<string, (data?: unknown) => void>;
      socket: StreamSocket;
    }[] = [];
    const factory = vi.fn(() => {
      const listeners = new Map<string, (data?: unknown) => void>();
      const socket: StreamSocket = {
        on: (type, listener) => {
          listeners.set(type, listener);
        },
        close: () => listeners.get('close')?.(),
      };
      sockets.push({ listeners, socket });
      return socket;
    });
    const states: string[] = [];
    const stream = new BinanceStream({
      symbols: ['FIXTUREUSDT'],
      factory,
      random: () => 0,
      onMessage: () => true,
      onState: (state) => states.push(state),
    });
    stream.start();
    sockets[0]?.listeners.get('open')?.();
    sockets[0]?.listeners.get('message')?.('{"valid":true}');
    sockets[0]?.listeners.get('close')?.();
    vi.advanceTimersByTime(999);
    expect(factory).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory.mock.calls[0]).toEqual(factory.mock.calls[1]);
    expect(states).toContain('RECONNECTING');
    stream.stop();
    vi.advanceTimersByTime(120000);
    expect(factory).toHaveBeenCalledTimes(2);
  });
  it('backs off socket construction failures and cancels recovery on stop', () => {
    vi.useFakeTimers();
    const factory = vi.fn(() => {
      throw new Error('NETWORK_UNAVAILABLE');
    });
    const states: string[] = [];
    const stream = new BinanceStream({
      symbols: ['FIXTUREUSDT'],
      factory,
      random: () => 0,
      onMessage: () => false,
      onState: (state) => states.push(state),
    });
    expect(() => stream.start()).not.toThrow();
    vi.advanceTimersByTime(1000);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(states).toEqual(['RECONNECTING', 'RECONNECTING']);
    stream.stop();
    vi.advanceTimersByTime(120000);
    expect(factory).toHaveBeenCalledTimes(2);
  });
  it('detects silent streams and malformed messages without accepting them as evidence', () => {
    vi.useFakeTimers();
    const listeners = new Map<string, (data?: unknown) => void>();
    const close = vi.fn(() => listeners.get('close')?.());
    const states: string[] = [];
    const onMessage = vi.fn(() => true);
    const stream = new BinanceStream({
      symbols: ['FIXTUREUSDT'],
      factory: () => ({
        on: (type, listener) => {
          listeners.set(type, listener);
        },
        close,
      }),
      random: () => 0,
      onMessage,
      onState: (state) => states.push(state),
    });
    stream.start();
    listeners.get('message')?.('invalid-json');
    expect(onMessage).not.toHaveBeenCalled();
    expect(states).toContain('MALFORMED');
    vi.advanceTimersByTime(50000);
    expect(states).toContain('STALE');
    expect(close).toHaveBeenCalled();
    stream.stop();
  });
});
