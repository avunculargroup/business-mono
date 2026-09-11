import { defineConfig } from 'vitest/config';

// Node environment throughout: nothing in this package touches a DOM, and it is
// a leaf with no dependencies at all — which is also why there is no alias
// block. Modules import each other relatively, with the `.js` specifiers the
// package's ESM build needs; Vite resolves those back to `.ts` in a TS project.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
