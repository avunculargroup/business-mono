import OpenAI from 'openai';
import { supabase } from '@platform/db';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@platform/shared';

// Shared embedding helper for the content_embeddings RAG store. Embedding lives
// in the application (agents) layer rather than a DB trigger so the OpenAI key
// stays server-side and the logic is testable. Used by contentEmbeddingListener
// (embed-on-write + backfill) and re-usable anywhere a content_embeddings row
// needs (re)generating.

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

// content_embeddings is not in the generated Database types until
// `pnpm --filter @platform/db generate-types` runs post-migration. Cast at the
// boundary; the row shape is asserted explicitly here.
type EmbeddingsClient = {
  from: (table: 'content_embeddings') => {
    delete: () => {
      eq: (col: 'source_table', val: string) => {
        eq: (col: 'source_id', val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
    insert: (rows: ContentEmbeddingInsert[]) => Promise<{ error: { message: string } | null }>;
  };
};

interface ContentEmbeddingInsert {
  source_table: SourceTable;
  source_id: string;
  chunk_index: number;
  chunk_text: string;
  embedding: number[];
}

export type SourceTable = 'content_items' | 'interactions';

// ~4 chars per token. 512-token chunks with 64-token overlap → the spec's
// recommended default. Most summaries fit in a single chunk; long call
// transcripts get windowed.
const CHARS_PER_CHUNK = 512 * 4;
const CHARS_OVERLAP = 64 * 4;

/** Split text into overlapping windows. Returns [text] when it fits in one chunk. */
export function chunkText(text: string): string[] {
  const clean = text.trim();
  if (clean.length <= CHARS_PER_CHUNK) return clean.length > 0 ? [clean] : [];

  const chunks: string[] = [];
  const stride = CHARS_PER_CHUNK - CHARS_OVERLAP;
  for (let start = 0; start < clean.length; start += stride) {
    chunks.push(clean.slice(start, start + CHARS_PER_CHUNK));
    if (start + CHARS_PER_CHUNK >= clean.length) break;
  }
  return chunks;
}

/** Embed a single string via OpenAI text-embedding-3-small. */
export async function embedText(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0]?.embedding ?? [];
}

/**
 * (Re)generate embeddings for one source row. Chunks the text, embeds each
 * chunk, and replaces any existing rows for this source (delete-then-insert) so
 * the operation is idempotent. No-op when text is empty.
 */
export async function embedSource(
  sourceTable: SourceTable,
  sourceId: string,
  text: string | null | undefined,
): Promise<{ chunks: number }> {
  const client = supabase as unknown as EmbeddingsClient;
  const chunks = chunkText(text ?? '');

  // Always clear prior chunks first so a shortened/blanked source doesn't leave
  // stale vectors behind.
  const { error: delError } = await client
    .from('content_embeddings')
    .delete()
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId);
  if (delError) throw new Error(`content_embeddings delete failed: ${delError.message}`);

  if (chunks.length === 0) return { chunks: 0 };

  const embeddings = await Promise.all(chunks.map((c) => embedText(c)));
  const rows: ContentEmbeddingInsert[] = chunks.map((chunk, i) => ({
    source_table: sourceTable,
    source_id: sourceId,
    chunk_index: i,
    chunk_text: chunk,
    embedding: embeddings[i] ?? [],
  }));

  const { error: insError } = await client.from('content_embeddings').insert(rows);
  if (insError) throw new Error(`content_embeddings insert failed: ${insError.message}`);

  return { chunks: rows.length };
}
