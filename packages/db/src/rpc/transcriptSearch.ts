import { supabase } from '../client.js';

export interface TranscriptVectorSearchResult {
  segment_id: string;
  episode_id: string;
  episode_title: string;
  source_name: string | null;
  start_seconds: number | null;
  end_seconds: number | null;
  speaker: string | null;
  content: string;
  youtube_url: string | null;
  audio_url: string | null;
  curator_note: string | null;
  published_at: string | null;
  similarity: number;
}

// Semantic search over transcript_segments, joined back to the episode + source.
// Returns one row per matching segment (not best-per-episode) so callers can
// deep-link to the exact moment. Modelled on newsVectorSearch.
export async function transcriptVectorSearch(
  queryEmbedding: number[],
  options: {
    threshold?: number;
    count?: number;
    days?: number;
  } = {},
): Promise<TranscriptVectorSearchResult[]> {
  const { threshold = 0.5, count = 20, days } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('vector_search_transcripts', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: count,
    filter_days: days ?? null,
  });

  if (error) throw new Error(`Transcript vector search failed: ${error.message}`);
  return (data ?? []) as TranscriptVectorSearchResult[];
}
