import { supabase } from '@platform/db';
import { embedVoiceText } from '@platform/voice';

// Backfills voice_snippets.embedding for rows that have none — e.g. snippets
// imported directly into the table, bypassing the seed script's embed-on-save
// step. Runs once on startup, so every deploy/restart sweeps up anything
// missed since the last one. Bounded so a cold start with a large backlog
// can't trigger an unbounded embedding bill.
const BACKFILL_LIMIT = 500;

type SnippetRow = { id: string; body: string };

export async function backfillMissingVoiceEmbeddings(): Promise<void> {
  try {
    const { data: rows, error } = await supabase
      .from('voice_snippets')
      .select('id, body')
      .is('embedding', null)
      .order('created_at', { ascending: false })
      .limit(BACKFILL_LIMIT);
    if (error) throw new Error(`voice_snippets select failed: ${error.message}`);

    for (const row of (rows ?? []) as SnippetRow[]) {
      if (!row.body) continue;
      try {
        const embedding = await embedVoiceText(row.body);
        const { error: updError } = await supabase
          .from('voice_snippets')
          .update({ embedding: embedding as unknown as string })
          .eq('id', row.id);
        if (updError) throw new Error(`voice_snippets update failed: ${updError.message}`);
        console.log(`[voice-embeddings] Backfilled voice_snippet ${row.id}`);
      } catch (err) {
        console.error(`[voice-embeddings] Backfill failed for voice_snippet ${row.id}:`, err);
      }
    }

    console.log(`[voice-embeddings] Backfill complete (${(rows ?? []).length} candidate rows)`);
  } catch (err) {
    console.error('[voice-embeddings] Backfill failed (non-fatal):', err);
  }
}

export function startVoiceEmbeddingListener(): void {
  if (process.env['VOICE_EMBEDDING_LISTENER_ENABLED'] === 'false') {
    console.log('[voice-embeddings] Disabled via VOICE_EMBEDDING_LISTENER_ENABLED=false');
    return;
  }
  void backfillMissingVoiceEmbeddings();
}
