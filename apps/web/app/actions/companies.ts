'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthedClient } from '@/lib/action';
import { parseForm, buildUpdate } from '@/lib/forms';
import { humanizeError } from '@/lib/errors';

const companySchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  industry: z.string().optional(),
  size: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  linkedin_url: z.string().url().optional().or(z.literal('')),
  notes: z.string().optional(),
});

export async function createCompany(formData: FormData) {
  const parsed = parseForm(companySchema, formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const data = parsed.data;

  const { data: company, error } = await supabase.from('companies').insert({
    name: data.name,
    industry: data.industry || null,
    size: data.size || null,
    website: data.website || null,
    linkedin_url: data.linkedin_url || null,
    notes: data.notes || null,
    source: 'web',
  }).select().single();

  if (error) return { error: humanizeError(error) };

  revalidatePath('/crm/companies');
  return { success: true, company };
}

export async function updateCompany(id: string, formData: FormData) {
  const parsed = parseForm(companySchema.partial(), formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase.from('companies').update(buildUpdate(parsed.data)).eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/crm/companies');
  revalidatePath(`/crm/companies/${id}`);
  return { success: true };
}

export async function deleteCompany(id: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase.from('companies').delete().eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/crm/companies');
  return { success: true };
}
