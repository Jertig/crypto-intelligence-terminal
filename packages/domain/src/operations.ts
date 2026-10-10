import { z } from 'zod';

const bytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const backupStatusSchema = z
  .object({
    lastSuccessAt: z.iso.datetime().nullable(),
    bytes,
    digest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    error: z.enum(['BACKUP_FAILED', 'BUDGET_EXHAUSTED']).nullable(),
  })
  .strict()
  .refine((v) =>
    v.lastSuccessAt === null
      ? v.digest === null && v.bytes === 0
      : v.digest !== null && v.bytes > 0,
  );
export const operationsSchema = z
  .object({
    enabled: z.boolean(),
    observedAt: z.iso.datetime(),
    databaseBytes: bytes.nullable(),
    disks: z
      .array(
        z
          .object({
            name: z.enum(['database', 'backups']),
            totalBytes: bytes.positive(),
            availableBytes: bytes,
          })
          .strict()
          .refine((d) => d.availableBytes <= d.totalBytes),
      )
      .max(2),
    state: z.enum(['NORMAL', 'WARNING', 'URGENT', 'PROTECTED', 'UNKNOWN']),
    reasons: z.array(z.string().max(120)).max(8),
    backup: backupStatusSchema.nullable(),
  })
  .strict();
export type Operations = z.infer<typeof operationsSchema>;
export function storageState(
  databaseBytes: number | null,
  disks: Operations['disks'],
  required: boolean,
): Pick<Operations, 'state' | 'reasons'> {
  if (
    databaseBytes === null ||
    !Number.isSafeInteger(databaseBytes) ||
    databaseBytes < 0 ||
    (required &&
      (disks.length !== 2 || new Set(disks.map((d) => d.name)).size !== 2))
  )
    return {
      state: 'UNKNOWN',
      reasons: ['Storage measurement is unavailable; ingestion is protected.'],
    };
  const reasons: string[] = [];
  let severity = 0;
  for (const d of disks) {
    if (
      !Number.isSafeInteger(d.totalBytes) ||
      !Number.isSafeInteger(d.availableBytes) ||
      d.totalBytes <= 0 ||
      d.availableBytes < 0 ||
      d.availableBytes > d.totalBytes
    )
      return {
        state: 'UNKNOWN',
        reasons: ['Invalid filesystem measurement; ingestion is protected.'],
      };
    const percent = 100 * (1 - d.availableBytes / d.totalBytes);
    const level = percent >= 90 ? 3 : percent >= 80 ? 2 : percent >= 70 ? 1 : 0;
    severity = Math.max(severity, level);
    if (level)
      reasons.push(`${d.name} filesystem: ${percent.toFixed(1)}% used.`);
  }
  if (databaseBytes >= 8 * 1024 ** 3) {
    severity = 3;
    reasons.push('Database reached the 8 GiB protective budget.');
  } else if (databaseBytes >= 6 * 1024 ** 3) {
    severity = Math.max(severity, 1);
    reasons.push('Database exceeded the 6 GiB warning budget.');
  }
  return {
    state: (['NORMAL', 'WARNING', 'URGENT', 'PROTECTED'] as const)[severity]!,
    reasons,
  };
}
export function ingestionAllowed(sample: Operations | null, now = new Date()) {
  return (
    sample !== null &&
    storageState(sample.databaseBytes, sample.disks, sample.enabled).state ===
      sample.state &&
    now.getTime() >= Date.parse(sample.observedAt) &&
    now.getTime() - Date.parse(sample.observedAt) <= 120000 &&
    !['PROTECTED', 'UNKNOWN'].includes(sample.state)
  );
}
export function backupState(backup: Operations['backup'], now = new Date()) {
  if (!backup?.lastSuccessAt) return 'UNAVAILABLE';
  const age = now.getTime() - Date.parse(backup.lastSuccessAt);
  return age < 0 || age > 36 * 3600000 || backup.error
    ? 'STALE_OR_FAILED'
    : 'LOCAL_BACKUP';
}
