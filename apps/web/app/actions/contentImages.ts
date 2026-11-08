'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { lintImageBrief, toBrandVisual } from '@platform/shared';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';

// The image slot on /content/[id]. Two kinds of action live here:
//
//   * Ones the agents server does — regenerate, render with an edited brief,
//     and re-check alt text after an edit. These INSERT a content_image_requests
//     row; contentImageRequestListener claims it via Realtime and the page shows
//     its progress from the row's status.
//   * Ones that need no model — saving alt text, removing an image, promoting it
//     to a style anchor. These write directly.
//
// One render serves every crop in its generation group (the LinkedIn and X
// drafts of one run), so remove and promote act on the whole group.
// Spec: docs/features/social-post-image/feature-spec.md → UI

const BUCKET = 'platform-files';
const ANCHOR_FOLDER = 'social-images/anchors';
/** Stored anchors; the render sends the first four. */
const MAX_STYLE_ANCHORS = 8;

const uuid = z.string().uuid();

const briefSchema = z.object({
  motif_key: z.string().trim().min(1, 'Choose a motif'),
  subject: z.string().trim().min(1, 'Describe the subject').max(200, 'Keep the subject under 200 characters'),
  metaphor: z.string().trim().max(200, 'Keep the metaphor under 200 characters').optional().default(''),
  composition: z.string().trim().max(200, 'Keep the composition note under 200 characters').optional().default(''),
  alt_text: z.string().trim().min(1, 'Write the alt text').max(300, 'Keep the alt text under 300 characters'),
});
export type ImageBriefInput = z.input<typeof briefSchema>;

type Supabase = Extract<Awaited<ReturnType<typeof getAuthedClient>>, { ok: true }>['supabase'];

function revalidate(contentItemId: string) {
  revalidatePath(`/content/${contentItemId}`);
}

async function openRequest(supabase: Supabase, contentItemId: string): Promise<boolean> {
  const { data } = await supabase
    .from('content_image_requests')
    .select('id')
    .eq('content_item_id', contentItemId)
    .in('status', ['pending', 'working'])
    .limit(1);
  return (data ?? []).length > 0;
}

async function queue(
  contentItemId: string,
  action: 'regenerate' | 'render_brief',
  brief: Record<string, unknown> | null,
): Promise<{ error: string } | { success: true }> {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  if (await openRequest(supabase, contentItemId)) {
    return { error: 'An image is already being made for this draft. Wait for it to finish.' };
  }
  const { error } = await supabase
    .from('content_image_requests')
    .insert({ content_item_id: contentItemId, action, brief: brief as never, requested_by: user.id });
  if (error) return { error: humanizeError(error) };

  revalidate(contentItemId);
  return { success: true };
}

/** New render, same brief. Replaces the image on every draft that shares it. */
export async function requestImageRegenerate(contentItemId: string) {
  if (!uuid.safeParse(contentItemId).success) return { error: 'That draft could not be found.' };
  return queue(contentItemId, 'regenerate', null);
}

/**
 * Render with a founder-edited brief. Linted here against the active canon
 * first, so a prohibited term is named on the page rather than discovered by
 * the agents server after the slide-over has closed.
 */
export async function requestImageRender(contentItemId: string, input: ImageBriefInput) {
  if (!uuid.safeParse(contentItemId).success) return { error: 'That draft could not be found.' };
  const parsed = briefSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { data: canonRow } = await auth.supabase
    .from('brand_visual')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!canonRow) return { error: 'There is no brand visual canon yet. Set one up in Brand → Visual.' };

  const canon = toBrandVisual(canonRow);
  const brief = {
    skip: false,
    skip_reason: null,
    motif_key: parsed.data.motif_key,
    subject: parsed.data.subject,
    metaphor: parsed.data.metaphor || null,
    composition: parsed.data.composition || null,
    alt_text: parsed.data.alt_text,
  };
  const flags = lintImageBrief(brief, { motifs: canon.motifs, prohibitedTerms: canon.prohibitedTerms });
  if (flags.length > 0) return { error: `Change the brief before rendering: ${flags.join(' ')}` };

  return queue(contentItemId, 'render_brief', brief);
}

const altTextSchema = z.object({
  contentItemId: uuid,
  generationGroupId: uuid,
  altText: z.string().trim().min(1, 'Alt text cannot be empty').max(300, 'Keep the alt text under 300 characters'),
});

/**
 * Save edited alt text across the group and ask Lex to check it again. A
 * clear verdict does not survive an edit, so it is cleared here and the chip
 * reads "checking" until the listener writes the new one.
 */
export async function saveImageAltText(input: { contentItemId: string; generationGroupId: string; altText: string }) {
  const parsed = altTextSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { contentItemId, generationGroupId, altText } = parsed.data;

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('content_images')
    .update({ alt_text: altText, review_outcome: 'kept', alt_text_verdict: null })
    .eq('generation_group_id', generationGroupId);
  if (error) return { error: humanizeError(error) };

  const { error: reqErr } = await supabase
    .from('content_image_requests')
    .insert({ content_item_id: contentItemId, action: 'recheck_alt_text', requested_by: user.id });
  if (reqErr) return { error: humanizeError(reqErr) };

  revalidate(contentItemId);
  return { success: true };
}

const groupSchema = z.object({ contentItemId: uuid, generationGroupId: uuid });

async function groupPaths(supabase: Supabase, generationGroupId: string): Promise<{ crops: string[]; master: string | null }> {
  const { data } = await supabase
    .from('content_images')
    .select('storage_path')
    .eq('generation_group_id', generationGroupId);
  const crops = (data ?? []).map((r) => r.storage_path);
  const first = crops[0];
  const master = first && first.includes('/') ? `${first.slice(0, first.lastIndexOf('/'))}/master-16x9.png` : null;
  return { crops, master };
}

/**
 * Take the image off every draft that shares it. The rows stay, marked
 * 'removed', because the prompt and cost are the record and review_outcome is
 * the signal a later distil step reads; the objects go. A style anchor is a
 * separate copy, so promoting first keeps it.
 */
export async function removeImage(input: { contentItemId: string; generationGroupId: string }) {
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { error: 'That image could not be found.' };
  const { contentItemId, generationGroupId } = parsed.data;

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { crops, master } = await groupPaths(supabase, generationGroupId);
  const { error } = await supabase
    .from('content_images')
    .update({ review_outcome: 'removed' })
    .eq('generation_group_id', generationGroupId);
  if (error) return { error: humanizeError(error) };

  const paths = [...new Set([...crops, ...(master ? [master] : [])])];
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);

  revalidate(contentItemId);
  return { success: true };
}

/**
 * Copy the unmarked master into the anchors folder and add it to the canon's
 * style anchors, so future renders are shown it. The copy is what the canon
 * points at, so removing the post later never removes the anchor; and it is
 * the master, so the model never sees the BTS mark and learns to draw it.
 */
export async function promoteImageToStyleAnchor(input: { contentItemId: string; generationGroupId: string }) {
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { error: 'That image could not be found.' };
  const { contentItemId, generationGroupId } = parsed.data;

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { data: canon } = await supabase
    .from('brand_visual')
    .select('id, style_anchor_paths')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!canon) return { error: 'There is no brand visual canon yet. Set one up in Brand → Visual.' };

  const anchorPath = `${ANCHOR_FOLDER}/${generationGroupId}.png`;
  const anchors = canon.style_anchor_paths ?? [];
  if (anchors.includes(anchorPath)) return { error: 'This image is already a style anchor.' };
  if (anchors.length >= MAX_STYLE_ANCHORS) {
    return { error: `There are already ${MAX_STYLE_ANCHORS} style anchors. Remove one in Brand → Visual first.` };
  }

  const { master } = await groupPaths(supabase, generationGroupId);
  if (!master) return { error: 'That image could not be found.' };
  const { error: copyErr } = await supabase.storage.from(BUCKET).copy(master, anchorPath);
  if (copyErr) return { error: humanizeError(copyErr) };

  const { error } = await supabase
    .from('brand_visual')
    .update({ style_anchor_paths: [...anchors, anchorPath] })
    .eq('id', canon.id);
  if (error) {
    await supabase.storage.from(BUCKET).remove([anchorPath]);
    return { error: humanizeError(error) };
  }
  await supabase.from('content_images').update({ is_style_anchor: true }).eq('generation_group_id', generationGroupId);

  revalidate(contentItemId);
  revalidatePath('/brand');
  return { success: true };
}

/** A 5-minute download link for the marked crop, named for the platform. */
export async function getImageDownloadUrl(storagePath: string) {
  if (!storagePath.startsWith('social-images/')) return { error: 'That image could not be found.' };
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const fileName = storagePath.slice(storagePath.lastIndexOf('/') + 1);
  const { data, error } = await auth.supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 300, { download: `bts-${fileName}` });
  if (error || !data) return { error: humanizeError(error) };
  return { url: data.signedUrl };
}
