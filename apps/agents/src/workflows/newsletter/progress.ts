import { supabase } from '@platform/db';

// Fine-grained progress for the /content newsletter widget. The newsletter_runs
// `status` column only tracks coarse lifecycle states, so everything between the
// two human gates (research, drafting, editing, assembly) reads as a flat
// 'running'. `current_step` records the workflow step currently executing so the
// web stepper can show live movement during the slow drafting phase.

// newsletter_runs isn't in the generated Database types yet — cast at the
// boundary, same as startNewsletterRun.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (table: string) => any };
const db = supabase as unknown as AnyClient;

/** The workflow steps that report progress, in execution order. */
export const NEWSLETTER_STEPS = [
  'retrieve',
  'select_stories',
  'gate1',
  'research_enrich',
  'draft_generation',
  'editorial_review',
  'assemble',
  'gate2',
  'persist',
] as const;

export type NewsletterStep = (typeof NEWSLETTER_STEPS)[number];

/**
 * Record the step a run has reached. Best-effort by design: progress display is
 * a notification, not the system of record, so a write failure must never abort
 * the step (same philosophy as notifySignal). A missing runId is a no-op.
 */
export async function markStep(
  runId: string | undefined,
  step: NewsletterStep,
): Promise<void> {
  if (!runId) return;
  try {
    await db.from('newsletter_runs').update({ current_step: step }).eq('workflow_run_id', runId);
  } catch (err) {
    console.warn(`[newsletter] failed to record current_step=${step} (continuing):`, err);
  }
}
