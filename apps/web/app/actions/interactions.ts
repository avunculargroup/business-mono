'use server';

import { getAuthedClient } from '@/lib/action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { humanizeError } from '@/lib/errors';

const interactionSchema = z.object({
  contact_id: z.string().uuid().optional().or(z.literal('')),
  company_id: z.string().uuid().optional().or(z.literal('')),
  type: z.string().min(1),
  direction: z.string().optional(),
  summary: z.string().optional(),
  transcript: z.string().optional(),
  occurred_at: z.string().optional(),
  source: z.string().default('manual'),
});

export async function createInteraction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = interactionSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;
  const data = parsed.data;

  const { error } = await supabase.from('interactions').insert({
    contact_id: data.contact_id || null,
    company_id: data.company_id || null,
    team_member_id: user.id,
    type: data.type,
    direction: data.direction || null,
    summary: data.summary || null,
    transcript: data.transcript || null,
    occurred_at: data.occurred_at || new Date().toISOString(),
    extracted_data: null,
    duration_seconds: null,
    source: data.source,
    external_id: null,
  });

  if (error) return { error: humanizeError(error) };

  if (data.contact_id) revalidatePath(`/crm/contacts/${data.contact_id}`);
  revalidatePath('/crm');
  return { success: true };
}

export async function deleteInteraction(id: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase.from('interactions').delete().eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/crm');
  return { success: true };
}
