import { createRealtimeClient, supabase } from '@platform/db';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';
import { embedSource } from '../lib/contentEmbeddings.js';

// Keeps the content_embeddings RAG store in sync with its source rows. Embeds:
//   - content_items when they reach status 'approved' or 'published'
//   - interactions when they carry a non-null summary
// This is the spec's "embed-on-write handled by a Mastra tool in the app layer,
// not a DB trigger". A bounded backfill runs on startup so existing rows are
// indexed without a one-off script.

const realtime = createRealtimeClient();

const EMBEDDABLE_CONTENT_STATUSES = new Set(['approved', 'published']);

// Backfill is bounded so a cold start can't trigger an unbounded embedding bill.
const BACKFILL_LIMIT = 200;

type ContentRow = { id: string; status: string | null; title: string | null; body: string | null };
type InteractionRow = { id: string; summary: string | null };

// content_embeddings isn't in the generated Database types until types are
// regenerated post-migration. Cast at the boundary for the source_id lookup.
type ExistingEmbeddingsClient = {
  from: (table: 'content_embeddings') => {
    select: (cols: 'source_id') => {
      eq: (col: 'source_table', val: string) => Promise<{
        data: Array<{ source_id: string }> | null;
        error: { message: string } | null;
      }>;
    };
  };
};

function contentEmbedText(row: ContentRow): string {
  return [row.title, row.body].filter(Boolean).join('\n\n');
}

async function backfillMissing(): Promise<void> {
  try {
    const existingClient = supabase as unknown as ExistingEmbeddingsClient;

    // content_items
    const { data: contentRows } = await supabase
      .from('content_items')
      .select('id, status, title, body')
      .in('status', [...EMBEDDABLE_CONTENT_STATUSES])
      .order('created_at', { ascending: false })
      .limit(BACKFILL_LIMIT);

    const { data: contentEmbedded } = await existingClient
      .from('content_embeddings')
      .select('source_id')
      .eq('source_table', 'content_items');
    const contentDone = new Set((contentEmbedded ?? []).map((r) => r.source_id));

    for (const row of (contentRows ?? []) as ContentRow[]) {
      if (contentDone.has(row.id)) continue;
      const text = contentEmbedText(row);
      if (!text) continue;
      await embedSource('content_items', row.id, text);
    }

    // interactions
    const { data: interactionRows } = await supabase
      .from('interactions')
      .select('id, summary')
      .not('summary', 'is', null)
      .order('occurred_at', { ascending: false })
      .limit(BACKFILL_LIMIT);

    const { data: interactionEmbedded } = await existingClient
      .from('content_embeddings')
      .select('source_id')
      .eq('source_table', 'interactions');
    const interactionDone = new Set((interactionEmbedded ?? []).map((r) => r.source_id));

    for (const row of (interactionRows ?? []) as InteractionRow[]) {
      if (interactionDone.has(row.id)) continue;
      if (!row.summary) continue;
      await embedSource('interactions', row.id, row.summary);
    }

    console.log('[content-embeddings] Backfill complete');
  } catch (err) {
    console.error('[content-embeddings] Backfill failed (non-fatal):', err);
  }
}

export function startContentEmbeddingListener(): void {
  if (process.env['CONTENT_EMBEDDING_LISTENER_ENABLED'] === 'false') {
    console.log('[content-embeddings] Disabled via CONTENT_EMBEDDING_LISTENER_ENABLED=false');
    return;
  }

  void backfillMissing();

  subscribeWithReconnect({
    client: realtime,
    channelName: 'content-embeddings',
    logPrefix: '[content-embeddings]',
    onSubscribed: () => {
      console.log('[content-embeddings] Listening for content_items + interactions changes');
    },
    attachHandlers: (channel) =>
      channel
        .on(
          'postgres_changes' as never,
          { event: '*', schema: 'public', table: 'content_items' },
          async (payload: { eventType: string; new: ContentRow }) => {
            try {
              if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
              const row = payload.new;
              if (!row?.status || !EMBEDDABLE_CONTENT_STATUSES.has(row.status)) return;
              const text = contentEmbedText(row);
              if (!text) return;
              await embedSource('content_items', row.id, text);
              console.log(`[content-embeddings] Embedded content_item ${row.id}`);
            } catch (err) {
              console.error('[content-embeddings] content_items embed failed:', err);
            }
          },
        )
        .on(
          'postgres_changes' as never,
          { event: '*', schema: 'public', table: 'interactions' },
          async (payload: { eventType: string; new: InteractionRow }) => {
            try {
              if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
              const row = payload.new;
              if (!row?.summary) return;
              await embedSource('interactions', row.id, row.summary);
              console.log(`[content-embeddings] Embedded interaction ${row.id}`);
            } catch (err) {
              console.error('[content-embeddings] interactions embed failed:', err);
            }
          },
        ),
  });
}
