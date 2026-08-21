import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Registers jest-dom matchers on Vitest's `expect`. Harmless in the node
// environment used by the pure-logic *.test.ts files — it only extends the
// matcher set. Same shape as apps/web/test/setup.ts.
import '@testing-library/jest-dom/vitest';

// RTL doesn't auto-clean without `globals: true`; unmount between cases so the
// jsdom document doesn't leak rendered trees across tests.
afterEach(() => {
  cleanup();
});
