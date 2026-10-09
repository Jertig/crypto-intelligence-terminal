import { describe, expect, it } from 'vitest';
import {
  provenanceSchema,
  qualityClassSchema,
} from '../../packages/domain/src/index';

const direct = {
  source: 'Unit test fixture',
  providerId: 'fixture-only',
  sourceTimestamp: '2026-01-01T00:00:00Z',
  ingestedAt: '2026-01-01T00:00:01Z',
  quality: 'DIRECT',
};

describe('provenance contract', () => {
  it('accepts attributable direct data', () => {
    expect(provenanceSchema.parse(direct).providerId).toBe('fixture-only');
  });
  it('rejects unclassified or missing attribution', () => {
    expect(qualityClassSchema.safeParse('LIVE').success).toBe(false);
    expect(provenanceSchema.safeParse({ ...direct, source: '' }).success).toBe(
      false,
    );
  });
  it.each(['DERIVED', 'ESTIMATED'])('requires a version for %s', (quality) => {
    expect(provenanceSchema.safeParse({ ...direct, quality }).success).toBe(
      false,
    );
    expect(
      provenanceSchema.safeParse({
        ...direct,
        quality,
        methodologyVersion: 'fixture:v1',
      }).success,
    ).toBe(true);
  });
  it('rejects missing or invalid timestamps', () => {
    expect(
      provenanceSchema.safeParse({ ...direct, sourceTimestamp: 'recently' })
        .success,
    ).toBe(false);
    expect(
      provenanceSchema.safeParse({ ...direct, ingestedAt: undefined }).success,
    ).toBe(false);
  });
});
