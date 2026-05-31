'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

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
  if (findError) return { error: findError.message };
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
  if (updateError) return { error: updateError.message };

  revalidatePath('/content');
  return { success: true };
}
