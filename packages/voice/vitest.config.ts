import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Resolve workspace packages to their TypeScript source (their `exports."."`
// point at ./dist, which only exists after a build). Mirrors the agents config.
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@platform/db': `${here}../db/src/index.ts`,
      '@platform/shared': `${here}../shared/src/index.ts`,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
