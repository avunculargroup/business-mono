'use server';

import type { TranscriptVectorSearchResult } from '@platform/db';
import { createClient } from '@/lib/supabase/server';
import { embedQuery } from '@/lib/openaiEmbedding';
import { humanizeError } from '@/lib/errors';

export type TranscriptSearchHit = TranscriptVectorSearchResult;

export type SearchTranscriptsResult =
  | { results: TranscriptSearchHit[] }
  | { error: string };

const MIN_QUERY_LENGTH = 3;
const RESULT_COUNT = 20;

// "Ask the library" — semantic search across ingested transcript_segments.
// Embeds the query with the ingestion pipeline's model and runs the pgvector
// RPC (the same retrieval Rex uses), returning one row per matching segment so
// the UI can deep-link to the exact moment.
//
// Runs the RPC through the web app's request-scoped anon client (RLS,
// authenticated session) rather than @platform/db's service-role singleton —
// the web app only has NEXT_PUBLIC_SUPABASE_* configured, and this read is
// permitted to the `authenticated` role, so no service-role key is needed.
export async function searchTranscripts(query: string): Promise<SearchTranscriptsResult> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return { error: 'Enter a few words to search for.' };
  }

  try {
    const embedding = await embedQuery(trimmed);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('vector_search_transcripts', {
      // pgvector serialises the float array to its text form on the wire.
      query_embedding: embedding as unknown as string,
      match_count: RESULT_COUNT,
    });
    if (error) throw new Error(`Transcript vector search failed: ${error.message}`);
    return { results: (data ?? []) as TranscriptSearchHit[] };
  } catch (err) {
    return { error: humanizeError(err) };
  }
}
