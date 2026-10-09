import { sql } from 'drizzle-orm';
import {
  check,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const providerStatus = pgEnum('provider_status', [
  'HEALTHY',
  'DEGRADED',
  'STALE',
  'DOWN',
]);
export const dataQuality = pgEnum('data_quality', [
  'DIRECT',
  'AGGREGATED',
  'DERIVED',
  'ESTIMATED',
  'AI_INTERPRETATION',
]);

export const providerHealth = pgTable(
  'provider_health',
  {
    providerId: text('provider_id').primaryKey(),
    status: providerStatus('status').notNull(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    errorCode: text('error_code'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check('provider_id_nonempty', sql`length(trim(${table.providerId})) > 0`),
    check(
      'observed_status_requires_success',
      sql`${table.status} NOT IN ('HEALTHY', 'STALE') OR ${table.lastSuccessAt} IS NOT NULL`,
    ),
  ],
);

export const workerHeartbeats = pgTable(
  'worker_heartbeats',
  {
    name: text('name').primaryKey(),
    instanceId: uuid('instance_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check('worker_name_nonempty', sql`length(trim(${table.name})) > 0`),
    check(
      'heartbeat_after_start',
      sql`${table.lastSeenAt} >= ${table.startedAt}`,
    ),
  ],
);
