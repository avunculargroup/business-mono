import { defineConfig } from 'vitest/config';

// Mirrors packages/ui/vitest.config.ts. `oxc` (not the deprecated `esbuild` key)
// supplies the automatic JSX runtime, since tsconfig sets `"jsx": "preserve"` for
// Next and nothing else provides it.
//
// jsdom throughout rather than the node/jsdom project split apps/web uses: the
// only DOM-touching module here is the provider, and one environment is simpler
// than two for a package this size.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10_000,
  },
});
