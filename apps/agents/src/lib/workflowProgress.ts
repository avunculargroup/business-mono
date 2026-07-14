import { supabase } from '@platform/db';
import { createLogger } from './logger.js';

const log = createLogger('workflow-progress');

// workflow_progress isn't in the generated Database types until
// `pnpm --filter @platform/db generate-types` runs post-migration. Cast at the
// boundary, same pattern as podcast_episodes in transcripts/store.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Marks the current step of a workflow run for the web UI to render (e.g.
 * "Margot is drafting the strategy…"). Best-effort — a failure here must never
 * abort the workflow it's tracking, so errors are logged and swallowed.
 */
export async function setWorkflowProgress(
  runId: string | undefined,
  stepId: string,
  stepLabel: string,
): Promise<void> {
  if (!runId) return;
  const { error } = await db
    .from('workflow_progress')
    .upsert({ workflow_run_id: runId, step_id: stepId, step_label: stepLabel } as never, {
      onConflict: 'workflow_run_id',
    });
  if (error) log.error({ error: error.message }, 'upsert failed');
}

/** Clears the progress row once a run suspends at a gate or reaches a terminal state. */
export async function clearWorkflowProgress(runId: string | undefined): Promise<void> {
  if (!runId) return;
  const { error } = await db.from('workflow_progress').delete().eq('workflow_run_id', runId);
  if (error) log.error({ error: error.message }, 'delete failed');
}
