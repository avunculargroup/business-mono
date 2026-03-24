'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const contentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  type: z.string().min(1),
  body: z.string().optional(),
  status: z.string().default('idea'),
  scheduled_for: z.string().optional(),
  created_by: z.string().uuid().optional().or(z.literal('')),
});

export async function createContent(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = contentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const data = parsed.data;

  const { error } = await supabase.from('content_items').insert({
    title: data.title,
    type: data.type,
    body: data.body || null,
    status: data.status,
    scheduled_for: data.scheduled_for || null,
    created_by: data.created_by || null,
    source: 'manual',
  });

  if (error) return { error: error.message };

  revalidatePath('/content');
  revalidatePath('/');
  return { success: true };
}

export async function updateContentStatus(id: string, status: string, extras?: { published_url?: string; published_at?: string }) {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = { status };
  if (status === 'published' && extras) {
    if (extras.published_at) updateData.published_at = extras.published_at;
  }

  const { error } = await supabase.from('content_items').update(updateData as never).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/content');
  return { success: true };
}
