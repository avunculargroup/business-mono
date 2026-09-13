import type { NextConfig } from 'next';

// No @platform/signal, @platform/voice or @mastra/core. Minute holds a database
// client — it is an authenticated app — but it cannot reach the agent stack,
// because nothing a subscriber does should run a model at request time. The
// absence here and in package.json is the enforcement, asserted by
// lib/boundary.test.ts.
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
