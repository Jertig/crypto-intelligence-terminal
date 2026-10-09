import type {
  Market,
  Snapshot,
  Candle,
  Timeframe,
  Funding,
  OpenInterest,
} from '@terminal/domain/market';

export interface MarketProvider {
  getMarkets(): Promise<Market[]>;
  getSnapshots(markets: Market[]): Promise<Snapshot[]>;
  getCandles(
    market: Market,
    timeframe: Timeframe,
    limit: number,
  ): Promise<Candle[]>;
  getFunding(markets: Market[]): Promise<Funding[]>;
  getOpenInterest(market: Market): Promise<OpenInterest>;
}
export type ProviderErrorCode =
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'MALFORMED_RESPONSE'
  | 'EMPTY_RESPONSE'
  | 'HTTP_ERROR'
  | 'UNAVAILABLE';
export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly retryAfterMs = 0,
  ) {
    super(code);
    this.name = 'ProviderError';
  }
}
export function retryDelay(
  attempt: number,
  retryAfterMs = 0,
  random = Math.random(),
) {
  return Math.min(
    600000,
    Math.max(
      retryAfterMs,
      Math.min(60000, 1000 * 2 ** Math.min(Math.max(0, attempt), 6)) +
        Math.floor(Math.max(0, Math.min(1, random)) * 1000),
    ),
  );
}
export async function boundedJson(
  response: Response,
  maximumBytes = 4 * 1024 * 1024,
): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > maximumBytes)
    throw new ProviderError('MALFORMED_RESPONSE');
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError('EMPTY_RESPONSE');
  let size = 0;
  let text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maximumBytes) throw new ProviderError('MALFORMED_RESPONSE');
      text += decoder.decode(result.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('MALFORMED_RESPONSE');
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
