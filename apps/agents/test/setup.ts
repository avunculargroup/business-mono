import { afterEach, vi } from 'vitest';

// Provide non-empty defaults for env vars the agent server module-loads.
// Tests that need different values can override via vi.stubEnv().
process.env['ANTHROPIC_API_KEY'] ??= 'test-anthropic-key';
process.env['OPENAI_API_KEY'] ??= 'test-openai-key';
// 127.0.0.1 (not "localhost") so resolveDbUrl's IPv4-literal short-circuit
// fires without doing an actual DNS lookup. Tests don't connect to Postgres.
process.env['MASTRA_DB_URL'] ??= 'postgresql://test:test@127.0.0.1:5432/test';
process.env['SUPABASE_URL'] ??= 'http://localhost:54321';
process.env['SUPABASE_ANON_KEY'] ??= 'test-anon-key';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'test-service-key';
process.env['SIGNAL_LISTENER_ENABLED'] = 'false';
process.env['ZOOM_WEBHOOK_SECRET_TOKEN'] ??= 'test-zoom-secret';
// TELNYX_PUBLIC_KEY intentionally unset by default — tests that exercise
// the signature path set it explicitly via vi.stubEnv.

// Note: we deliberately do NOT call vi.restoreAllMocks() globally — module-
// scope spies and stubs created by individual test files need to survive
// between cases in that file. Each test file manages its own setup/teardown.
afterEach(() => {
  vi.unstubAllEnvs();
});
