'use server';

import { transcriptVectorSearch, type TranscriptVectorSearchResult } from '@platform/db';
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
export async function searchTranscripts(query: string): Promise<SearchTranscriptsResult> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return { error: 'Enter a few words to search for.' };
  }

  try {
    const embedding = await embedQuery(trimmed);
    const results = await transcriptVectorSearch(embedding, { count: RESULT_COUNT });
    return { results };
  } catch (err) {
    return { error: humanizeError(err) };
  }
}
