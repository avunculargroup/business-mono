import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Mirrors apps/web/vitest.config.ts. The notes there are load-bearing and apply
// identically here:
//   - `oxc` (not the deprecated `esbuild` key) supplies the automatic JSX runtime,
//     since tsconfig sets `"jsx": "preserve"` for Next and nothing else provides it.
//   - `@platform/shared` is aliased to TypeScript source so tests do not require a
//     prior `tsc --build` of the workspace.
// Every component in this package renders, so unlike apps/web there is no node/jsdom
// project split — it is jsdom throughout.
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@platform/shared': `${here}../shared/src/index.ts`,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10_000,
  },
});
