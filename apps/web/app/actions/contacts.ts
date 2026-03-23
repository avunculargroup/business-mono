'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

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
});

export async function createContact(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = contactSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const data = parsed.data;

  const { error } = await supabase.from('contacts').insert({
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email || null,
    phone: data.phone || null,
    company_id: data.company_id || null,
    pipeline_stage: data.pipeline_stage,
    bitcoin_literacy: data.bitcoin_literacy,
    owner_id: data.owner_id || null,
    notes: data.notes || null,
    signal_number: null,
    source: data.source || 'manual',
  });

  if (error) return { error: error.message };

  revalidatePath('/crm/contacts');
  revalidatePath('/');
  return { success: true };
}

export async function updateContact(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = contactSchema.partial().safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const data = parsed.data;

  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== '') {
      updateData[key] = value;
    }
  }

  const { error } = await supabase.from('contacts').update(updateData as never).eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/crm/contacts');
  revalidatePath(`/crm/contacts/${id}`);
  return { success: true };
}

export async function deleteContact(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('contacts').delete().eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/crm/contacts');
  return { success: true };
}
