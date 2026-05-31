import { supabase } from '../client.js';

export interface ContentVectorSearchResult {
  source_id: string;
  source_table: 'content_items' | 'interactions';
  title: string | null;
  summary: string | null;
  body_excerpt: string | null;
  created_at: string | null;
  similarity: number;
}

/**
 * Semantic search over internal content + interaction embeddings
 * (content_embeddings), joined back to the source row. Powers the newsletter
 * workflow's retrieval step. Mirrors newsVectorSearch.
 */
export async function contentVectorSearch(
  queryEmbedding: number[],
  options: {
    threshold?: number;
    count?: number;
    days?: number;
    source?: 'content_items' | 'interactions';
  } = {},
): Promise<ContentVectorSearchResult[]> {
  const { threshold = 0.5, count = 20, days, source } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('vector_search_content', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: count,
    filter_days: days ?? null,
    filter_source: source ?? null,
  });

  if (error) throw new Error(`Content vector search failed: ${error.message}`);
  return (data ?? []) as ContentVectorSearchResult[];
}
