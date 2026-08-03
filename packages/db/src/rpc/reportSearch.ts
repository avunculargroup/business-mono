import { supabase } from '../client.js';

/**
 * One row from `search_segments()` — a passage from a report OR a podcast
 * transcript, in one ranked list.
 *
 * `redistribution` is the column that must not be dropped on the way through.
 * It says what may be done with the passage downstream, and a retrieval surface
 * that returns the text without the restriction makes the restriction
 * unenforceable at the point it matters — drafting. NULL for transcript hits:
 * podcasts are not licence-restricted the way institutional research is.
 */
export interface SegmentSearchResult {
  source_type: 'report' | 'transcript';
  segment_id: string;
  /** report_id or episode_id, depending on source_type. */
  parent_id: string;
  parent_title: string;
  /** 'p. 14' for a report page, 'start 930s' for a transcript moment. */
  locator: string | null;
  content: string;
  redistribution: 'internal_only' | 'quotable' | 'client_shareable' | null;
  similarity: number;
}

export type SegmentSourceType = 'report' | 'transcript';

/**
 * Semantic search across report and transcript segments.
 *
 * The function unions two separately-indexed subqueries so both HNSW indexes
 * are used; `match_count` caps each side AND the merged result, so asking for 20
 * can return the best 20 from either corpus rather than 10 of each.
 */
export async function segmentSearch(
  queryEmbedding: number[],
  options: {
    /** Defaults to both corpora. */
    sourceTypes?: SegmentSourceType[];
    count?: number;
  } = {},
): Promise<SegmentSearchResult[]> {
  const { sourceTypes = ['report', 'transcript'], count = 20 } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('search_segments', {
    query_embedding: queryEmbedding,
    source_types: sourceTypes,
    match_count: count,
  });

  if (error) throw new Error(`Segment search failed: ${error.message}`);
  return (data ?? []) as SegmentSearchResult[];
}
