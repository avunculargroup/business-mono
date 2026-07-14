import { createRealtimeClient } from '@platform/db';
import { resumeNewsletterRun, gateStepForStatus } from '../workflows/startNewsletterRun.js';
import { gate1ResumeSchema, gate2ResumeSchema } from '../workflows/newsletter/schemas.js';
import type { Gate1Resume, Gate2Resume } from '../workflows/newsletter/schemas.js';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('newsletter-gate-web');

// Web approval path for the newsletter gates. The /content page can't reach the
// agents server over HTTP, so it writes the director's decision into
// newsletter_runs.pending_decision; this listener reacts via Supabase Realtime
// and resumes the workflow — the web mirror of newsletterGate.ts (Signal).

const supabase = createRealtimeClient();

const SUSPENDED_STATUSES = ['suspended_gate1', 'suspended_gate2', 'suspended_hold'] as const;
type SuspendedStatus = (typeof SUSPENDED_STATUSES)[number];

export interface NewsletterRunRow {
  workflow_run_id: string;
  status: string;
  pending_decision: unknown;
}

/**
 * Validate a web-submitted decision against the resume schema for the run's
 * current gate. gate-1 takes the approve/adjust set; gate-2 and hold both take
 * the publish/revise/hold set. Returns null for an unknown status or a payload
 * that doesn't match — pure so it can be unit-tested.
 */
export function validateWebDecision(
  status: string,
  decision: unknown,
): Gate1Resume | Gate2Resume | null {
  if (status === 'suspended_gate1') {
    const parsed = gate1ResumeSchema.safeParse(decision);
    return parsed.success ? parsed.data : null;
  }
  if (status === 'suspended_gate2' || status === 'suspended_hold') {
    const parsed = gate2ResumeSchema.safeParse(decision);
    return parsed.success ? parsed.data : null;
  }
  return null;
}

function isSuspended(status: string): status is SuspendedStatus {
  return (SUSPENDED_STATUSES as readonly string[]).includes(status);
}

/**
 * Handle one newsletter_runs row carrying a pending_decision. Atomically claims
 * the decision (conditional clear) so a concurrent listener — or the status
 * write that resuming itself emits — can't process it twice, then resumes the
 * workflow. Exported for unit testing.
 */
export async function handleGateRow(row: NewsletterRunRow): Promise<void> {
  if (row.pending_decision == null || !isSuspended(row.status)) return;

  const resumeData = validateWebDecision(row.status, row.pending_decision);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };

  // Atomic claim: clear pending_decision only if it's still set. If the update
  // affects no row, another handler already claimed it — bail out.
  const { data: claimed } = await db
    .from('newsletter_runs')
    .update({ pending_decision: null })
    .eq('workflow_run_id', row.workflow_run_id)
    .not('pending_decision', 'is', null)
    .select('workflow_run_id');
  if (!claimed || claimed.length === 0) return;

  if (!resumeData) {
    log.error(
      { status: row.status, runId: row.workflow_run_id, decision: row.pending_decision },
      'invalid decision',
    );
    return;
  }

  log.info({ runId: row.workflow_run_id, resumeData }, 'resuming');
  await resumeNewsletterRun({
    runId: row.workflow_run_id,
    resumeData,
    step: gateStepForStatus(row.status),
  });
}

/**
 * Subscribe to newsletter_runs and resume any suspended run whose web decision
 * has been written to pending_decision.
 */
export function startNewsletterGateWebListener(): void {
  subscribeWithReconnect({
    client: supabase,
    channelName: 'newsletter-gate-web',
    logPrefix: '[newsletter-gate-web]',
    onSubscribed: () => {
      log.info('listening for web gate decisions via Supabase Realtime');
    },
    attachHandlers: (channel) =>
      channel.on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'newsletter_runs' },
        async (payload: { eventType: string; new: NewsletterRunRow }) => {
          try {
            if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
            await handleGateRow(payload.new);
          } catch (err) {
            log.error({ err }, 'error handling gate decision');
          }
        },
      ),
  });
}
