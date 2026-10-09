import { z } from 'zod';
import { provenanceSchema } from './index';

export const symbolSchema = z.string().regex(/^[A-Z0-9]{1,24}$/);
export const timeframeSchema = z.enum(['1m', '5m', '1h', '1d']);
export type Timeframe = z.infer<typeof timeframeSchema>;
export const marketSchema = z.object({
  id: z.string().min(1).max(100),
  assetId: z.string().min(1).max(80),
  venueId: z.string().min(1).max(40),
  symbol: symbolSchema,
  base: symbolSchema,
  quote: symbolSchema,
  kind: z.enum(['SPOT', 'PERPETUAL']),
});
export type Market = z.infer<typeof marketSchema>;
export const snapshotSchema = z.object({
  marketId: z.string().min(1),
  price: z.number().finite().positive(),
  change24h: z.number().finite(),
  quoteVolume24h: z.number().finite().nonnegative(),
  provenance: provenanceSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const candleSchema = z
  .object({
    marketId: z.string().min(1),
    timeframe: timeframeSchema,
    openTime: z.iso.datetime(),
    closeTime: z.iso.datetime(),
    open: z.number().finite().positive(),
    high: z.number().finite().positive(),
    low: z.number().finite().positive(),
    close: z.number().finite().positive(),
    volume: z.number().finite().nonnegative(),
    provenance: provenanceSchema,
  })
  .superRefine((candle, ctx) => {
    if (
      candle.high < Math.max(candle.open, candle.close, candle.low) ||
      candle.low > Math.min(candle.open, candle.close) ||
      candle.closeTime <= candle.openTime
    )
      ctx.addIssue({ code: 'custom', message: 'Inconsistent closed candle' });
  });
export type Candle = z.infer<typeof candleSchema>;
export const fundingSchema = z.object({
  marketId: z.string().min(1),
  markPrice: z.number().finite().positive(),
  rate: z.number().finite(),
  nextFundingAt: z.iso.datetime(),
  provenance: provenanceSchema,
});
export type Funding = z.infer<typeof fundingSchema>;
export const openInterestSchema = z.object({
  marketId: z.string().min(1),
  quantity: z.number().finite().nonnegative(),
  unit: z.string().min(1).max(24),
  provenance: provenanceSchema,
});
export type OpenInterest = z.infer<typeof openInterestSchema>;

export type Freshness = 'FRESH' | 'STALE' | 'UNAVAILABLE';
export function freshness(
  timestamp: string | Date | null,
  now: Date,
  maxAgeMs = 90000,
): Freshness {
  if (timestamp === null) return 'UNAVAILABLE';
  const age = now.getTime() - new Date(timestamp).getTime();
  return Number.isFinite(age) && age >= -5000 && age <= maxAgeMs
    ? 'FRESH'
    : 'STALE';
}
export function retentionCutoff(timeframe: Timeframe, now: Date): Date | null {
  const days = { '1m': 30, '5m': 180, '1h': 730, '1d': null }[timeframe];
  return days === null ? null : new Date(now.getTime() - days * 86400000);
}
export type MarketRow = Snapshot &
  Market & {
    freshness: Freshness;
    funding: Funding | null;
    openInterest: OpenInterest | null;
  };
export type MarketResponse = {
  state: 'READY' | 'EMPTY' | 'NOT_CONFIGURED' | 'UNAVAILABLE';
  observedAt: string;
  rows: MarketRow[];
  providers: {
    providerId: string;
    status: string;
    lastSuccessAt: string | null;
    errorCode: string | null;
  }[];
};

export const marketResponseSchema = z.object({
  state: z.enum(['READY', 'EMPTY', 'NOT_CONFIGURED', 'UNAVAILABLE']),
  observedAt: z.iso.datetime(),
  rows: z
    .array(
      marketSchema.extend(snapshotSchema.shape).extend({
        freshness: z.enum(['FRESH', 'STALE', 'UNAVAILABLE']),
        funding: fundingSchema.nullable(),
        openInterest: openInterestSchema.nullable(),
      }),
    )
    .max(30),
  providers: z
    .array(
      z.object({
        providerId: z.string(),
        status: z.string(),
        lastSuccessAt: z.iso.datetime().nullable(),
        errorCode: z.string().nullable(),
      }),
    )
    .max(30),
});
