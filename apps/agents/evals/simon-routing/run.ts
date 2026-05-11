/**
 * Routing-accuracy eval for Simon.
 *
 * For each fixture, sends the user input to Simon and asserts that the
 * `agent-<expected>` subagent tool is among Simon's tool calls. Computes
 * aggregate accuracy and exits non-zero if it falls below ROUTING_THRESHOLD.
 *
 * Runs against the real Simon agent and the real Anthropic/OpenRouter model.
 * It does NOT mock subagents — invoking `agent-charlie` will actually run
 * Charlie (and Charlie's tools). Run against a staging environment or be
 * prepared for real side effects.
 *
 * Usage (from monorepo root):
 *   pnpm --filter @platform/agents test:eval
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simon } from '../../src/agents/simon/index.js';

interface Fixture {
  input: string;
  expectedSubagent: string;
  rationale: string;
}

interface FixtureResult extends Fixture {
  toolCalls: string[];
  ok: boolean;
  error?: string;
}

const ROUTING_THRESHOLD = 0.9;

const here = dirname(fileURLToPath(import.meta.url));
const fixtures: Fixture[] = JSON.parse(readFileSync(resolve(here, 'fixtures.json'), 'utf-8'));

console.log(`[simon-routing] Running ${fixtures.length} fixtures…\n`);

const results: FixtureResult[] = [];
for (const fixture of fixtures) {
  const expectedToolName = `agent-${fixture.expectedSubagent}`;
  try {
    const response = await simon.generate(
      [{ role: 'user', content: fixture.input }],
      { memory: { thread: `eval-routing-${Date.now()}-${Math.random()}`, resource: 'eval-routing' } },
    );

    // Subagent invocations show up as tool calls in the response.
    type ToolCall = { toolName?: string };
    const toolCalls = (response.toolCalls ?? []) as ToolCall[];
    const calledNames = toolCalls.map((c) => c.toolName).filter((n): n is string => Boolean(n));
    const ok = calledNames.includes(expectedToolName);
    results.push({ ...fixture, toolCalls: calledNames, ok });
  } catch (err) {
    results.push({
      ...fixture,
      toolCalls: [],
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const passed = results.filter((r) => r.ok).length;
const accuracy = passed / results.length;

console.log(`Results: ${passed}/${results.length} (${(accuracy * 100).toFixed(1)}%)\n`);
for (const r of results) {
  const status = r.ok ? '✓' : '✗';
  console.log(`${status} ${r.expectedSubagent.padEnd(8)}  ${r.input}`);
  if (!r.ok) {
    console.log(`    tools called: ${r.toolCalls.length ? r.toolCalls.join(', ') : '(none)'}`);
    if (r.error) console.log(`    error: ${r.error}`);
  }
}

console.log(`\nRouting accuracy: ${(accuracy * 100).toFixed(1)}%  (threshold: ${(ROUTING_THRESHOLD * 100).toFixed(0)}%)`);

if (accuracy < ROUTING_THRESHOLD) {
  process.exit(1);
}
