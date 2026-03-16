import { supabase } from '../client.js';

export interface VectorSearchResult {
  id: string;
  title: string;
  summary: string | null;
  similarity: number;
}

export async function vectorSearch(
  queryEmbedding: number[],
  options: {
    matchThreshold?: number;
    matchCount?: number;
  } = {}
): Promise<VectorSearchResult[]> {
  const { matchThreshold = 0.7, matchCount = 10 } = options;

  const { data, error } = await supabase.rpc('vector_search', {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) throw new Error(`Vector search failed: ${error.message}`);
  return data ?? [];
}
