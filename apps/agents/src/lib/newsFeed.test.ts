import { describe, it, expect } from 'vitest';
import { normalizeFeedItems, type ScanFeedItem } from './newsFeed.js';

const DAY = 24 * 60 * 60 * 1000;

describe('normalizeFeedItems', () => {
  const now = Date.now();
  const cutoffMs = now - 3 * DAY;

  it('keeps items within the lookback window and drops older ones', () => {
    const items: ScanFeedItem[] = [
      { link: 'https://a.com/new', title: 'New', isoDate: new Date(now - 1 * DAY).toISOString() },
      { link: 'https://a.com/old', title: 'Old', isoDate: new Date(now - 10 * DAY).toISOString() },
    ];
    const out = normalizeFeedItems(items, { sourceName: 'A', cutoffMs, maxItems: 10 });
    expect(out.map((c) => c.url)).toEqual(['https://a.com/new']);
    expect(out[0]).toMatchObject({ title: 'New', source: 'A' });
  });

  it('keeps undated items (dedup guards repeats later)', () => {
    const items: ScanFeedItem[] = [{ link: 'https://a.com/undated', title: 'No date' }];
    const out = normalizeFeedItems(items, { sourceName: 'A', cutoffMs, maxItems: 10 });
    expect(out).toHaveLength(1);
    expect(out[0]?.published_at).toBeNull();
  });

  it('caps to maxItems', () => {
    const items: ScanFeedItem[] = Array.from({ length: 5 }, (_, i) => ({
      link: `https://a.com/${i}`,
      title: `Item ${i}`,
      isoDate: new Date(now).toISOString(),
    }));
    const out = normalizeFeedItems(items, { sourceName: 'A', cutoffMs, maxItems: 2 });
    expect(out).toHaveLength(2);
  });

  it('skips items with no link and falls back to url for a missing title', () => {
    const items: ScanFeedItem[] = [
      { title: 'No link' },
      { link: 'https://a.com/x' },
    ];
    const out = normalizeFeedItems(items, { sourceName: 'A', cutoffMs, maxItems: 10 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ url: 'https://a.com/x', title: 'https://a.com/x' });
  });

  it('uses contentSnippet, then content, for the summary and truncates', () => {
    const long = 'x'.repeat(800);
    const items: ScanFeedItem[] = [
      { link: 'https://a.com/1', title: 'Snippet', contentSnippet: 'short snippet' },
      { link: 'https://a.com/2', title: 'Content', content: long },
    ];
    const out = normalizeFeedItems(items, { sourceName: 'A', cutoffMs, maxItems: 10 });
    expect(out[0]?.summary).toBe('short snippet');
    expect(out[1]?.summary).toHaveLength(500);
  });
});
