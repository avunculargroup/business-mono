/**
 * Shared news-ingestion pipeline.
 *
 * Takes a normalised, already-extracted item from any ingestion path (email
 * newsletter today; RSS/podcast on retrofit) and produces a persisted
 * news_items row: dedupe → embed → Rex rubric score → persist.
 *
 * Source-specific work (HTML→markdown, feed parsing, metadata extraction)
 * happens in the caller; this is the common back end. Everything that arrives
 * is stored — the rubric decides what is worth attention, not what is ingested,
 * so a scoring failure still persists the item (with a null score).
 */

import { supabase } from '@platform/db';
import type { NewsCategory } from '@platform/shared';
import { embedText } from '../lib/embedText.js';
import { scoreNewsItem, RUBRIC_VERSION, type SimilarItem } from './newsRubric.js';

// Cosine-similarity at/above which a new item is treated as the same underlying
// story as a recent one (cross-source duplicate). Matches runNewsSourceScan.
const SEMANTIC_DEDUP_THRESHOLD = 0.88;
// Window for both the duplicate check and the novelty neighbours.
const SIMILAR_LOOKBACK_DAYS = 60;

export interface IngestNewsItemInput {
  /** id is null for search-derived items (web/Tavily) that have no news_sources row. */
  source: { id: string | null; name: string; tier: string | null };
  title: string;
  /** Cleaned markdown body. */
  body: string;
  /** Extractor summary — used as the stored summary only if rubric scoring fails. */
  fallbackSummary: string;
  category: NewsCategory;
  keyPoints: string[];
  topicTags: string[];
  australianRelevance: boolean;
  author?: string | null;
  publishedAt: string | null;
  /** Real or synthesized (Message-ID-derived) URL — satisfies news_items.url NOT NULL UNIQUE. */
  url: string;
  /** Real "view in browser"/original link, when distinct from url. */
  canonicalUrl?: string | null;
  /** Email Message-ID — idempotency key, deduped before url/semantic dedup. */
  ingestionRef?: string | null;
  hasPdfAttachment?: boolean;
  attachmentCount?: number;
  ingestedBy?: string;
  routineId?: string | null;
  /**
   * Embedding of `title\nsummary`, when the caller already computed one (RSS/web
   * paths embed during their own dedup phase). Skips the internal embed call and
   * is reused for the semantic-dedup search and persistence.
   */
  precomputedEmbedding?: number[] | null;
  /** Persisted news_items.status. Defaults to 'new'; callers pass 'extraction_failed' when metadata extraction failed. */
  status?: 'new' | 'extraction_failed';
}

export type IngestStatus = 'inserted' | 'duplicate' | 'failed';

export interface IngestNewsItemResult {
  status: IngestStatus;
  newsItemId?: string;
  relevanceScore?: number | null;
  scoringFailed?: boolean;
  reason?: string;
}

/** Merge extractor + rubric topics, deduped, lowercase, order-preserving. */
export function mergeTopics(...lists: ReadonlyArray<readonly string[]>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const t = raw.trim().toLowerCase();
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  }
  return out;
}

export async function ingestNewsItem(input: IngestNewsItemInput): Promise<IngestNewsItemResult> {
  // 1. ingestion_ref dedup (cheap; avoids embedding a re-delivered email).
  //    Scoped by source_id, so only meaningful when the item has one.
  if (input.ingestionRef && input.source.id) {
    const { data: existingRef } = await supabase
      .from('news_items')
      .select('id')
      .eq('source_id', input.source.id)
      .eq('ingestion_ref', input.ingestionRef)
      .limit(1);
    if (existingRef && existingRef.length > 0) {
      return { status: 'duplicate', reason: 'ingestion_ref' };
    }
  }

  // 2. exact-url dedup.
  const { data: existingUrl } = await supabase
    .from('news_items')
    .select('id')
    .eq('url', input.url)
    .limit(1);
  if (existingUrl && existingUrl.length > 0) {
    return { status: 'duplicate', reason: 'url' };
  }

  // 3. embed (title + summary, matching the rest of the news pipeline so
  //    vector_search_news comparisons are like-for-like). Reuse the caller's
  //    embedding when supplied (RSS/web paths already embed the same string).
  const embedding =
    input.precomputedEmbedding ??
    (await embedText(`${input.title}\n${input.fallbackSummary}`.trim()));

  // 4. semantic dedup + novelty neighbours in one vector search.
  let similar: SimilarItem[] = [];
  if (embedding) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: near } = await (supabase.rpc as any)('vector_search_news', {
      query_embedding: embedding,
      match_threshold: 0.0,
      match_count: 3,
      filter_category: null,
      filter_days: SIMILAR_LOOKBACK_DAYS,
    });
    const rows = (near ?? []) as Array<{ title: string; summary: string | null; similarity: number; published_at: string | null }>;
    if (rows.length > 0 && rows[0].similarity >= SEMANTIC_DEDUP_THRESHOLD) {
      return { status: 'duplicate', reason: 'semantic' };
    }
    similar = rows.map((r) => ({
      title: r.title,
      summary: r.summary,
      similarity: r.similarity,
      published_at: r.published_at,
    }));
  }

  // 5. Rex rubric scoring. Null = scoring failed after retry; we still persist.
  const scored = await scoreNewsItem({
    title: input.title,
    body: input.body,
    sourceName: input.source.name,
    sourceTier: input.source.tier,
    similar,
  });

  // 6. persist. news_items gained source_id/ingestion_ref/rubric columns in
  // 20260617000000; the generated types lag until post-migration regen, so the
  // row is cast at the insert boundary (the existing pipeline does the same).
  const row = {
    title: input.title,
    url: input.url,
    source_id: input.source.id,
    source_name: input.source.name,
    ingestion_ref: input.ingestionRef ?? null,
    canonical_url: input.canonicalUrl ?? null,
    author: input.author ?? null,
    published_at: input.publishedAt,
    body_markdown: input.body,
    summary: scored?.summary ?? input.fallbackSummary,
    key_points: input.keyPoints,
    topic_tags: mergeTopics(input.topicTags, scored?.topics ?? []),
    category: input.category,
    australian_relevance: input.australianRelevance,
    relevance_score: scored?.relevanceScore ?? null,
    relevance_reasoning: scored?.relevanceReasoning ?? null,
    curator_notes: scored?.suggestedCuratorNotes ?? null,
    rex_metadata: scored
      ? {
          dimension_scores: scored.dimensionScores,
          flags: scored.flags,
          needs_human_review: scored.needsHumanReview,
          rubric_version: scored.rubricVersion,
        }
      : { rubric_version: RUBRIC_VERSION, scoring_failed: true },
    has_pdf_attachment: input.hasPdfAttachment ?? false,
    attachment_count: input.attachmentCount ?? 0,
    embedding: embedding as unknown as string,
    status: input.status ?? 'new',
    ingested_by: input.ingestedBy ?? 'rex',
    routine_id: input.routineId ?? null,
  };

  const { data: inserted, error } = await supabase
    .from('news_items')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(row as any)
    .select('id')
    .single();

  if (error) {
    // A concurrent insert that won the url/ingestion_ref unique race is a
    // duplicate, not a failure.
    if ((error as { code?: string }).code === '23505') {
      return { status: 'duplicate', reason: 'unique_violation' };
    }
    return { status: 'failed', reason: error.message };
  }

  return {
    status: 'inserted',
    newsItemId: (inserted as { id: string } | null)?.id,
    relevanceScore: scored?.relevanceScore ?? null,
    scoringFailed: scored === null,
  };
}
