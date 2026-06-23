import { createRealtimeClient } from '@platform/db';
import {
  startStrategyRun,
  resumeStrategyRun,
  validateStrategyDecision,
  type GateStepId,
} from '../workflows/strategy/run.js';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';

// Web launch + approval path for the Campaign Strategy workflow's two gates. The
// /campaigns wizard can't reach the agents server over HTTP, so it writes the
// director's decision into campaigns.pending_decision; this listener reacts via
// Supabase Realtime. One channel carries both:
//   * { decision: 'start' } on a draft campaign with no run id → launch the run.
//   * a gate resume payload on a suspended campaign → resume the named gate.
// The web mirror of the newsletter/variant gate listeners.

const supabase = createRealtimeClient();

export interface StrategyGateRow {
  id: string;
  status: string;
  workflow_run_id: string | null;
  gate_state: { gate?: string } | null;
  pending_decision: unknown;
}

/** True when a decision payload is the launch signal. */
function isStartDecision(decision: unknown): boolean {
  return (
    typeof decision === 'object' &&
    decision !== null &&
    (decision as { decision?: unknown }).decision === 'start'
  );
}

/**
 * Handle one campaigns row carrying a pending_decision. Atomically claims the
 * decision (conditional clear) so a concurrent listener — or the write resuming
 * itself emits — can't process it twice, then starts or resumes the workflow.
 * Exported for unit testing.
 */
export async function handleStrategyGateRow(row: StrategyGateRow): Promise<void> {
  if (row.pending_decision == null) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };

  const claim = async (): Promise<boolean> => {
    const { data: claimed } = await db
      .from('campaigns')
      .update({ pending_decision: null })
      .eq('id', row.id)
      .not('pending_decision', 'is', null)
      .select('id');
    return Boolean(claimed && claimed.length > 0);
  };

  // Launch: a 'start' decision on a campaign with no run yet.
  if (!row.workflow_run_id && isStartDecision(row.pending_decision)) {
    if (!(await claim())) return;
    console.log('[strategy-gate-web] Starting strategy run for campaign', row.id);
    await startStrategyRun({ campaignId: row.id });
    return;
  }

  // Resume: a gate decision on a suspended campaign. The persisted gate_state
  // names which gate the founder is deciding against.
  if (!row.workflow_run_id || row.gate_state == null) return;
  const step = row.gate_state.gate;
  if (step !== 'gate1' && step !== 'gate2') return;

  const resumeData = validateStrategyDecision(step as GateStepId, row.pending_decision);

  if (!(await claim())) return;
  if (!resumeData) {
    console.error('[strategy-gate-web] Invalid decision for', row.id, row.pending_decision);
    return;
  }

  console.log('[strategy-gate-web] Resuming', row.workflow_run_id, 'at', step);
  await resumeStrategyRun({ runId: row.workflow_run_id, step: step as GateStepId, resumeData });
}

/**
 * Subscribe to campaigns and start/resume any run whose web decision has been
 * written to pending_decision.
 */
export function startStrategyGateWebListener(): void {
  subscribeWithReconnect({
    client: supabase,
    channelName: 'strategy-gate-web',
    logPrefix: '[strategy-gate-web]',
    onSubscribed: () => {
      console.log('[strategy-gate-web] Listening for web gate decisions via Supabase Realtime');
    },
    attachHandlers: (channel) =>
      channel.on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'campaigns' },
        async (payload: { eventType: string; new: StrategyGateRow }) => {
          try {
            if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
            await handleStrategyGateRow(payload.new);
          } catch (err) {
            console.error('[strategy-gate-web] Error handling gate decision:', err);
          }
        },
      ),
  });
}
