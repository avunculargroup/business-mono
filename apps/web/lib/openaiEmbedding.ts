// Server-only query embedding for transcript search. The agents server owns the
// write-side embedding pipeline (transcript_segments); the web app only needs to
// embed a single search query to run vector_search_transcripts. Rather than pull
// in the full openai SDK for one call, we hit the REST endpoint directly — the
// same model + dimensions the ingestion pipeline used, so the vectors are
// comparable.
//
// Must only be imported from server code (server actions): it reads
// OPENAI_API_KEY and calls out to OpenAI.

import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@platform/shared';

const ENDPOINT = 'https://api.openai.com/v1/embeddings';

/**
 * Embed a single query string with the ingestion pipeline's model/dimensions.
 * Throws on a missing key or a non-2xx response so the caller can map it to a
 * humane message.
 */
export async function embedQuery(query: string): Promise<number[]> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: query,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    throw new Error(`Embedding request failed (${res.status})`);
  }

  const json = (await res.json()) as { data?: { embedding?: number[] }[] };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding || embedding.length === 0) {
    throw new Error('Embedding response was empty');
  }
  return embedding;
}
