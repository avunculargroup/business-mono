import { describe, it, expect } from 'vitest';
import { normalizeNewsUrl, dedupeShortlistIndices } from './newsDedup.js';

describe('normalizeNewsUrl', () => {
  it('strips a streamIndex param so share-stream variants collapse', () => {
    const base = 'https://www.forbes.com/sites/x/2026/06/12/spacex-now-8th-largest/';
    expect(normalizeNewsUrl(`${base}?streamIndex=0`)).toBe(normalizeNewsUrl(base));
  });

  it('strips utm_* tracking params and the trailing question mark', () => {
    expect(
      normalizeNewsUrl('https://example.com/article?utm_source=x&utm_medium=email'),
    ).toBe('https://example.com/article');
  });

  it('keeps meaningful query params', () => {
    expect(normalizeNewsUrl('https://example.com/p?id=42&utm_source=x')).toBe(
      'https://example.com/p?id=42',
    );
  });

  it('lowercases host, drops leading www and the fragment, trims trailing slash', () => {
    expect(normalizeNewsUrl('https://WWW.Example.com/Path/#section')).toBe(
      'https://example.com/Path',
    );
  });

  it('leaves the root path slash intact', () => {
    expect(normalizeNewsUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('falls back to the trimmed input for an unparseable URL', () => {
    expect(normalizeNewsUrl('  not a url  ')).toBe('not a url');
  });
});

describe('dedupeShortlistIndices', () => {
  it('removes repeated indices while preserving order', () => {
    expect(dedupeShortlistIndices([{ index: 0 }, { index: 0 }, { index: 1 }])).toEqual([
      { index: 0 },
      { index: 1 },
    ]);
  });

  it('is a no-op when all indices are unique', () => {
    const input = [{ index: 2 }, { index: 0 }, { index: 1 }];
    expect(dedupeShortlistIndices(input)).toEqual(input);
  });
});
