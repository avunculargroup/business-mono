/**
 * Lex compliance-review accuracy eval.
 *
 * Runs every fixture in `evals/lex-compliance/fixtures.json` through the real
 * Lex agent (via reviewDraftForCompliance) and a real LLM, then checks that the
 * verdict's `passes` matches the fixture's `shouldPass`. Advice-framed copy must
 * FAIL the gate; neutral context copy must PASS. The suite fails if accuracy
 * drops below ACCURACY_THRESHOLD.
 *
 * This hits real APIs. Don't run it in CI. Locally:
 *   pnpm --filter @platform/agents test:eval
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewDraftForCompliance } from '../src/agents/compliance/index.js';

interface Fixture {
  title: string;
  body: string;
  shouldPass: boolean;
  rationale: string;
}

const ACCURACY_THRESHOLD = 0.85;

const here = dirname(fileURLToPath(import.meta.url));
const fixtures: Fixture[] = JSON.parse(
  readFileSync(resolve(here, 'lex-compliance/fixtures.json'), 'utf-8'),
);

describe('lex-compliance eval', () => {
  it(`classifies ≥ ${(ACCURACY_THRESHOLD * 100).toFixed(0)}% of fixtures correctly (advice fails, context passes)`, async () => {
    let correct = 0;
    const failures: Array<{ title: string; expected: boolean; got: boolean }> = [];

    for (const f of fixtures) {
      const verdict = await reviewDraftForCompliance({ title: f.title, body: f.body });
      const ok = verdict.passes === f.shouldPass;
      if (ok) correct += 1;
      else failures.push({ title: f.title, expected: f.shouldPass, got: verdict.passes });
      const status = ok ? '✓' : '✗';
      // eslint-disable-next-line no-console
      console.log(`${status} expected ${f.shouldPass ? 'PASS' : 'FAIL'}  ${f.title}`);
    }

    const accuracy = correct / fixtures.length;
    // eslint-disable-next-line no-console
    console.log(`\nLex compliance accuracy: ${(accuracy * 100).toFixed(0)}% (${correct}/${fixtures.length})`);
    if (failures.length) console.table(failures);

    expect(accuracy).toBeGreaterThanOrEqual(ACCURACY_THRESHOLD);
  }, 120_000);
});
