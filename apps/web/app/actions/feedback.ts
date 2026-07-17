'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthedClient } from '@/lib/action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { humanizeError } from '@/lib/errors';
import { parseForm } from '@/lib/forms';

const fb = (supabase: Awaited<ReturnType<typeof createClient>>) =>
  supabase.from('feedback');

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
  const parsed = parseForm(feedbackSchema, formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;
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
    created_by:    user.id,
  }).select().single();

  if (error) return { error: humanizeError(error) };

  revalidatePath('/discovery/feedback');
  return { success: true, entry };
}

export async function updateFeedback(id: string, formData: FormData) {
  const parsed = parseForm(feedbackSchema.partial(), formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
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
  if (error) return { error: humanizeError(error) };

  revalidatePath('/discovery/feedback');
  return { success: true };
}

export async function deleteFeedback(id: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await fb(supabase)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/discovery/feedback');
  return { success: true };
}

export async function getFeedback() {
  const supabase = await createClient();
  const { data, error } = await fb(supabase)
    .select('*, contacts(id, first_name, last_name), companies(id, name), pain_points(id, content, interview_id)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(humanizeError(error));
  // tags is a nullable text[]; normalise null → []. sentiment is a jsonb column
  // typed loosely as Json — assert the structured shape the list view renders.
  return (data ?? []).map((row) => ({
    ...row,
    tags: row.tags ?? [],
    sentiment: row.sentiment as { score: number; magnitude: number; label: string } | null,
  }));
}
