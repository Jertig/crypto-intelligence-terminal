import { loadLocalEnvironment } from './environment.mjs';

loadLocalEnvironment();
await import('next/dist/bin/next');
