import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Workspace packages aliased to TypeScript source, matching apps/web. Two
// projects for two environments: pure-logic `*.test.ts` in node, component
// `*.test.tsx` in jsdom. A new component test only needs the .tsx extension.
const here = fileURLToPath(new URL('.', import.meta.url));

const alias = {
  '@platform/agent-traces': `${here}../../packages/agent-traces/src/index.ts`,
  '@platform/data/provider': `${here}../../packages/data/src/provider.tsx`,
  '@platform/data': `${here}../../packages/data/src/index.ts`,
  '@platform/data-fixtures': `${here}../../packages/data-fixtures/src/index.ts`,
  '@platform/shared': `${here}../../packages/shared/src/index.ts`,
  '@': here,
};

export default defineConfig({
  resolve: { alias },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    setupFiles: [`${here}test/setup.ts`],
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'jsdom', environment: 'jsdom', include: ['**/*.test.tsx'] },
      },
    ],
  },
});
