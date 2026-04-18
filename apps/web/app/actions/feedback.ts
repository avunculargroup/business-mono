'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fb = (supabase: Awaited<ReturnType<typeof createClient>>) =>
  (supabase as any).from('feedback');

const feedbackSchema = z.object({
  contact_id:    z.string().uuid().optional().or(z.literal('')),
  company_id:    z.string().uuid().optional().or(z.literal('')),
  pain_point_id: z.string().uuid().optional().or(z.literal('')),
  source:        z.enum(['interview', 'survey', 'email', 'testimonial']).default('interview'),
  date_received: z.string().optional(),
  category:      z.enum(['bug_report', 'feature_request', 'usability', 'testimonial']).default('feature_request'),
  rating:        z.coerce.number().int().min(1).max(5).optional().or(z.literal('')),
  description:   z.string().min(1, 'Description is required'),
  tags:          z.string().optional(),
});

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string' && t.trim()) : [];
  } catch {
    return raw.split(',').map((t) => t.trim()).filter(Boolean);
  }
}

export async function createFeedback(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const data = parsed.data;

  const { data: entry, error } = await fb(supabase).insert({
    contact_id:    data.contact_id    || null,
    company_id:    data.company_id    || null,
    pain_point_id: data.pain_point_id || null,
    source:        data.source,
    date_received: data.date_received || null,
    category:      data.category,
    rating:        data.rating === '' || data.rating === undefined ? null : Number(data.rating),
    description:   data.description,
    tags:          parseTags(data.tags),
    created_by:    user?.id ?? null,
  }).select().single();

  if (error) return { error: error.message };

  revalidatePath('/discovery/feedback');
  return { success: true, entry };
}

export async function updateFeedback(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = feedbackSchema.partial().safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const updateData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    if (key === 'tags') {
      updateData[key] = parseTags(value as string);
    } else if (key === 'rating') {
      updateData[key] = value === '' ? null : Number(value);
    } else {
      updateData[key] = value === '' ? null : value;
    }
  }

  const { error } = await fb(supabase).update(updateData).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/discovery/feedback');
  return { success: true };
}

export async function deleteFeedback(id: string) {
  const supabase = await createClient();
  const { error } = await fb(supabase)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/discovery/feedback');
  return { success: true };
}

export async function getFeedback() {
  const supabase = await createClient();
  const { data, error } = await fb(supabase)
    .select('*, contacts(id, first_name, last_name), companies(id, name), pain_points(id, content, interview_id)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}
