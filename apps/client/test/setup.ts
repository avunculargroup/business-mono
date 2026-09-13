import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Registers jest-dom matchers on Vitest's `expect`. Harmless in the node
// environment used by the pure-logic *.test.ts files — it only extends the
// matcher set. Same shape as apps/web/test/setup.ts and apps/demo/test/setup.ts.
import '@testing-library/jest-dom/vitest';

// Supabase env vars the server client reads at module scope. Values are never
// used: every test that touches data does so through a fake.
process.env['NEXT_PUBLIC_SUPABASE_URL'] ??= 'https://example.supabase.co';
process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ??= 'anon-key-for-tests';

// RTL doesn't auto-clean without `globals: true`; unmount between tests so the
// jsdom document doesn't leak rendered trees across cases.
afterEach(() => {
  cleanup();
});
