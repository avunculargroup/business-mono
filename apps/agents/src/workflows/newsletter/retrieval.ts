import type { ContentVectorSearchResult } from '@platform/db';
import type { RetrievedItem, TimeRange } from './schemas.js';

// Pure ranking helpers for the newsletter retrieval step. Kept side-effect free
// so the time-decay / composite-score logic is unit-testable.

export const TIME_RANGE_DAYS: Record<TimeRange, number> = {
  week: 7,
  fortnight: 14,
  month: 30,
};

// Weight similarity slightly above recency: a strong semantic match should
// usually win, but a recent item beats a marginally-better-matching old one.
const SIMILARITY_WEIGHT = 0.6;
const RECENCY_WEIGHT = 0.4;

/**
 * Linear time-decay over the lookback window. 1.0 = now, 0.0 = at/older than
 * the window edge. Items with no date get a neutral 0.5.
 */
export function recencyScore(
  createdAt: string | null,
  windowDays: number,
  now: number = Date.now(),
): number {
  if (!createdAt) return 0.5;
  const ageMs = now - new Date(createdAt).getTime();
  if (Number.isNaN(ageMs)) return 0.5;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const score = 1 - ageMs / windowMs;
  return Math.max(0, Math.min(1, score));
}

/**
 * Attach recency + composite scores to vector-search hits and return them
 * sorted by composite score (best first).
 */
export function scoreAndRank(
  hits: ContentVectorSearchResult[],
  timeRange: TimeRange,
  now: number = Date.now(),
): RetrievedItem[] {
  const windowDays = TIME_RANGE_DAYS[timeRange];
  return hits
    .map((hit) => {
      const recency = recencyScore(hit.created_at, windowDays, now);
      const composite = SIMILARITY_WEIGHT * hit.similarity + RECENCY_WEIGHT * recency;
      return {
        id: hit.source_id,
        source_table: hit.source_table,
        title: hit.title,
        summary: hit.summary,
        body_excerpt: hit.body_excerpt,
        similarity_score: hit.similarity,
        recency_score: recency,
        composite_score: composite,
        created_at: hit.created_at,
      } satisfies RetrievedItem;
    })
    .sort((a, b) => b.composite_score - a.composite_score);
}

// The "what a good newsletter story looks like" query vector seed. Embedded
// once per run and used as the retrieval query.
export const NEWSLETTER_QUERY_SEED =
  'Bitcoin treasury strategy, corporate adoption, regulatory developments, market intelligence, Australian finance context';
