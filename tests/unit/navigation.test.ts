import { describe, expect, it } from 'vitest';
import {
  destinations,
  filterDestinations,
  findWorkspace,
  workspaceHref,
} from '../../apps/web/lib/navigation';

describe('workspace navigation', () => {
  it('maps the home workspace and rejects unknown destinations', () => {
    expect(workspaceHref('dashboard')).toBe('/');
    expect(findWorkspace('unknown')).toBeUndefined();
    expect(new Set(destinations.map((entry) => entry.id)).size).toBe(
      destinations.length,
    );
  });
  it('filters commands case-insensitively with a bounded result set', () => {
    expect(
      filterDestinations('  DATA STATUS  ').map((entry) => entry.id),
    ).toEqual(['data-status']);
    expect(filterDestinations('').length).toBeLessThanOrEqual(10);
    expect(filterDestinations('unknown asset')).toEqual([]);
  });
});
