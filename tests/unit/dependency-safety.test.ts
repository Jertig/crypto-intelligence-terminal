import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type BraceTools = {
  (pattern: string): string[];
  parse(pattern: string): unknown;
  compile(pattern: unknown): string;
  expand(pattern: unknown): string[];
  stringify(pattern: unknown): string;
};
const braces: BraceTools = createRequire(import.meta.url)('braces');

describe('local braces safety patch', () => {
  it('preserves ordinary lint glob expansion', () => {
    expect(braces('apps/{web,worker}/*')).toEqual(['apps/(web|worker)/*']);
    expect(braces.expand('apps/{web,worker}/*')).toEqual([
      'apps/web/*',
      'apps/worker/*',
    ]);
  });
  it('bounds deeply nested string input before recursive walkers', () => {
    expect(() =>
      braces.parse('{'.repeat(4000) + 'x' + '}'.repeat(4000)),
    ).toThrow('Brace nesting exceeds safety limit');
  });
  it.each(['compile', 'stringify', 'expand'] as const)(
    'bounds a directly supplied AST for %s',
    (method) => {
      let ast: { type: string; nodes: unknown[] } = { type: 'root', nodes: [] };
      for (let depth = 0; depth < 1000; depth++)
        ast = { type: 'root', nodes: [ast] };
      expect(() => braces[method](ast)).toThrow(
        'Brace nesting exceeds safety limit',
      );
    },
  );
});
