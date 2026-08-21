import { defineConfig } from 'vitest/config';

// No aliases: this package deliberately depends on nothing. Node environment —
// it is a schema and some JSON.
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
