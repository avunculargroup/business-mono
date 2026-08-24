import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Same shape as @platform/data-supabase: workspace packages aliased to
// TypeScript source so tests need no prior build. Node environment — this
// package has no DOM and, deliberately, no database client either.
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Longest-prefix first — Vite's object form does prefix matching.
      '@platform/data/testing': `${here}../data/src/testing/index.ts`,
      '@platform/data': `${here}../data/src/index.ts`,
      '@platform/shared': `${here}../shared/src/index.ts`,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
