import { describe, it, expect } from 'vitest';

import { cosineSimilarity } from './cosineSimilarity.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('returns 1 for parallel vectors of different magnitude', () => {
    expect(cosineSimilarity([1, 0, 0], [5, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1);
  });

  it('returns 0 for empty input', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for length-mismatched vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });

  it('returns 0 when a vector has zero magnitude', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});
