'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Variant Gate 3 decisions from the /campaigns variant editor. The web app never
// reaches the agents server over HTTP, so — like the newsletter gate — the
// decision is written to content_items.pending_decision; the agents-side
// variantGateWeb listener claims it and resumes the suspended workflow.

const decisionSchema = z.object({
  decision: z.enum(['approve', 'request_change']),
  instruction: z.string().trim().min(1).max(2000).optional(),
  approvedBy: z.string().uuid().optional(),
});

export async function submitVariantGateDecision(
  contentItemId: string,
  decision: unknown,
): Promise<{ success?: true; error?: string }> {
  const parsed = decisionSchema.safeParse(decision);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid decision' };
  }
  if (parsed.data.decision === 'request_change' && !parsed.data.instruction) {
    return { error: 'Tell Charlie what to change before requesting a revision.' };
  }

  const supabase = await createClient();
  // content_items gate columns aren't in the web Database types until
  // db:generate-types runs post-migration — cast at the boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('content_items')
    .update({ pending_decision: parsed.data })
    .eq('id', contentItemId);
  if (error) return { error: error.message };

  revalidatePath(`/campaigns/variants/${contentItemId}`);
  return { success: true };
}
