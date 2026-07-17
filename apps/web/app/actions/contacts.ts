'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthedClient } from '@/lib/action';
import { parseForm, buildUpdate } from '@/lib/forms';
import { humanizeError } from '@/lib/errors';

const contactSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  company_id: z.string().uuid().optional().or(z.literal('')),
  pipeline_stage: z.string().default('lead'),
  bitcoin_literacy: z.string().default('unknown'),
  owner_id: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().optional(),
  source: z.string().optional(),
  role: z.enum(['CFO', 'CEO', 'HR', 'Treasury', 'PeopleOps', 'Other']).optional().or(z.literal('')),
});

export async function createContact(formData: FormData) {
  const parsed = parseForm(contactSchema, formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const data = parsed.data;

  const { data: contact, error } = await supabase.from('contacts').insert({
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email || null,
    phone: data.phone || null,
    company_id: data.company_id || null,
    pipeline_stage: data.pipeline_stage,
    bitcoin_literacy: data.bitcoin_literacy,
    owner_id: data.owner_id || null,
    notes: data.notes || null,
    source: data.source || 'manual',
  }).select().single();

  if (error) return { error: humanizeError(error) };

  revalidatePath('/crm/contacts');
  revalidatePath('/');
  return { success: true, contact };
}

export async function updateContact(id: string, formData: FormData) {
  const parsed = parseForm(contactSchema.partial(), formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase.from('contacts').update(buildUpdate(parsed.data)).eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/crm/contacts');
  revalidatePath(`/crm/contacts/${id}`);
  return { success: true };
}

export async function deleteContact(id: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase.from('contacts').delete().eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/crm/contacts');
  return { success: true };
}
