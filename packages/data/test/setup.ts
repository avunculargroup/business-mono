import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Registers jest-dom matchers on Vitest's `expect`. Kept as a copy of
// packages/ui/test/setup.ts rather than shared, for the same reason: a package
// reaching into another package's test helpers is the coupling this seam exists
// to remove.
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
});
