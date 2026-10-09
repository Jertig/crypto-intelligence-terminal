import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  globalIgnores([
    '**/.next/**',
    '**/dist/**',
    '**/node_modules/**',
    '**/coverage/**',
    '**/next-env.d.ts',
    '**/migrations/meta/**',
    '**/playwright-report/**',
    '**/test-results/**',
  ]),
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [...nextVitals, ...nextTs],
    settings: { next: { rootDir: 'apps/web/' } },
  },
]);
