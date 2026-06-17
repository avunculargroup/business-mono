import { describe, it, expect } from 'vitest';

import { cleanNewsTitle } from './cleanTitle';

describe('cleanNewsTitle', () => {
  it('strips a trailing " - Publication" source suffix', () => {
    expect(cleanNewsTitle('Bitcoin hits new high - The Manila Times')).toBe('Bitcoin hits new high');
  });

  it('handles en-dash, em-dash and pipe separators', () => {
    expect(cleanNewsTitle('Story – CoinDesk')).toBe('Story');
    expect(cleanNewsTitle('Story — Bitcoin Magazine')).toBe('Story');
    expect(cleanNewsTitle('Story | Reuters')).toBe('Story');
  });

  it('peels stacked source/section suffixes, not just the last one', () => {
    expect(
      cleanNewsTitle(
        'Hyperscale Data Treasury Update – Company Announcement - FT.com - Financial Times',
      ),
    ).toBe('Hyperscale Data Treasury Update');
    expect(
      cleanNewsTitle('Cybersecurity Failures – Cyber Law Watch - K&L Gates'),
    ).toBe('Cybersecurity Failures');
  });

  it('trims surrounding whitespace', () => {
    expect(cleanNewsTitle('  Padded title - Source  ')).toBe('Padded title');
  });

  it('leaves titles without a separator untouched', () => {
    expect(cleanNewsTitle('Just a headline')).toBe('Just a headline');
  });

  it('does not split hyphenated terms without space padding', () => {
    expect(cleanNewsTitle('U.S.-Iran tensions rise')).toBe('U.S.-Iran tensions rise');
  });

  it('keeps a long trailing segment (not a publication name)', () => {
    const title = 'Why this matters - and what it means for the next decade of finance';
    expect(cleanNewsTitle(title)).toBe(title);
  });

  it('keeps a trailing segment that ends like a sentence', () => {
    expect(cleanNewsTitle('A question - really?')).toBe('A question - really?');
  });

  it('bails out when stripping would leave almost nothing', () => {
    expect(cleanNewsTitle('AB - CoinDesk')).toBe('AB - CoinDesk');
  });
});
