import { describe, it, expect } from 'vitest';
import { normalizePaywalledDomain } from './paywalledDomain';

describe('normalizePaywalledDomain', () => {
  it.each([
    ['bloomberg.com', 'bloomberg.com'],
    ['  FT.com ', 'ft.com'],
    ['www.afr.com', 'afr.com'],
    ['https://www.wsj.com/articles/some-story?mod=x', 'wsj.com'],
    ['theaustralian.com.au/business', 'theaustralian.com.au'],
    ['markets.ft.com:443', 'markets.ft.com'],
  ])('%s → %s', (raw, domain) => {
    expect(normalizePaywalledDomain(raw)).toEqual({ domain });
  });

  it.each(['', '   ', 'bloomberg', 'not a site', 'http://'])('rejects %j', (raw) => {
    expect(normalizePaywalledDomain(raw)).toHaveProperty('error');
  });
});
