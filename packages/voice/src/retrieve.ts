import { supabase } from '@platform/db';
import type { Platform, VoiceSnippet } from './types.js';

export interface RetrieveSnippetsParams {
  /** Query embedding — typically the beat's `core_message` embedded. */
  queryEmbedding: number[];
  /** Account scope. NULL retrieves company-canon snippets only. */
  accountId?: string | null;
  /** Platform filter. NULL imposes no platform filter. */
  platform?: Platform | null;
  /** Max snippets to return. */
  count?: number;
  /** Flat bonus added to a starred snippet's similarity when ranking. */
  starBoost?: number;
  /** Minimum cosine similarity (0..1) a snippet must clear. */
  threshold?: number;
}

/**
 * Top-N voice_snippets by similarity to the query embedding, via the
 * `match_voice_snippets` RPC. Scoping (account + umbrella vs umbrella-only),
 * platform matching, and starred weighting all live in the RPC. Mirrors the
 * existing vector-search wrappers (contentVectorSearch / newsVectorSearch).
 */
export async function retrieveVoiceSnippets(
  params: RetrieveSnippetsParams,
): Promise<VoiceSnippet[]> {
  const { queryEmbedding, accountId = null, platform = null, count = 5, starBoost = 0.05, threshold = 0 } =
    params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('match_voice_snippets', {
    query_embedding: queryEmbedding,
    p_account_id: accountId,
    p_platform: platform,
    match_count: count,
    star_boost: starBoost,
    match_threshold: threshold,
  });

  if (error) throw new Error(`Voice snippet retrieval failed: ${error.message}`);
  return (data ?? []) as VoiceSnippet[];
}
