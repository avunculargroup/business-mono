/**
 * Simon routing accuracy eval.
 *
 * Runs every fixture in `evals/simon-routing/fixtures.json` against the real
 * Simon agent and a real LLM (Anthropic or OpenRouter, depending on env), then
 * scores each run with `routedToAgentScorer` — 1 if Simon called the expected
 * `agent-<name>` delegation tool, else 0. The suite fails if average accuracy
 * drops below ROUTING_THRESHOLD.
 *
 * This hits real APIs and triggers real side effects (Charlie etc.). Don't run
 * it in CI. Locally:  pnpm --filter @platform/agents test:eval
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEvals } from '@mastra/core/evals';
import { simon } from '../src/agents/simon/index.js';
import { routedToAgentScorer } from './scorers/routedToAgent.js';

interface Fixture {
  input: string;
  expectedSubagent: string;
  rationale: string;
}

const ROUTING_THRESHOLD = 0.9;

const here = dirname(fileURLToPath(import.meta.url));
const fixtures: Fixture[] = JSON.parse(
  readFileSync(resolve(here, 'simon-routing/fixtures.json'), 'utf-8'),
);

describe('simon-routing eval', () => {
  it(`routes ≥ ${(ROUTING_THRESHOLD * 100).toFixed(0)}% of fixtures to the expected subagent`, async () => {
    const failures: Array<{ input: string; expected: string }> = [];

    const result = await runEvals({
      target: simon,
      data: fixtures.map((f) => ({
        input: f.input,
        groundTruth: { expectedSubagent: f.expectedSubagent },
      })),
      scorers: { trajectory: [routedToAgentScorer] },
      concurrency: 2,
      // No memory thread passed — each generate() call is stateless, which is
      // what we want for routing accuracy: every fixture is evaluated in
      // isolation, with no carry-over from earlier ones.
      onItemComplete: ({ item, scorerResults }) => {
        const score = scorerResults?.trajectory?.['routed-to-agent']?.score ?? 0;
        const expected = (item.groundTruth as { expectedSubagent: string }).expectedSubagent;
        const status = score === 1 ? '✓' : '✗';
        // eslint-disable-next-line no-console
        console.log(`${status} ${expected.padEnd(8)}  ${String(item.input).slice(0, 80)}`);
        if (score !== 1) failures.push({ input: String(item.input), expected });
      },
    });

    const trajectoryScores = (result.scores as { trajectory?: Record<string, number> }).trajectory ?? {};
    const accuracy = trajectoryScores['routed-to-agent'] ?? 0;

    // eslint-disable-next-line no-console
    console.log(
      `\nRouting accuracy: ${(accuracy * 100).toFixed(1)}% ` +
        `(threshold ${(ROUTING_THRESHOLD * 100).toFixed(0)}%, ${fixtures.length} fixtures)`,
    );
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`Failures (${failures.length}):`);
      for (const f of failures) console.log(`  expected=${f.expected}: ${f.input.slice(0, 100)}`);
    }

    expect(accuracy).toBeGreaterThanOrEqual(ROUTING_THRESHOLD);
  });
});
