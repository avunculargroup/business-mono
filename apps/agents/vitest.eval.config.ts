import { defineConfig } from 'vitest/config';

// Separate config for LLM-touching evals. These hit real Anthropic/OpenRouter
// and require ANTHROPIC_API_KEY or OPENROUTER_API_KEY in the environment. Not
// run in CI — invoke locally via `pnpm --filter @platform/agents test:eval`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['evals/**/*.eval.ts'],
    exclude: ['node_modules/**', 'dist/**', '.mastra/**'],
    // Reuse the unit-suite setup so the agent server's module-load env reads
    // (SUPABASE_URL, ANTHROPIC_API_KEY, etc.) succeed at import time. Real
    // values must be exported in the shell before invoking this config.
    setupFiles: ['./test/setup.ts'],
    testTimeout: 5 * 60_000,
    hookTimeout: 60_000,
    // Each eval makes serial real-LLM calls; running files in parallel would
    // multiply spend and rate-limit hits without speeding much up.
    fileParallelism: false,
  },
});
