'use server';

import { getAuthedClient } from '@/lib/action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { humanizeError } from '@/lib/errors';
import { parseForm } from '@/lib/forms';

type AuthedClient = Extract<Awaited<ReturnType<typeof getAuthedClient>>, { ok: true }>['supabase'];
const ss = (supabase: AuthedClient) => supabase.from('segment_scorecards');

const segmentSchema = z.object({
  segment_name:       z.string().min(1, 'Segment name is required'),
  need_score:         z.coerce.number().int().min(1).max(5).optional().or(z.literal('')),
  access_score:       z.coerce.number().int().min(1).max(5).optional().or(z.literal('')),
  planned_interviews: z.coerce.number().int().min(0).default(0),
  notes:              z.string().optional(),
});

export async function createSegment(formData: FormData) {
  const parsed = parseForm(segmentSchema, formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const data = parsed.data;

  const { data: segment, error } = await ss(supabase)
    .insert({
      segment_name:       data.segment_name,
      need_score:         (data.need_score   as number | undefined) || null,
      access_score:       (data.access_score as number | undefined) || null,
      planned_interviews: data.planned_interviews ?? 0,
      notes:              data.notes || null,
    })
    .select()
    .single();

  if (error) return { error: humanizeError(error) };

  revalidatePath('/crm/segments');
  return { success: true, segment };
}

export async function updateSegment(id: string, formData: FormData) {
  const parsed = parseForm(segmentSchema.partial(), formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const data = parsed.data;

  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    updateData[key] = value === '' ? null : value;
  }

  const { data: segment, error } = await ss(supabase)
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: humanizeError(error) };

  revalidatePath('/crm/segments');
  return { success: true, segment };
}

export async function deleteSegment(id: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await ss(supabase).delete().eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/crm/segments');
  return { success: true };
}
