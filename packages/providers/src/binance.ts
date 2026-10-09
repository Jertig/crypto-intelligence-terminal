import { z } from 'zod';
import type { Provenance } from '@terminal/domain';
import {
  candleSchema,
  snapshotSchema,
  fundingSchema,
  openInterestSchema,
  type Market,
  type Timeframe,
  type Snapshot,
} from '@terminal/domain/market';
import { boundedJson, ProviderError, type MarketProvider } from './index';

const numeric = z
  .union([
    z.number().finite(),
    z
      .string()
      .regex(/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i)
      .transform(Number),
  ])
  .refine(Number.isFinite);
const epoch = z.number().int().positive();
const instrument = z.object({
  symbol: z.string().min(1).max(100),
  baseAsset: z.string().min(1).max(100),
  quoteAsset: z.string(),
  status: z.string(),
  contractType: z.string().optional(),
});
const exchange = z.object({ symbols: z.array(instrument).max(15000) });
const restTicker = z.object({
  symbol: z.string(),
  lastPrice: numeric,
  priceChangePercent: numeric,
  quoteVolume: numeric,
  closeTime: epoch,
});
const streamTicker = z.object({
  e: z.literal('24hrTicker'),
  s: z.string(),
  c: numeric,
  P: numeric,
  q: numeric,
  E: epoch,
});
const streamKline = z.object({
  e: z.literal('kline'),
  s: z.string(),
  E: epoch,
  k: z.object({
    t: epoch,
    T: epoch,
    i: z.enum(['1m', '5m', '1h', '1d']),
    o: numeric,
    h: numeric,
    l: numeric,
    c: numeric,
    v: numeric,
    x: z.boolean(),
  }),
});
const premium = z.object({
  symbol: z.string(),
  markPrice: numeric,
  lastFundingRate: numeric,
  nextFundingTime: epoch,
  time: epoch,
});
const oi = z.object({ symbol: z.string(), openInterest: numeric, time: epoch });

export function officialEndpoint(
  value: string,
  kind: 'spot' | 'futures' | 'stream',
) {
  const allowed = {
    spot: [
      'data-api.binance.vision',
      'api.binance.com',
      'api1.binance.com',
      'api2.binance.com',
      'api3.binance.com',
      'api4.binance.com',
    ],
    futures: ['fapi.binance.com'],
    stream: ['data-stream.binance.vision', 'stream.binance.com'],
  }[kind];
  const url = new URL(value);
  if (
    url.protocol !== (kind === 'stream' ? 'wss:' : 'https:') ||
    !allowed.includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/'].includes(url.pathname) ||
    (url.port &&
      !['443', ...(kind === 'stream' ? ['9443'] : [])].includes(url.port))
  )
    throw new Error('INVALID_PROVIDER_ENDPOINT');
  return url.origin;
}
export function provenance(
  providerId: string,
  path: string,
  timestamp: number,
  now: Date,
): Provenance {
  return {
    providerId,
    source: path,
    sourceTimestamp: new Date(timestamp).toISOString(),
    ingestedAt: now.toISOString(),
    quality: 'DIRECT',
  };
}
export function normalizeTicker(
  value: unknown,
  market: Market,
  now: Date,
  stream = false,
): Snapshot {
  const parsed = stream
    ? streamTicker.safeParse(value)
    : restTicker.safeParse(value);
  if (!parsed.success) throw new ProviderError('MALFORMED_RESPONSE');
  const ticker = parsed.data;
  const symbol = 's' in ticker ? ticker.s : ticker.symbol;
  if (symbol !== market.symbol) throw new ProviderError('MALFORMED_RESPONSE');
  const result = snapshotSchema.safeParse({
    marketId: market.id,
    price: 'c' in ticker ? ticker.c : ticker.lastPrice,
    change24h: 'P' in ticker ? ticker.P : ticker.priceChangePercent,
    quoteVolume24h: 'q' in ticker ? ticker.q : ticker.quoteVolume,
    provenance: provenance(
      market.kind === 'SPOT' ? 'binance:spot' : 'binance:perpetual',
      stream
        ? `${market.symbol.toLowerCase()}@ticker`
        : `${market.kind === 'SPOT' ? '/api/v3' : '/fapi/v1'}/ticker/24hr`,
      'E' in ticker ? ticker.E : ticker.closeTime,
      now,
    ),
  });
  if (!result.success) throw new ProviderError('MALFORMED_RESPONSE');
  return result.data;
}
export function normalizeStream(value: unknown, markets: Market[], now: Date) {
  const envelope = z.object({ data: z.unknown() }).safeParse(value);
  const data = envelope.success ? envelope.data.data : value;
  const ticker = streamTicker.safeParse(data);
  if (ticker.success) {
    const market = markets.find((item) => item.symbol === ticker.data.s);
    return market
      ? { snapshot: normalizeTicker(ticker.data, market, now, true) }
      : null;
  }
  const kline = streamKline.safeParse(data);
  if (!kline.success) throw new ProviderError('MALFORMED_RESPONSE');
  const market = markets.find((item) => item.symbol === kline.data.s);
  if (!market || !kline.data.k.x) return null;
  const k = kline.data.k;
  const result = candleSchema.safeParse({
    marketId: market.id,
    timeframe: k.i,
    openTime: new Date(k.t).toISOString(),
    closeTime: new Date(k.T).toISOString(),
    open: k.o,
    high: k.h,
    low: k.l,
    close: k.c,
    volume: k.v,
    provenance: provenance(
      'binance:spot',
      `${market.symbol.toLowerCase()}@kline_${k.i}`,
      kline.data.E,
      now,
    ),
  });
  if (!result.success) throw new ProviderError('MALFORMED_RESPONSE');
  return { candle: result.data };
}

export class BinanceProvider implements MarketProvider {
  readonly spotUrl: string;
  readonly futuresUrl: string;
  constructor(
    private readonly options: {
      spotUrl?: string;
      futuresUrl?: string;
      fetcher?: typeof fetch;
      now?: () => Date;
      signal?: AbortSignal;
      timeoutMs?: number;
    } = {},
  ) {
    this.spotUrl = officialEndpoint(
      options.spotUrl || 'https://data-api.binance.vision',
      'spot',
    );
    this.futuresUrl = officialEndpoint(
      options.futuresUrl || 'https://fapi.binance.com',
      'futures',
    );
  }
  private now() {
    return this.options.now?.() ?? new Date();
  }
  private async get(path: string, futures = false): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 8000);
    const signal = this.options.signal
      ? AbortSignal.any([this.options.signal, timeout])
      : timeout;
    try {
      const response = await (this.options.fetcher ?? fetch)(
        (futures ? this.futuresUrl : this.spotUrl) + path,
        { signal, redirect: 'error' },
      );
      if (response.status === 429 || response.status === 418) {
        const header = response.headers.get('retry-after');
        const delay =
          header && /^\d+$/.test(header)
            ? Number(header) * 1000
            : header
              ? Date.parse(header) - this.now().getTime()
              : 60000;
        throw new ProviderError(
          'RATE_LIMIT',
          Math.min(
            600000,
            Math.max(1000, Number.isFinite(delay) ? delay : 60000),
          ),
        );
      }
      if (!response.ok) throw new ProviderError('HTTP_ERROR');
      return await boundedJson(response);
    } catch (error) {
      if (signal.aborted) throw new ProviderError('TIMEOUT');
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('UNAVAILABLE');
    }
  }
  async getMarkets(futures = false, symbols?: string[]): Promise<Market[]> {
    if (
      symbols &&
      (!symbols.length ||
        symbols.length > 30 ||
        symbols.some((symbol) => !/^[A-Z0-9]{2,24}$/.test(symbol)))
    )
      throw new Error('INVALID_MARKET_UNIVERSE');
    const suffix =
      !futures && symbols
        ? `?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
        : '';
    const parsed = exchange.safeParse(
      await this.get(
        futures ? '/fapi/v1/exchangeInfo' : `/api/v3/exchangeInfo${suffix}`,
        futures,
      ),
    );
    if (!parsed.success) throw new ProviderError('MALFORMED_RESPONSE');
    const rows = parsed.data.symbols
      .filter(
        (item) =>
          item.status === 'TRADING' &&
          /^[A-Z0-9]{2,24}$/.test(item.symbol) &&
          /^[A-Z0-9]{1,24}$/.test(item.baseAsset) &&
          item.quoteAsset === 'USDT' &&
          (!futures || item.contractType === 'PERPETUAL'),
      )
      .map((item) => ({
        id: `binance:${futures ? 'perpetual' : 'spot'}:${item.symbol}`,
        assetId: `binance:${item.baseAsset}`,
        venueId: 'binance',
        symbol: item.symbol,
        base: item.baseAsset,
        quote: item.quoteAsset,
        kind: futures ? ('PERPETUAL' as const) : ('SPOT' as const),
      }));
    if (!rows.length) throw new ProviderError('EMPTY_RESPONSE');
    return rows;
  }
  async getSnapshots(markets: Market[]) {
    if (
      !markets.length ||
      markets.length > 30 ||
      markets.some((market) => market.kind !== markets[0]?.kind)
    )
      throw new Error('INVALID_MARKET_UNIVERSE');
    const futures = markets[0]?.kind === 'PERPETUAL';
    const parsed = z
      .array(z.object({ symbol: z.string() }).passthrough())
      .max(15000)
      .safeParse(
        await this.get(
          futures
            ? '/fapi/v1/ticker/24hr'
            : `/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(markets.map((market) => market.symbol)))}`,
          futures,
        ),
      );
    if (!parsed.success) throw new ProviderError('MALFORMED_RESPONSE');
    if (!parsed.data.length) throw new ProviderError('EMPTY_RESPONSE');
    const lookup = new Map(markets.map((item) => [item.symbol, item]));
    const now = this.now();
    let malformed = false;
    const results = parsed.data.flatMap((ticker) => {
      const market = lookup.get(ticker.symbol);
      if (!market) return [];
      try {
        return [normalizeTicker(ticker, market, now)];
      } catch {
        malformed = true;
        return [];
      }
    });
    if (!results.length)
      throw new ProviderError(
        malformed ? 'MALFORMED_RESPONSE' : 'EMPTY_RESPONSE',
      );
    return results;
  }
  async getCandles(market: Market, timeframe: Timeframe, limit = 240) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new Error('INVALID_CANDLE_LIMIT');
    const futures = market.kind === 'PERPETUAL';
    const raw = await this.get(
      `${futures ? '/fapi/v1' : '/api/v3'}/klines?symbol=${encodeURIComponent(market.symbol)}&interval=${timeframe}&limit=${limit}`,
      futures,
    );
    const parsed = z
      .array(
        z
          .tuple([epoch, numeric, numeric, numeric, numeric, numeric, epoch])
          .rest(z.unknown()),
      )
      .max(1000)
      .safeParse(raw);
    if (!parsed.success) throw new ProviderError('MALFORMED_RESPONSE');
    if (!parsed.data.length) throw new ProviderError('EMPTY_RESPONSE');
    const now = this.now();
    return parsed.data
      .filter((k) => k[6] < now.getTime())
      .map((k) => {
        const result = candleSchema.safeParse({
          marketId: market.id,
          timeframe,
          openTime: new Date(k[0]).toISOString(),
          closeTime: new Date(k[6]).toISOString(),
          open: k[1],
          high: k[2],
          low: k[3],
          close: k[4],
          volume: k[5],
          provenance: provenance(
            futures ? 'binance:perpetual' : 'binance:spot',
            `${futures ? '/fapi/v1' : '/api/v3'}/klines`,
            k[6],
            now,
          ),
        });
        if (!result.success) throw new ProviderError('MALFORMED_RESPONSE');
        return result.data;
      });
  }
  async getFunding(markets: Market[]) {
    const parsed = z
      .array(z.object({ symbol: z.string() }).passthrough())
      .max(15000)
      .safeParse(await this.get('/fapi/v1/premiumIndex', true));
    if (!parsed.success) throw new ProviderError('MALFORMED_RESPONSE');
    if (!parsed.data.length) throw new ProviderError('EMPTY_RESPONSE');
    const now = this.now();
    return parsed.data.flatMap((raw) => {
      const market = markets.find(
        (item) => item.symbol === raw.symbol && item.kind === 'PERPETUAL',
      );
      if (!market) return [];
      const parsedRow = premium.safeParse(raw);
      if (!parsedRow.success) throw new ProviderError('MALFORMED_RESPONSE');
      const row = parsedRow.data;
      const value = fundingSchema.safeParse({
        marketId: market.id,
        markPrice: row.markPrice,
        rate: row.lastFundingRate,
        nextFundingAt: new Date(row.nextFundingTime).toISOString(),
        provenance: provenance(
          'binance:perpetual',
          '/fapi/v1/premiumIndex',
          row.time,
          now,
        ),
      });
      if (!value.success) throw new ProviderError('MALFORMED_RESPONSE');
      return [value.data];
    });
  }
  async getOpenInterest(market: Market) {
    const parsed = oi.safeParse(
      await this.get(
        `/fapi/v1/openInterest?symbol=${encodeURIComponent(market.symbol)}`,
        true,
      ),
    );
    if (!parsed.success || parsed.data.symbol !== market.symbol)
      throw new ProviderError('MALFORMED_RESPONSE');
    const row = parsed.data;
    const value = openInterestSchema.safeParse({
      marketId: market.id,
      quantity: row.openInterest,
      unit: market.base,
      provenance: provenance(
        'binance:perpetual',
        '/fapi/v1/openInterest',
        row.time,
        this.now(),
      ),
    });
    if (!value.success) throw new ProviderError('MALFORMED_RESPONSE');
    return value.data;
  }
}
