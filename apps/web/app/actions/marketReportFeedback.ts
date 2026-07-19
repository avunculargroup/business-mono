'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';

// Feedback on a daily market report's narration, submitted from the
// /market-reports/[id] review page. Snapshots a narration excerpt so the
// agents-side distiller (marketReportFeedbackListener) needs no joins — the
// insert itself wakes the listener via Supabase Realtime.

const EXCERPT_MAX = 500;

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

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  // market_reports / market_report_feedback are not in the generated Database
  // types yet — cast to bypass typing (same pattern as contentFeedback).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: report, error: reportError } = await db
    .from('market_reports')
    .select('id, narration_markdown')
    .eq('id', parsed.data.marketReportId)
    .single();
  if (reportError) return { error: humanizeError(reportError) };

  const { error } = await db.from('market_report_feedback').insert({
    market_report_id: report.id,
    verdict: parsed.data.verdict ?? null,
    feedback: parsed.data.feedback.trim(),
    narration_excerpt: report.narration_markdown ? report.narration_markdown.slice(0, EXCERPT_MAX) : null,
    created_by: user.id,
  });
  if (error) return { error: humanizeError(error) };

  revalidatePath(`/market-reports/${parsed.data.marketReportId}`);
  return { success: true };
}
