import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Workspace packages declare `exports."."` pointing at built output, which is
// only present after `tsc --build`. Tests run against TypeScript source via
// aliases so we don't have to build packages first. apps/web only imports from
// @platform/db and @platform/shared (see CLAUDE.md import rules).
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  // Use the automatic JSX runtime (like Next.js) so components and *.test.tsx
  // files don't need React in scope. tsconfig sets `"jsx": "preserve"` for
  // Next, so nothing else supplies the runtime — this setting is load-bearing.
  // Must be `oxc`, not the older `esbuild` key: Vitest 4 pulls Vite 8, which
  // transforms with oxc/rolldown and ignores `esbuild` (deprecated there).
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@platform/db': `${here}../../packages/db/src/index.ts`,
      '@platform/shared': `${here}../../packages/shared/src/index.ts`,
      // Mirror the tsconfig `@/*` path alias so tests can import app modules.
      '@': here,
    },
  },
  test: {
    // Pure-logic tests run in node; component tests (*.test.tsx) need a DOM.
    // Vitest 4 removed `environmentMatchGlobs`, so the split is expressed as
    // two projects. `extends: true` is required — inline projects do NOT
    // inherit the root config by default in v4, and the `resolve.alias` and
    // `oxc.jsx` settings above are needed by both.
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['{app,components,hooks,lib}/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['{app,components,hooks,lib}/**/*.test.tsx'],
        },
      },
    ],
    setupFiles: ['./test/setup.ts'],
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
