import OpenAI from 'openai';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@platform/shared';

// Embedding for voice_snippets. Lives in the application layer (not a DB
// trigger) so the OpenAI key stays server-side, mirroring contentEmbeddings.
// Lazily constructed so importing this module never requires the key at load
// time — only calling embedVoiceText() does.

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
  }
  return client;
}

/**
 * Embed a single string via OpenAI text-embedding-3-small (1536 dims). Call
 * this when a snippet's `body` is created or changed — the embed-on-save path —
 * and to embed a beat's `core_message` before retrieval.
 */
export async function embedVoiceText(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0]?.embedding ?? [];
}
