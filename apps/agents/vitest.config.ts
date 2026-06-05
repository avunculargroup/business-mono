import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Workspace packages declare `exports."."` pointing at `./dist/index.js`,
// which is only present after `tsc --build`. Tests run against TypeScript
// source via aliases so we don't have to build packages first.
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@platform/db': `${here}../../packages/db/src/index.ts`,
      '@platform/shared': `${here}../../packages/shared/src/index.ts`,
      '@platform/signal': `${here}../../packages/signal/src/index.ts`,
      '@platform/voice': `${here}../../packages/voice/src/index.ts`,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'evals/scorers/**/*.test.ts'],
    // Eval *.eval.ts files run via vitest.eval.config.ts and need real LLM
    // creds — keep them out of the fast unit suite.
    exclude: ['evals/**/*.eval.ts', 'dist/**', '.mastra/**', 'node_modules/**'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/mastra/index.ts', 'src/index.ts'],
    },
  },
});
