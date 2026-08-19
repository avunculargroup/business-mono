import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@platform/db', '@platform/shared', '@platform/ui'],
};

export default nextConfig;
