import type { NextConfig } from 'next';

// No @platform/data-supabase and no @platform/db. The demo cannot reach a
// database because it does not depend on anything that could — the absence
// here and in package.json is the enforcement, not a runtime guard.
const nextConfig: NextConfig = {
  transpilePackages: [
    '@platform/agent-traces',
    '@platform/data',
    '@platform/data-fixtures',
    '@platform/shared',
    '@platform/ui',
  ],
};

export default nextConfig;
