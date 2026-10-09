import { officialEndpoint } from './binance';
import { retryDelay } from './index';

export interface StreamSocket {
  on(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (data?: unknown) => void,
  ): void;
  close(): void;
}
export type SocketFactory = (url: string) => StreamSocket;
export const nativeSocket: SocketFactory = (url) => {
  const socket = new WebSocket(url);
  return {
    on: (type, listener) =>
      socket.addEventListener(type, (event) =>
        listener('data' in event ? event.data : undefined),
      ),
    close: () => socket.close(),
  };
};
export class BinanceStream {
  private socket: StreamSocket | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setInterval> | undefined;
  private rotation: ReturnType<typeof setTimeout> | undefined;
  private lastMessage = 0;
  private attempt = 0;
  private stopped = true;
  constructor(
    private readonly options: {
      symbols: string[];
      endpoint?: string;
      factory?: SocketFactory;
      now?: () => number;
      random?: () => number;
      onMessage: (data: unknown) => boolean;
      onState: (
        state: 'CONNECTED' | 'RECONNECTING' | 'STALE' | 'MALFORMED',
      ) => void;
    },
  ) {
    if (
      !options.symbols.length ||
      options.symbols.length > 30 ||
      options.symbols.some((symbol) => !/^[A-Z0-9]{2,24}$/.test(symbol))
    )
      throw new Error('INVALID_STREAM_UNIVERSE');
    officialEndpoint(
      options.endpoint || 'wss://data-stream.binance.vision',
      'stream',
    );
  }
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
    this.watchdog = setInterval(() => {
      if (this.now() - this.lastMessage > 45000 && this.socket) {
        this.options.onState('STALE');
        this.socket.close();
      }
    }, 10000);
  }
  private connect() {
    if (this.stopped) return;
    const base = officialEndpoint(
      this.options.endpoint || 'wss://data-stream.binance.vision',
      'stream',
    );
    const streams = this.options.symbols
      .flatMap((symbol) => [
        `${symbol.toLowerCase()}@ticker`,
        `${symbol.toLowerCase()}@kline_1m`,
      ])
      .join('/');
    let socket: StreamSocket;
    try {
      socket = (this.options.factory ?? nativeSocket)(
        `${base}/stream?streams=${streams}`,
      );
    } catch {
      this.options.onState('RECONNECTING');
      this.retry = setTimeout(
        () => this.connect(),
        retryDelay(this.attempt++, 0, this.options.random?.() ?? Math.random()),
      );
      return;
    }
    this.socket = socket;
    this.lastMessage = this.now();
    let closed = false;
    const reconnect = () => {
      if (closed) return;
      closed = true;
      clearTimeout(this.rotation);
      this.socket = undefined;
      if (!this.stopped) {
        this.options.onState('RECONNECTING');
        this.retry = setTimeout(
          () => this.connect(),
          retryDelay(
            this.attempt++,
            0,
            this.options.random?.() ?? Math.random(),
          ),
        );
      }
    };
    socket.on('open', () => {
      this.options.onState('CONNECTED');
      this.rotation = setTimeout(() => socket.close(), 23 * 3600000);
    });
    socket.on('message', (data) => {
      if (this.stopped || closed) return;
      try {
        if (typeof data !== 'string' || Buffer.byteLength(data, 'utf8') > 65536)
          throw new Error('INVALID_MESSAGE');
        if (this.options.onMessage(JSON.parse(data) as unknown)) {
          this.lastMessage = this.now();
          this.attempt = 0;
        }
      } catch {
        this.options.onState('MALFORMED');
      }
    });
    socket.on('error', () => {
      socket.close();
      reconnect();
    });
    socket.on('close', reconnect);
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearTimeout(this.rotation);
    clearInterval(this.watchdog);
    this.socket?.close();
    this.socket = undefined;
  }
}
