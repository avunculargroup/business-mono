import type { ContentVectorSearchResult, NewsVectorSearchResult } from '@platform/db';
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

// The newsletter is news-led: news_items is the primary source, internal
// content (drafts, client interactions) is supplementary. A modest discount on
// internal content keeps news ahead on close calls while still letting a strong
// internal item surface.
const SOURCE_WEIGHT: Record<RetrievedItem['source_table'], number> = {
  news_items: 1,
  content_items: 0.8,
  interactions: 0.8,
};

// Common shape the ranker operates on — content and news search hits normalise
// into this before scoring so a single composite/sort handles both.
export interface RankableHit {
  id: string;
  source_table: RetrievedItem['source_table'];
  title: string | null;
  summary: string | null;
  body_excerpt: string | null;
  url: string | null;
  created_at: string | null;
  similarity: number;
}

export function contentHitToRankable(hit: ContentVectorSearchResult): RankableHit {
  return {
    id: hit.source_id,
    source_table: hit.source_table,
    title: hit.title,
    summary: hit.summary,
    body_excerpt: hit.body_excerpt,
    url: null,
    created_at: hit.created_at,
    similarity: hit.similarity,
  };
}

export function newsHitToRankable(hit: NewsVectorSearchResult): RankableHit {
  return {
    id: hit.id,
    source_table: 'news_items',
    title: hit.title,
    summary: hit.summary,
    body_excerpt: hit.summary,
    url: hit.url,
    created_at: hit.published_at,
    similarity: hit.similarity,
  };
}

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
 * Attach recency + composite scores to normalised search hits and return them
 * sorted by composite score (best first). News and internal-content hits share
 * one ranking; the per-source weight keeps the newsletter news-led.
 */
export function scoreAndRank(
  hits: RankableHit[],
  timeRange: TimeRange,
  now: number = Date.now(),
): RetrievedItem[] {
  const windowDays = TIME_RANGE_DAYS[timeRange];
  return hits
    .map((hit) => {
      const recency = recencyScore(hit.created_at, windowDays, now);
      const base = SIMILARITY_WEIGHT * hit.similarity + RECENCY_WEIGHT * recency;
      const composite = base * SOURCE_WEIGHT[hit.source_table];
      return {
        id: hit.id,
        source_table: hit.source_table,
        title: hit.title,
        summary: hit.summary,
        body_excerpt: hit.body_excerpt,
        url: hit.url,
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

// Similarity floor for the newsletter ideation pool. Deliberately low: with
// text-embedding-3-small the absolute cosine of a short seed query against full
// news articles sits around 0.2–0.4, so the old 0.5 floor starved the pool to a
// handful and Rex returned "no relevant stories". This is only a noise floor —
// the pool is actually bounded and ordered by the `count` cap, the composite
// (similarity + recency + source) re-rank, and Rex's curation, not by this value.
export const NEWSLETTER_RETRIEVAL_THRESHOLD = 0.2;
