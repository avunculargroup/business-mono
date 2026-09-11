import { defineConfig } from 'vitest/config';

// Node environment: the only test here reads the generated types file off disk
// to check whether the hand-written bridge is still needed.
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
