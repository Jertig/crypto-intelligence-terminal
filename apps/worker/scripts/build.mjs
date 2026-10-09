import { build } from 'esbuild';

await build({
  entryPoints: {
    index: 'src/index.ts',
    migrate: '../../packages/db/src/migrate.ts',
  },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
