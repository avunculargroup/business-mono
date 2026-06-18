import { describe, it, expect } from 'vitest';
import { composeRelevanceScore, deriveFlags, RUBRIC_VERSION } from './newsRubric.js';

describe('composeRelevanceScore', () => {
  it('weights material 0.5, novelty 0.3, citation 0.2', () => {
    // 0.70×0.5 + 0.60×0.3 + 0.80×0.2 = 0.69 (no rounding boundary)
    expect(composeRelevanceScore({ material: 0.7, novelty: 0.6, citation: 0.8 })).toBe(0.69);
  });

  it('a high-material item dominated by the 0.5 weight', () => {
    // 0.90×0.5 + 0.60×0.3 + 0.50×0.2 = 0.73
    expect(composeRelevanceScore({ material: 0.9, novelty: 0.6, citation: 0.5 })).toBe(0.73);
  });

  it('a low off-topic item scores low', () => {
    // 0.20×0.5 + 0.20×0.3 + 0.20×0.2 = 0.20
    expect(composeRelevanceScore({ material: 0.2, novelty: 0.2, citation: 0.2 })).toBe(0.2);
  });

  it('is 0 and 1 at the extremes', () => {
    expect(composeRelevanceScore({ material: 0, novelty: 0, citation: 0 })).toBe(0);
    expect(composeRelevanceScore({ material: 1, novelty: 1, citation: 1 })).toBe(1);
  });
});

describe('deriveFlags', () => {
  it('passes model flags through, deduped', () => {
    expect(deriveFlags({ material: 0.8, novelty: 0.7, citation: 0.75 }, ['compliance_implication', 'compliance_implication']))
      .toEqual(['compliance_implication']);
  });

  it('adds low_confidence_score when dimensions diverge by more than 0.5', () => {
    const flags = deriveFlags({ material: 0.9, novelty: 0.2, citation: 0.8 }, []);
    expect(flags).toContain('low_confidence_score');
  });

  it('does not add low_confidence_score at exactly 0.5 range', () => {
    expect(deriveFlags({ material: 0.9, novelty: 0.4, citation: 0.5 }, [])).toEqual([]);
  });

  it('combines a model flag with a derived one', () => {
    const flags = deriveFlags({ material: 1.0, novelty: 0.1, citation: 0.5 }, ['breaking_signal']);
    expect(flags).toEqual(['breaking_signal', 'low_confidence_score']);
  });
});

describe('RUBRIC_VERSION', () => {
  it('is pinned', () => {
    expect(RUBRIC_VERSION).toBe('v1');
  });
});
