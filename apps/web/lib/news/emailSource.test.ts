import { describe, it, expect } from 'vitest';
import { slugify, computeInboundAddress, parseSenderAllowlist } from './emailSource';

describe('slugify', () => {
  it('lowercases, hyphenates, and trims to a safe slug', () => {
    expect(slugify('Gromen Tree Rings')).toBe('gromen-tree-rings');
    expect(slugify('  Bitwise CIO!  ')).toBe('bitwise-cio');
    expect(slugify('Lyn Alden — Premium')).toBe('lyn-alden-premium');
  });
  it('returns empty string for input with no alphanumerics', () => {
    expect(slugify('***')).toBe('');
  });
  it('caps length at 40 chars', () => {
    expect(slugify('a'.repeat(60)).length).toBe(40);
  });
});

describe('computeInboundAddress', () => {
  it('builds research+{slug}@domain', () => {
    expect(computeInboundAddress('gromen', 'btreasury.com.au')).toBe('research+gromen@btreasury.com.au');
  });
});

describe('parseSenderAllowlist', () => {
  it('splits on newlines and commas, lowercases, dedupes, drops blanks', () => {
    expect(parseSenderAllowlist('Gromen.com\nnews@bitwise.com, gromen.com\n\n')).toEqual([
      'gromen.com',
      'news@bitwise.com',
    ]);
  });
  it('returns [] for empty input', () => {
    expect(parseSenderAllowlist('')).toEqual([]);
  });
});
