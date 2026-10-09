import { cp } from 'node:fs/promises';
import { loadLocalEnvironment } from './environment.mjs';

loadLocalEnvironment();
const runtime = new URL('../.next/standalone/apps/web/', import.meta.url);
await cp(
  new URL('../.next/static/', import.meta.url),
  new URL('.next/static/', runtime),
  { recursive: true },
);
process.env.HOSTNAME = '127.0.0.1';
process.env.PORT ||= '3000';
await import(new URL('server.js', runtime).href);
