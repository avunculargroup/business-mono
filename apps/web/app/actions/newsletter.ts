'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { humanizeError } from '@/lib/errors';

// Triggers an on-demand newsletter run from the /content "Run newsletter"
// button. We reuse the routines mechanism rather than calling the agents server
// directly (the web app never reaches Railway over HTTP): the seeded, dormant
// "On-demand newsletter" routine is armed here (params written into
// action_config, next_run_at = NOW(), is_active = TRUE). The agents cron picks
// it up within ~5 min, launches the newsletter workflow, and deactivates the
// routine again (one_off) so it fires exactly once.

const ON_DEMAND_ROUTINE_NAME = 'On-demand newsletter';

const schema = z.object({
  timeRange: z.enum(['week', 'fortnight', 'month']),
  storyCount: z.coerce.number().int().min(3).max(8),
  targetWordCount: z.coerce.number().int().min(100).max(800),
  audienceContext: z.string().trim().max(500).optional(),
});

export async function runNewsletter(formData: FormData) {
  const parsed = schema.safeParse({
    timeRange: formData.get('timeRange'),
    storyCount: formData.get('storyCount'),
    targetWordCount: formData.get('targetWordCount'),
    audienceContext: formData.get('audienceContext') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }
  const input = parsed.data;

  const supabase = await createClient();

  const { data: routine, error: findError } = await supabase
    .from('routines')
    .select('id')
    .eq('name', ON_DEMAND_ROUTINE_NAME)
    .eq('action_type', 'newsletter')
    .maybeSingle();
  if (findError) return { error: humanizeError(findError) };
  if (!routine) {
    return { error: 'On-demand newsletter routine not found. Has the migration been applied?' };
  }

  const actionConfig = {
    time_range: input.timeRange,
    story_count: input.storyCount,
    target_word_count: input.targetWordCount,
    audience_context: input.audienceContext ?? null,
    one_off: true,
  };

  const { error: updateError } = await supabase
    .from('routines')
    .update({
      action_config: actionConfig as never,
      next_run_at: new Date().toISOString(),
      is_active: true,
    })
    .eq('id', routine.id);
  if (updateError) return { error: humanizeError(updateError) };

  revalidatePath('/content');
  return { success: true };
}

// ── Newsletter gate decisions ────────────────────────────────────────────────
// The /content page approves a suspended newsletter run by writing the
// director's decision to newsletter_runs.pending_decision. The agents-side
// newsletterGateWeb listener claims it and resumes the workflow — the web app
// never reaches Railway over HTTP, so this DB write is the handoff (mirrors how
// runNewsletter arms a routine). The decision shapes match the workflow's
// gate-1 / gate-2 resume schemas.

const gate1DecisionSchema = z.object({
  decision: z.literal('approve'),
}).or(
  z.object({
    decision: z.literal('adjust'),
    adjustment: z.string().trim().min(1).max(2000),
  }),
);

const gate2DecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('publish') }),
  z.object({ decision: z.literal('hold') }),
  z.object({
    decision: z.literal('revise'),
    storyNumber: z.coerce.number().int().min(1),
    instruction: z.string().trim().min(1).max(2000),
  }),
]);

type GateDecision =
  | z.infer<typeof gate1DecisionSchema>
  | z.infer<typeof gate2DecisionSchema>;

export async function submitNewsletterGateDecision(
  workflowRunId: string,
  decision: GateDecision,
) {
  const supabase = await createClient();

  // newsletter_runs isn't in the web Database types — cast at the boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: run, error: findError } = await db
    .from('newsletter_runs')
    .select('status')
    .eq('workflow_run_id', workflowRunId)
    .maybeSingle();
  if (findError) return { error: humanizeError(findError) };
  if (!run) return { error: 'That newsletter run no longer exists.' };

  const status = run.status as string;
  const parsed =
    status === 'suspended_gate1'
      ? gate1DecisionSchema.safeParse(decision)
      : status === 'suspended_gate2' || status === 'suspended_hold'
        ? gate2DecisionSchema.safeParse(decision)
        : null;

  if (!parsed) {
    return { error: 'This run isn\'t waiting for review right now.' };
  }
  if (!parsed.success) {
    return { error: 'That decision doesn\'t match the current review step.' };
  }

  const { error: updateError } = await db
    .from('newsletter_runs')
    .update({ pending_decision: parsed.data })
    .eq('workflow_run_id', workflowRunId);
  if (updateError) return { error: humanizeError(updateError) };

  revalidatePath('/content');
  return { success: true };
}
