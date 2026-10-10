import { z } from 'zod';

function blankToUndefined(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

const databaseUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ['postgres:', 'postgresql:'].includes(url.protocol) &&
        Boolean(url.hostname && url.username && url.password)
      );
    } catch {
      return false;
    }
  }, 'A PostgreSQL URI with server-side credentials is required.');

const environmentSchema = z.object({
  HELIUS_API_KEY: z.preprocess(
    blankToUndefined,
    z.string().min(1).max(4096).optional(),
  ),
  TRACKED_WALLETS: z.preprocess(
    blankToUndefined,
    z.string().max(4000).optional(),
  ),
  TOKEN_INGESTION_ENABLED: z.preprocess(
    blankToUndefined,
    z.enum(['true', 'false']).optional(),
  ),
  TOKEN_UNIVERSE: z.preprocess(
    blankToUndefined,
    z.string().max(1000).optional(),
  ),
  GOPLUS_ENABLED: z.preprocess(
    blankToUndefined,
    z.enum(['true', 'false']).optional(),
  ),
  GOPLUS_API_KEY: z.preprocess(
    blankToUndefined,
    z.string().min(1).max(4096).optional(),
  ),
  DATABASE_URL: z.preprocess(blankToUndefined, databaseUrlSchema.optional()),
  WORKER_PORT: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1024).max(65535).default(3001),
  ),
  HEARTBEAT_INTERVAL_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1000).max(10000).default(5000),
  ),
  MARKET_INGESTION_ENABLED: z.preprocess(
    blankToUndefined,
    z.enum(['true', 'false']).optional(),
  ),
  MARKET_SYMBOLS: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^[A-Z0-9]{2,24}(,[A-Z0-9]{2,24}){0,29}$/)
      .refine(
        (value) => new Set(value.split(',')).size === value.split(',').length,
        'Duplicate symbols',
      )
      .optional(),
  ),
  BINANCE_REST_BASE_URL: z.preprocess(
    blankToUndefined,
    z.string().url().optional(),
  ),
  BINANCE_FUTURES_BASE_URL: z.preprocess(
    blankToUndefined,
    z.string().url().optional(),
  ),
  BINANCE_WS_BASE_URL: z.preprocess(
    blankToUndefined,
    z.string().url().optional(),
  ),
});

export class EnvironmentError extends Error {
  constructor(public readonly fields: string[]) {
    super(`Invalid environment fields: ${fields.join(', ')}`);
    this.name = 'EnvironmentError';
  }
}

export function readEnvironment(
  input: Record<string, string | undefined>,
  requireDatabase = false,
) {
  const parsed = environmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new EnvironmentError([
      ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
    ]);
  }
  if (requireDatabase && !parsed.data.DATABASE_URL)
    throw new EnvironmentError(['DATABASE_URL']);
  return parsed.data;
}
