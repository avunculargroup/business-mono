'use server';

import { getAuthedClient } from '@/lib/action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { humanizeError } from '@/lib/errors';

const brandAssetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['logo', 'colour_palette', 'typography', 'tone_of_voice', 'style_guide', 'template', 'image', 'other']),
  description: z.string().optional(),
  content: z.string().optional(),
});

export async function createBrandAsset(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = brandAssetSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;
  const data = parsed.data;

  const { error } = await supabase.from('brand_assets').insert({
    name: data.name,
    type: data.type,
    description: data.description || null,
    content: data.content || null,
    created_by: user.id,
  });

  if (error) return { error: humanizeError(error) };

  revalidatePath('/brand');
  return { success: true };
}
