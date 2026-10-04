import { describe, it, expect } from 'vitest';
import { normalizeNewsUrl, dedupeShortlistIndices, isListingPageUrl } from './newsDedup.js';

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

describe('isListingPageUrl', () => {
  it.each([
    'https://financialcrimematters.com/type/fraud-scams',
    'https://financialcrimematters.com/type/money-laundering',
    'https://altcoinbuzz.io/category/crypto-news',
    'https://example.com/tag/bitcoin',
    'https://example.com/news/category',
    'https://example.com/author/jane-doe',
    'https://example.com/category/crypto/page/2',
    'https://trend.digital/',
  ])('flags the listing page %s', (url) => {
    expect(isListingPageUrl(url)).toBe(true);
  });

  it.each([
    'https://deloitte.com/us/en/insights/topics/economy/global-economic-outlook/weekly-update.html',
    'https://www.coinbase.com/bytes/archive/btc-bounced-back-to-63k-but-can-it-last',
    'https://cryptorank.io/news/feed/cb41c-strive-adds-1355-bitcoin-as-corporate-treasury-reaches-26355-btc',
    'https://cnbc.com/2026/06/26/treasury-yields-edge-lower-as-energy-prices-slide.html',
    'https://sec.gov/Archives/edgar/data/1050446/000119312526403417/mstr-20260914.htm',
  ])('keeps the article %s', (url) => {
    expect(isListingPageUrl(url)).toBe(false);
  });

  it('does not throw on an unparseable URL', () => {
    expect(isListingPageUrl('not a url')).toBe(false);
  });
});
