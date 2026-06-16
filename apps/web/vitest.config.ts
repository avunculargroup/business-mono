import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Workspace packages declare `exports."."` pointing at built output, which is
// only present after `tsc --build`. Tests run against TypeScript source via
// aliases so we don't have to build packages first. apps/web only imports from
// @platform/db and @platform/shared (see CLAUDE.md import rules).
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@platform/db': `${here}../../packages/db/src/index.ts`,
      '@platform/shared': `${here}../../packages/shared/src/index.ts`,
      // Mirror the tsconfig `@/*` path alias so tests can import app modules.
      '@': here,
    },
  },
  test: {
    environment: 'node',
    include: ['{app,components,hooks,lib}/**/*.test.{ts,tsx}'],
    exclude: ['.next/**', 'node_modules/**'],
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['{app,components,hooks,lib}/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}'],
    },
  },
});
