'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthedRepositories } from '@/lib/action';
import { humanizeError } from '@/lib/errors';

// Feedback on a daily market report's narration, submitted from the
// /market-reports/[id] review page. The narration excerpt is snapshotted by the
// repository so the agents-side distiller (marketReportFeedbackListener) needs
// no joins — the insert itself wakes the listener via Supabase Realtime.

const feedbackSchema = z.object({
  marketReportId: z.string().uuid(),
  feedback: z.string().trim().min(1, 'Write a note first'),
  verdict: z.enum(['positive', 'negative']).optional(),
});

export async function submitMarketReportFeedback(input: {
  marketReportId: string;
  feedback: string;
  verdict?: 'positive' | 'negative';
}) {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const auth = await getAuthedRepositories();
  if (!auth.ok) return { error: auth.error };

  try {
    const recorded = await auth.repositories.marketReports.addReportFeedback(
      parsed.data.marketReportId,
      { feedback: parsed.data.feedback, verdict: parsed.data.verdict },
    );
    if (!recorded) return { error: 'That report no longer exists.' };
  } catch (err) {
    return { error: humanizeError(err) };
  }

  revalidatePath(`/market-reports/${parsed.data.marketReportId}`);
  return { success: true };
}
