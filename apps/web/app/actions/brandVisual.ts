'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { nextBrandVisualVersion } from '@platform/shared';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';

// Brand Hub → Visual: the canon every generated social image is assembled
// from (the brand_visual singleton). Saving bumps the version, because the
// assembled prompt changes and every image records the version it used.
// Removing a style anchor changes what the model is shown, not the prompt, so
// it does not bump. Spec: docs/features/social-post-image/feature-spec.md

const BUCKET = 'platform-files';
const ANCHOR_PREFIX = 'social-images/anchors/';

const hex = z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, 'Colours are six-digit hex values, like #C9A84C');

const canonSchema = z.object({
  style_block: z.string().trim().min(1, 'The style block cannot be empty'),
  composition_block: z.string().trim().min(1, 'The composition block cannot be empty'),
  prohibited_block: z.string().trim().min(1, 'The prohibited block cannot be empty'),
  prohibited_terms: z.array(z.string().trim().min(1)).max(100),
  palette: z
    .array(z.object({ role: z.string().trim().min(1, 'Name every colour'), hex, usage: z.string().trim() }))
    .min(1, 'Keep at least one colour'),
  layouts: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]{1,39}$/, 'Layout keys are lowercase words joined by underscores'),
        label: z.string().trim().min(1, 'Every layout needs a label'),
        description: z.string().trim().min(1, 'Every layout needs a description'),
        is_active: z.boolean(),
      }),
    )
    .refine((l) => l.some((x) => x.is_active), 'Keep at least one layout active')
    .refine((l) => new Set(l.map((x) => x.key)).size === l.length, 'Layout keys must be unique'),
  brand_mark: z.object({
    enabled: z.boolean(),
    height_pct: z.number().min(3, 'Mark height is between 3% and 20%').max(20, 'Mark height is between 3% and 20%'),
    margin_pct: z.number().min(0, 'Margin is between 0% and 10%').max(10, 'Margin is between 0% and 10%'),
  }),
  notes: z.string().trim().optional().default(''),
});
export type BrandVisualInput = z.input<typeof canonSchema>;

export async function saveBrandVisual(input: BrandVisualInput) {
  const parsed = canonSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const { data: existing } = await supabase
    .from('brand_visual')
    .select('id, version, brand_mark')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!existing) return { error: 'There is no brand visual canon to edit yet.' };

  const version = nextBrandVisualVersion(existing.version);
  const { error } = await supabase
    .from('brand_visual')
    .update({
      version,
      style_block: d.style_block,
      composition_block: d.composition_block,
      prohibited_block: d.prohibited_block,
      prohibited_terms: [...new Set(d.prohibited_terms.map((t) => t.toLowerCase()))],
      palette: d.palette,
      // `motifs` (canon v1.0) is not written: retired, kept on the row for old images.
      layouts: d.layouts,
      // Position and opacity are not editable; keep whatever the row holds.
      brand_mark: { ...((existing.brand_mark as Record<string, unknown>) ?? {}), ...d.brand_mark, position: 'bottom_right' },
      notes: d.notes || null,
      updated_by: user.id,
    })
    .eq('id', existing.id);
  if (error) return { error: humanizeError(error) };

  revalidatePath('/brand');
  return { success: true, version };
}

/** Stop showing an anchor to the model, and delete its copy. */
export async function removeStyleAnchor(path: string) {
  if (!path.startsWith(ANCHOR_PREFIX)) return { error: 'That anchor could not be found.' };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { data: canon } = await supabase
    .from('brand_visual')
    .select('id, style_anchor_paths')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!canon) return { error: 'There is no brand visual canon yet.' };

  const { error } = await supabase
    .from('brand_visual')
    .update({ style_anchor_paths: (canon.style_anchor_paths ?? []).filter((p) => p !== path) })
    .eq('id', canon.id);
  if (error) return { error: humanizeError(error) };

  await supabase.storage.from(BUCKET).remove([path]);
  // The anchor is named for its generation group; clear the flag on its crops.
  const groupId = path.slice(ANCHOR_PREFIX.length).replace(/\.png$/, '');
  await supabase.from('content_images').update({ is_style_anchor: false }).eq('generation_group_id', groupId);

  revalidatePath('/brand');
  return { success: true };
}
