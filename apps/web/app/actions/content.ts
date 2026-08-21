'use server';

import { getAuthedRepositories } from '@/lib/action';
import { resolveReadContext } from '@platform/data-supabase';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { humanizeError } from '@/lib/errors';
import type { ContentStatus } from '@platform/shared';

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

  const auth = await getAuthedRepositories();
  if (!auth.ok) return { error: auth.error };
  const data = parsed.data;

  try {
    await auth.repositories.content.createItem({
      title: data.title,
      type: data.type,
      body: data.body || null,
      status: data.status as ContentStatus,
      scheduledFor: data.scheduled_for || null,
      authorId: data.author_id || null,
    });
  } catch (err) {
    return { error: humanizeError(err) };
  }

  revalidatePath('/content');
  revalidatePath('/');
  return { success: true };
}

const UNEDITABLE_STATUSES = ['published', 'archived'];

/**
 * Persist a manual edit to a draft's title/body. Blocked once published or
 * while the publish poller holds the row.
 *
 * The compliance reset that used to live here — an edit to an account- or
 * campaign-linked draft returns it to pending so the recheck listener re-runs
 * Lex — is now the repository's, because it is an invariant rather than a
 * caller's choice. What stays here is the refusals, which are copy.
 */
export async function updateContentBody(id: string, input: { title?: string; body: string }) {
  const auth = await getAuthedRepositories();
  if (!auth.ok) return { error: auth.error };
  const { content } = auth.repositories;

  try {
    const guard = await content.getEditGuard(resolveReadContext(), id);
    if (!guard) return { error: 'Content item not found.' };
    if (UNEDITABLE_STATUSES.includes(guard.status)) {
      return { error: 'Published content can no longer be edited.' };
    }
    if (guard.isPublishLocked) {
      return { error: 'This post is being published right now and cannot be edited.' };
    }
    if (guard.isThread) {
      return { error: 'Thread segments are edited per segment, not here.' };
    }

    await content.updateBody(id, input);
  } catch (err) {
    return { error: humanizeError(err) };
  }

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

  const auth = await getAuthedRepositories();
  if (!auth.ok) return { error: auth.error };
  const { content } = auth.repositories;

  try {
    // One read where there were three. The gate gathers the item, its account's
    // credential and the platform's character limit; the rules below — and
    // their wording — stay here, because a director reads them.
    const gate = await content.getPublishGate(resolveReadContext(), id);
    if (!gate) return { error: 'Content item not found.' };

    if (gate.type !== 'linkedin') {
      return { error: 'Only LinkedIn posts can be scheduled for API publishing.' };
    }
    if (gate.status !== 'approved' && gate.status !== 'scheduled') {
      return { error: 'Approve the post before scheduling it.' };
    }
    if (!gate.approvedBy) {
      return { error: 'Posts must be approved by a person before scheduling.' };
    }
    if (gate.complianceStatus !== 'cleared' && gate.complianceStatus !== 'overridden') {
      return { error: 'Compliance review has not cleared this post.' };
    }
    if (gate.isThread) {
      return { error: 'Threads are not supported on LinkedIn.' };
    }
    if (!gate.body || !gate.body.trim()) {
      return { error: 'The post body is empty.' };
    }
    if (!gate.socialAccountId) {
      return { error: 'Link the post to a social account first.' };
    }
    if (!gate.credentialExpiresAt) {
      return {
        error: 'The LinkedIn account is not connected — connect it in Settings → Integrations.',
      };
    }
    if (new Date(gate.credentialExpiresAt).getTime() <= Date.now()) {
      return {
        error: 'The LinkedIn token has expired — reconnect it in Settings → Integrations.',
      };
    }
    if (gate.maxChars && gate.body.length > gate.maxChars) {
      return {
        error: `The post is ${gate.body.length} characters — LinkedIn allows ${gate.maxChars}.`,
      };
    }

    await content.schedule(id, when);
  } catch (err) {
    return { error: humanizeError(err) };
  }

  revalidatePath('/content');
  revalidatePath(`/content/${id}`);
  return { success: true };
}

/** Publish immediately: schedule for now — the poller picks it up within a minute. */
export async function postContentNow(id: string) {
  return scheduleContent(id, new Date().toISOString());
}

export async function updateContentStatus(id: string, status: string) {
  const auth = await getAuthedRepositories();
  if (!auth.ok) return { error: auth.error };

  try {
    await auth.repositories.content.setStatus(id, status as ContentStatus);
  } catch (err) {
    return { error: humanizeError(err) };
  }

  revalidatePath('/content');
  return { success: true };
}
