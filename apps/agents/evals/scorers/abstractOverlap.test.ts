import { describe, it, expect } from 'vitest';
import { abstractOverlapScorer } from './abstractOverlap.js';

const ABSTRACT = 'We find that bitcoin returns are uncorrelated with equity returns outside periods of market stress.';

async function score(output: unknown, groundTruth: unknown): Promise<number> {
  const result = await abstractOverlapScorer.run({ output, groundTruth });
  return result.score as number;
}

describe('abstractOverlapScorer', () => {
  it('scores 0 for a summary in its own words', async () => {
    expect(await score({ question: 'Do bitcoin and shares move together?' }, { abstract: ABSTRACT })).toBe(0);
  });

  it('scores the copied share of a structured summary', async () => {
    const summary = {
      question: 'Do they comove?',
      findings: [{ claim: 'bitcoin returns are uncorrelated with equity returns', locator: 'p. 4' }],
    };
    // 7 copied words out of 3 + 7 + 2.
    expect(await score(summary, { abstract: ABSTRACT })).toBeCloseTo(7 / 12);
  });

  it('accepts the plain-text render', async () => {
    expect(await score('bitcoin returns are uncorrelated with equity returns', { abstract: ABSTRACT })).toBe(1);
  });

  it('scores 0 when the item has no abstract', async () => {
    expect(await score('anything', {})).toBe(0);
  });
});
