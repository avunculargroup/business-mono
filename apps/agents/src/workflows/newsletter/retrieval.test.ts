import { describe, it, expect } from 'vitest';
import type { ContentVectorSearchResult, NewsVectorSearchResult } from '@platform/db';
import {
  recencyScore,
  scoreAndRank,
  contentHitToRankable,
  newsHitToRankable,
  TIME_RANGE_DAYS,
  type RankableHit,
} from './retrieval.js';

const NOW = new Date('2026-05-31T00:00:00Z').getTime();

describe('recencyScore', () => {
  it('returns 1 for an item created now', () => {
    expect(recencyScore(new Date(NOW).toISOString(), 30, NOW)).toBeCloseTo(1);
  });

  it('returns ~0 at the window edge', () => {
    const edge = new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(recencyScore(edge, 30, NOW)).toBeCloseTo(0);
  });

  it('clamps items older than the window to 0', () => {
    const old = new Date(NOW - 90 * 24 * 60 * 60 * 1000).toISOString();
    expect(recencyScore(old, 30, NOW)).toBe(0);
  });

  it('returns neutral 0.5 for missing or invalid dates', () => {
    expect(recencyScore(null, 30, NOW)).toBe(0.5);
    expect(recencyScore('not-a-date', 30, NOW)).toBe(0.5);
  });
});

describe('scoreAndRank', () => {
  const hit = (
    id: string,
    similarity: number,
    ageDays: number,
    source: RankableHit['source_table'] = 'content_items',
  ): RankableHit => ({
    id,
    source_table: source,
    title: id,
    summary: null,
    body_excerpt: null,
    url: null,
    created_at: new Date(NOW - ageDays * 24 * 60 * 60 * 1000).toISOString(),
    similarity,
  });

  it('lets a recent slightly-weaker match beat an old near-perfect one', () => {
    const hits = [hit('old', 0.95, 30), hit('fresh', 0.8, 0)];
    const ranked = scoreAndRank(hits, 'month', NOW);
    expect(ranked[0]?.id).toBe('fresh');
  });

  it('attaches composite scores sorted descending', () => {
    const ranked = scoreAndRank([hit('a', 0.9, 0), hit('b', 0.5, 15)], 'month', NOW);
    expect(ranked[0]!.composite_score).toBeGreaterThanOrEqual(ranked[1]!.composite_score);
  });

  it('ranks news above internal content when similarity and recency tie', () => {
    // News is the newsletter's primary source — equal-strength items should
    // surface the news one first.
    const ranked = scoreAndRank(
      [hit('internal', 0.8, 0, 'content_items'), hit('news', 0.8, 0, 'news_items')],
      'month',
      NOW,
    );
    expect(ranked[0]?.id).toBe('news');
    expect(ranked[0]!.composite_score).toBeGreaterThan(ranked[1]!.composite_score);
  });

  it('maps time ranges to lookback windows', () => {
    expect(TIME_RANGE_DAYS).toEqual({ week: 7, fortnight: 14, month: 30 });
  });
});

describe('hit normalisation', () => {
  it('maps a content search hit, carrying source_table and a null url', () => {
    const content: ContentVectorSearchResult = {
      source_id: 'c1',
      source_table: 'interactions',
      title: 'Call with client',
      summary: 'summary',
      body_excerpt: 'excerpt',
      created_at: '2026-05-30T00:00:00Z',
      similarity: 0.7,
    };
    expect(contentHitToRankable(content)).toEqual({
      id: 'c1',
      source_table: 'interactions',
      title: 'Call with client',
      summary: 'summary',
      body_excerpt: 'excerpt',
      url: null,
      created_at: '2026-05-30T00:00:00Z',
      similarity: 0.7,
    });
  });

  it('maps a news hit, using published_at for recency and keeping the url', () => {
    const news: NewsVectorSearchResult = {
      id: 'n1',
      title: 'BTC headline',
      summary: 'news summary',
      category: 'regulatory',
      published_at: '2026-06-01T00:00:00Z',
      url: 'https://example.com/article',
      similarity: 0.82,
    };
    expect(newsHitToRankable(news)).toEqual({
      id: 'n1',
      source_table: 'news_items',
      title: 'BTC headline',
      summary: 'news summary',
      body_excerpt: 'news summary',
      url: 'https://example.com/article',
      created_at: '2026-06-01T00:00:00Z',
      similarity: 0.82,
    });
  });
});
