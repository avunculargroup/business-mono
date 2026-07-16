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

// Cosine-similarity floor for a hit. The RPC's own default is 0.5, which is far
// too high for this corpus: transcript_segments are long (~2.3k chars), so a
// short query embeds to a point that lands well below 0.5 even against segments
// that are squarely on topic — within-topic segment-to-segment pairs top out
// around 0.70, and a keyword query scores lower still. At 0.5 a search for a
// single common term like "Bitcoin" returns nothing despite ~40% of segments
// mentioning it. Results are ranked and capped at RESULT_COUNT, so a low floor
// surfaces the best moments while still letting a genuinely off-topic query
// come back empty.
const MATCH_THRESHOLD = 0.2;

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
      match_threshold: MATCH_THRESHOLD,
      match_count: RESULT_COUNT,
    });
    // Let the shared catch humanize the PostgREST error with its code intact.
    if (error) throw error;
    return { results: (data ?? []) as TranscriptSearchHit[] };
  } catch (err) {
    return { error: humanizeError(err) };
  }
}
