import { z } from 'zod';

export const qualityClassSchema = z.enum([
  'DIRECT',
  'AGGREGATED',
  'DERIVED',
  'ESTIMATED',
  'AI_INTERPRETATION',
]);

export type QualityClass = z.infer<typeof qualityClassSchema>;

export const provenanceSchema = z
  .object({
    source: z.string().min(1),
    providerId: z.string().min(1),
    sourceTimestamp: z.iso.datetime(),
    ingestedAt: z.iso.datetime(),
    quality: qualityClassSchema,
    methodologyVersion: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (
      (value.quality === 'DERIVED' || value.quality === 'ESTIMATED') &&
      !value.methodologyVersion
    ) {
      context.addIssue({
        code: 'custom',
        path: ['methodologyVersion'],
        message: 'A derived or estimated value requires a methodology version.',
      });
    }
  });

export type Provenance = z.infer<typeof provenanceSchema>;
