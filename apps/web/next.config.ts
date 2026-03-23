import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@platform/db', '@platform/shared'],
};

export default nextConfig;
