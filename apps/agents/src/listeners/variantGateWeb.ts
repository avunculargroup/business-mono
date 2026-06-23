import { createRealtimeClient } from '@platform/db';
import { resumeVariantRun, validateVariantDecision } from '../workflows/variant/run.js';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';

// Web approval path for the variant Gate 3. The /campaigns variant editor can't
// reach the agents server over HTTP, so it writes the director's decision into
// content_items.pending_decision; this listener reacts via Supabase Realtime and
// resumes the workflow. The web mirror of the newsletter's newsletterGateWeb.ts.

const supabase = createRealtimeClient();

export interface VariantGateRow {
  id: string;
  workflow_run_id: string | null;
  gate_state: unknown;
  pending_decision: unknown;
}

/**
 * Handle one content_items row carrying a pending_decision. A row is a
 * suspended variant only while gate_state is set and it has a run id. Atomically
 * claims the decision (conditional clear) so a concurrent listener — or the
 * write that resuming itself emits — can't process it twice, then resumes the
 * workflow. Exported for unit testing.
 */
export async function handleVariantGateRow(row: VariantGateRow): Promise<void> {
  if (row.pending_decision == null || row.gate_state == null || !row.workflow_run_id) return;

  const resumeData = validateVariantDecision(row.pending_decision);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };

  // Atomic claim: clear pending_decision only if it's still set. If the update
  // affects no row, another handler already claimed it — bail out.
  const { data: claimed } = await db
    .from('content_items')
    .update({ pending_decision: null })
    .eq('id', row.id)
    .not('pending_decision', 'is', null)
    .select('id');
  if (!claimed || claimed.length === 0) return;

  if (!resumeData) {
    console.error('[variant-gate-web] Invalid decision for', row.id, row.pending_decision);
    return;
  }

  console.log('[variant-gate-web] Resuming', row.workflow_run_id, 'with', resumeData.decision);
  await resumeVariantRun({ runId: row.workflow_run_id, resumeData });
}

/**
 * Subscribe to content_items and resume any suspended variant whose web decision
 * has been written to pending_decision.
 */
export function startVariantGateWebListener(): void {
  subscribeWithReconnect({
    client: supabase,
    channelName: 'variant-gate-web',
    logPrefix: '[variant-gate-web]',
    onSubscribed: () => {
      console.log('[variant-gate-web] Listening for web gate decisions via Supabase Realtime');
    },
    attachHandlers: (channel) =>
      channel.on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'content_items' },
        async (payload: { eventType: string; new: VariantGateRow }) => {
          try {
            if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
            await handleVariantGateRow(payload.new);
          } catch (err) {
            console.error('[variant-gate-web] Error handling gate decision:', err);
          }
        },
      ),
  });
}
