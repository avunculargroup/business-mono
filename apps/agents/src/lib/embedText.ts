/**
 * Shared text-embedding helper.
 *
 * Wraps the platform's standard embedding model/dimensions
 * (text-embedding-3-small, 1536) behind one call so callers don't each
 * instantiate an OpenAI client. The client is created lazily and reused.
 */

import OpenAI from 'openai';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@platform/shared';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
  return client;
}

/**
 * Embeds `input` with the platform's standard model. Returns the vector, or
 * null when the input is blank or the API returns no embedding.
 */
export async function embedText(input: string): Promise<number[] | null> {
  const text = input.trim();
  if (!text) return null;
  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return res.data[0]?.embedding ?? null;
}
