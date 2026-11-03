import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['node:sqlite', 'playwright', 'mammoth', 'unpdf'],
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
};
export default config;
