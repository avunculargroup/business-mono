import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Workspace packages are aliased to TypeScript source so tests do not require a
// prior `tsc --build`, matching apps/web and packages/ui. Node environment
// throughout — nothing in this package touches a DOM.
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Longest-prefix first — Vite's object form does prefix matching.
      '@platform/data/testing': `${here}../data/src/testing/index.ts`,
      '@platform/data': `${here}../data/src/index.ts`,
      '@platform/db': `${here}../db/src/index.ts`,
      '@platform/shared': `${here}../shared/src/index.ts`,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10_000,
  },
});
