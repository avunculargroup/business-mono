import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Workspace packages aliased to TypeScript source, matching apps/web.
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@platform/data/provider': `${here}../../packages/data/src/provider.tsx`,
      '@platform/data': `${here}../../packages/data/src/index.ts`,
      '@platform/data-fixtures': `${here}../../packages/data-fixtures/src/index.ts`,
      '@platform/shared': `${here}../../packages/shared/src/index.ts`,
      '@': here,
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
