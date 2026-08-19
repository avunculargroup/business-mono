import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@platform/data',
    '@platform/data-supabase',
    '@platform/db',
    '@platform/shared',
    '@platform/ui',
  ],
};

export default nextConfig;
