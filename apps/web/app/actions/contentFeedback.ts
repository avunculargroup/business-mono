'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthedRepositories } from '@/lib/action';
import { humanizeError } from '@/lib/errors';

// Feedback on a generated social draft, submitted from the /content/[id] review
// page. The denormalised platform / post_form and the snapshot of the draft
// text are the repository's — they exist so the agents-side distiller
// (feedbackDistillListener) needs no joins, and the insert itself wakes the
// listener via Supabase Realtime.

const feedbackSchema = z.object({
  contentItemId: z.string().uuid(),
  feedback: z.string().trim().min(1, 'Write a note first'),
  verdict: z.enum(['positive', 'negative']).optional(),
});

export async function submitDraftFeedback(input: {
  contentItemId: string;
  feedback: string;
  verdict?: 'positive' | 'negative';
}) {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const auth = await getAuthedRepositories();
  if (!auth.ok) return { error: auth.error };

  try {
    const recorded = await auth.repositories.content.addDraftFeedback(
      parsed.data.contentItemId,
      { feedback: parsed.data.feedback, verdict: parsed.data.verdict },
    );
    if (!recorded) {
      return { error: "This draft has no social account, so feedback can't improve future posts." };
    }
  } catch (err) {
    return { error: humanizeError(err) };
  }

  revalidatePath(`/content/${parsed.data.contentItemId}`);
  return { success: true };
}
