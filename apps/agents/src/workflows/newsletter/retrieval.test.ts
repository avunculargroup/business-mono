import { describe, it, expect } from 'vitest';
import type { ContentVectorSearchResult } from '@platform/db';
import { recencyScore, scoreAndRank, TIME_RANGE_DAYS } from './retrieval.js';

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
  const hit = (id: string, similarity: number, ageDays: number): ContentVectorSearchResult => ({
    source_id: id,
    source_table: 'content_items',
    title: id,
    summary: null,
    body_excerpt: null,
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

  it('maps time ranges to lookback windows', () => {
    expect(TIME_RANGE_DAYS).toEqual({ week: 7, fortnight: 14, month: 30 });
  });
});
