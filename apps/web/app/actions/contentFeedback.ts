'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';

// Feedback on a generated social draft, submitted from the /content/[id] review
// page. Denormalises platform / post_form and snapshots the draft text so the
// agents-side distiller (feedbackDistillListener) needs no joins — the insert
// itself wakes the listener via Supabase Realtime.

const EXCERPT_MAX = 500;

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

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  // content_feedback and the campaign content_items columns are not in the
  // generated Database types yet — cast to bypass typing (same pattern as the
  // campaign pages).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: item, error: itemError } = await db
    .from('content_items')
    .select('id, type, body, is_thread, social_account_id, post_form')
    .eq('id', parsed.data.contentItemId)
    .single();
  if (itemError) return { error: humanizeError(itemError) };
  if (!item?.social_account_id) {
    return { error: 'This draft has no social account, so feedback can\'t improve future posts.' };
  }

  let draftText: string = item.body ?? '';
  if (item.is_thread) {
    const { data: segments } = await db
      .from('thread_segments')
      .select('body')
      .eq('content_item_id', item.id)
      .order('sequence', { ascending: true });
    const joined = ((segments ?? []) as Array<{ body: string }>).map((s) => s.body).join(' ');
    if (joined) draftText = joined;
  }

  const { error } = await db.from('content_feedback').insert({
    content_item_id: item.id,
    social_account_id: item.social_account_id,
    platform: item.type,
    post_form: item.post_form ?? null,
    verdict: parsed.data.verdict ?? null,
    feedback: parsed.data.feedback.trim(),
    draft_excerpt: draftText ? draftText.slice(0, EXCERPT_MAX) : null,
    created_by: user.id,
  });
  if (error) return { error: humanizeError(error) };

  revalidatePath(`/content/${parsed.data.contentItemId}`);
  return { success: true };
}
