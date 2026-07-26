'use server';

import { getAuthedClient } from '@/lib/action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { humanizeError } from '@/lib/errors';

const contentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  type: z.string().min(1),
  body: z.string().optional(),
  status: z.string().default('idea'),
  scheduled_for: z.string().optional(),
  author_id: z.string().uuid().optional().or(z.literal('')),
});

export async function createContent(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = contentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const data = parsed.data;

  const { error } = await supabase.from('content_items').insert({
    title: data.title,
    type: data.type,
    body: data.body || null,
    status: data.status,
    scheduled_for: data.scheduled_for || null,
    published_at: null,
    author_id: data.author_id || null,
    knowledge_item_ids: null,
    iteration_count: 0,
  });

  if (error) return { error: humanizeError(error) };

  revalidatePath('/content');
  revalidatePath('/');
  return { success: true };
}

const UNEDITABLE_STATUSES = ['published', 'archived'];

/**
 * Persist a manual edit to a draft's title/body. Blocked once published or
 * while the publish poller holds the row. Editing an account- or
 * campaign-linked draft resets compliance to pending so the recheck listener
 * re-runs Lex — a cleared verdict must not survive an edit.
 */
export async function updateContentBody(id: string, input: { title?: string; body: string }) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { data: existing } = await supabase
    .from('content_items')
    .select('status, is_thread, campaign_id, social_account_id, publish_locked_at')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return { error: 'Content item not found.' };
  if (UNEDITABLE_STATUSES.includes(existing.status)) {
    return { error: 'Published content can no longer be edited.' };
  }
  if (existing.publish_locked_at) {
    return { error: 'This post is being published right now and cannot be edited.' };
  }
  if (existing.is_thread) {
    return { error: 'Thread segments are edited per segment, not here.' };
  }

  const updateData: Record<string, unknown> = {
    body: input.body || null,
    char_count: input.body.length,
  };
  if (input.title !== undefined) updateData.title = input.title || null;
  if (existing.campaign_id || existing.social_account_id) {
    updateData.compliance_status = 'pending';
    updateData.compliance_checked_at = null;
  }

  const { error } = await supabase.from('content_items').update(updateData).eq('id', id);
  if (error) return { error: humanizeError(error) };

  revalidatePath('/content');
  revalidatePath(`/content/${id}`);
  return { success: true };
}

/**
 * Schedule an approved LinkedIn post for API publishing (or re-schedule one).
 * The publish poller enforces the same gates again at post time; failing early
 * here gives the human an actionable error instead of a held card.
 */
export async function scheduleContent(id: string, scheduledFor: string) {
  const when = new Date(scheduledFor);
  if (Number.isNaN(when.getTime())) return { error: 'Pick a valid date and time.' };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { data: item } = await supabase
    .from('content_items')
    .select('status, type, body, approved_by, compliance_status, is_thread, social_account_id')
    .eq('id', id)
    .maybeSingle();
  if (!item) return { error: 'Content item not found.' };

  if (item.type !== 'linkedin') {
    return { error: 'Only LinkedIn posts can be scheduled for API publishing.' };
  }
  if (item.status !== 'approved' && item.status !== 'scheduled') {
    return { error: 'Approve the post before scheduling it.' };
  }
  if (!item.approved_by) {
    return { error: 'Posts must be approved by a person before scheduling.' };
  }
  if (item.compliance_status !== 'cleared' && item.compliance_status !== 'overridden') {
    return { error: 'Compliance review has not cleared this post.' };
  }
  if (item.is_thread) {
    return { error: 'Threads are not supported on LinkedIn.' };
  }
  if (!item.body || !item.body.trim()) {
    return { error: 'The post body is empty.' };
  }
  if (!item.social_account_id) {
    return { error: 'Link the post to a social account first.' };
  }

  const [credentialRes, specRes] = await Promise.all([
    supabase
      .from('social_credentials')
      .select('expires_at')
      .eq('social_account_id', item.social_account_id)
      .maybeSingle(),
    supabase.from('platform_specs').select('max_chars').eq('platform', 'linkedin').maybeSingle(),
  ]);

  if (!credentialRes.data) {
    return { error: 'The LinkedIn account is not connected — connect it in Settings → Integrations.' };
  }
  if (new Date(credentialRes.data.expires_at).getTime() <= Date.now()) {
    return { error: 'The LinkedIn token has expired — reconnect it in Settings → Integrations.' };
  }
  const maxChars = specRes.data?.max_chars;
  if (maxChars && item.body.length > maxChars) {
    return { error: `The post is ${item.body.length} characters — LinkedIn allows ${maxChars}.` };
  }

  const { error } = await supabase
    .from('content_items')
    .update({
      status: 'scheduled',
      scheduled_for: when.toISOString(),
      publish_error: null,
      publish_attempts: 0,
      publish_locked_at: null,
    })
    .eq('id', id);
  if (error) return { error: humanizeError(error) };

  revalidatePath('/content');
  revalidatePath(`/content/${id}`);
  return { success: true };
}

/** Publish immediately: schedule for now — the poller picks it up within a minute. */
export async function postContentNow(id: string) {
  return scheduleContent(id, new Date().toISOString());
}

export async function updateContentStatus(id: string, status: string, extras?: { published_url?: string; published_at?: string }) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const updateData: Record<string, unknown> = { status };
  if (status === 'published' && extras) {
    if (extras.published_at) updateData.published_at = extras.published_at;
  }

  const { error } = await supabase.from('content_items').update(updateData).eq('id', id);
  if (error) return { error: humanizeError(error) };

  revalidatePath('/content');
  return { success: true };
}
