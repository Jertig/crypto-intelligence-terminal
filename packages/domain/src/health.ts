import { z } from 'zod';

export const providerHealthSchema = z
  .object({
    providerId: z.string().trim().min(1),
    status: z.enum(['HEALTHY', 'DEGRADED', 'STALE', 'DOWN']),
    lastSuccessAt: z.iso.datetime().nullable(),
    lastAttemptAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
    errorCode: z.string().max(80).nullable(),
  })
  .superRefine((value, context) => {
    if (['HEALTHY', 'STALE'].includes(value.status) && !value.lastSuccessAt) {
      context.addIssue({
        code: 'custom',
        path: ['lastSuccessAt'],
        message:
          'An observed healthy or stale state requires a successful observation.',
      });
    }
  });

export type ProviderHealth = z.infer<typeof providerHealthSchema>;
export type DatabaseState = 'READY' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
export function providerFreshnessMs(providerId: string) {
  if (providerId === 'fred') return 7200000;
  if (providerId === 'helius') return 1800000;
  if (providerId === 'dexscreener') return 1800000;
  if (providerId === 'goplus') return 7200000;
  return providerId.includes('perpetual') ? 600000 : 90000;
}

export function isHeartbeatFresh(timestamp: Date, now: Date, maxAgeMs = 30000) {
  const age = now.getTime() - timestamp.getTime();
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
}

export function systemHealth(
  database: DatabaseState,
  heartbeat: Date | null,
  now: Date,
) {
  const worker =
    database === 'NOT_CONFIGURED'
      ? 'NOT_CONFIGURED'
      : database === 'UNAVAILABLE'
        ? 'UNKNOWN'
        : !heartbeat
          ? 'NOT_STARTED'
          : isHeartbeatFresh(heartbeat, now)
            ? 'READY'
            : 'STALE';
  return {
    status: 'ok' as const,
    phase: 0,
    ready: database === 'READY' && worker === 'READY',
    timestamp: now.toISOString(),
    dependencies: { database, worker },
    providers: { configured: 0, state: 'NOT_CONFIGURED' as const },
    ingestion: 'NOT_IMPLEMENTED' as const,
  };
}
