import type { NextConfig } from 'next';
import { resolve } from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  transpilePackages: ['@terminal/domain'],
  poweredByHeader: false,
  experimental: { cpus: 1 },
};

export default nextConfig;
