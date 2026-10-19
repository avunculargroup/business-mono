import { describe, expect, it } from 'vitest';
import { abstractOverlap, summaryStrings } from './papers.js';

const ABSTRACT =
  'Using daily data from 2014 to 2021, we find that bitcoin returns are uncorrelated with equity returns '
  + 'outside periods of market stress, and that the correlation rises sharply during drawdowns.';

describe('abstractOverlap', () => {
  it('passes a summary written in its own words', () => {
    const result = abstractOverlap(
      'The authors report little co-movement between bitcoin and shares in calm markets, rising in sell-offs.',
      ABSTRACT,
    );
    expect(result.copiedRuns).toEqual([]);
    expect(result.overlap).toBe(0);
  });

  it('blocks six consecutive words lifted from the abstract', () => {
    const result = abstractOverlap('In their sample, bitcoin returns are uncorrelated with equity returns.', ABSTRACT);
    expect(result.copiedRuns).toEqual(['bitcoin returns are uncorrelated with equity returns']);
  });

  it('allows five, because the rule starts at six', () => {
    expect(abstractOverlap('They say bitcoin returns are uncorrelated with shares.', ABSTRACT).copiedRuns).toEqual([]);
  });

  it('ignores case and punctuation when matching', () => {
    const result = abstractOverlap('Bitcoin Returns, are UNCORRELATED with equity returns!', ABSTRACT);
    expect(result.copiedRuns).toHaveLength(1);
  });

  it('allows the words inside straight or curly quotation marks', () => {
    for (const quoted of [
      'The authors write that "bitcoin returns are uncorrelated with equity returns" in calm periods.',
      'The authors write that “bitcoin returns are uncorrelated with equity returns” in calm periods.',
    ]) {
      expect(abstractOverlap(quoted, ABSTRACT).copiedRuns).toEqual([]);
    }
  });

  it('does not join the text either side of a quotation into one run', () => {
    // "bitcoin returns are" + "with equity returns" would be six words only if the quote were ignored.
    const result = abstractOverlap('bitcoin returns are "not" with equity returns', ABSTRACT);
    expect(result.copiedRuns).toEqual([]);
  });

  it('does not join two summary fields into one run', () => {
    const result = abstractOverlap(['bitcoin returns are', 'uncorrelated with equity returns'], ABSTRACT);
    expect(result.copiedRuns).toEqual([]);
  });

  it('reports the share of the summary that was copied', () => {
    const result = abstractOverlap('bitcoin returns are uncorrelated with equity returns plus four more words', ABSTRACT);
    expect(result.overlap).toBeCloseTo(7 / 11);
  });

  it('merges overlapping matches into one maximal run', () => {
    const result = abstractOverlap('we find that bitcoin returns are uncorrelated with equity returns', ABSTRACT);
    expect(result.copiedRuns).toEqual(['we find that bitcoin returns are uncorrelated with equity returns']);
  });
});

describe('summaryStrings', () => {
  it('flattens a structured summary in field order', () => {
    expect(
      summaryStrings({
        question: 'q',
        findings: [{ claim: 'c1', locator: 'p. 4' }, { claim: 'c2', locator: 'p. 9' }],
        limitations: ['l'],
      }),
    ).toEqual(['q', 'c1', 'p. 4', 'c2', 'p. 9', 'l']);
  });
});
