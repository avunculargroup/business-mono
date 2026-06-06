// Non-empty defaults for env vars that workspace modules read at import time
// (the @platform/db client throws if Supabase vars are unset). Tests inject
// fake deps and never connect to Supabase or OpenAI — these just satisfy
// module-load guards. Mirrors apps/agents/test/setup.ts.
process.env['SUPABASE_URL'] ??= 'http://localhost:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'test-service-key';
process.env['OPENAI_API_KEY'] ??= 'test-openai-key';
