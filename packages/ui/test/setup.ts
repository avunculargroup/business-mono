import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Registers jest-dom matchers (toBeInTheDocument, toBeDisabled, …) on Vitest's
// `expect`. Same setup as apps/web/test/setup.ts — kept as a copy rather than shared,
// since a package reaching into its consumer's test helpers is the coupling this
// extraction exists to remove.
import '@testing-library/jest-dom/vitest';

// RTL doesn't auto-clean without `globals: true`; unmount between cases so the
// jsdom document doesn't leak rendered trees across tests.
afterEach(() => {
  cleanup();
});
