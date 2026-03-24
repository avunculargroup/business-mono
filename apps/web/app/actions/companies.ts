'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const companySchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  industry: z.string().optional(),
  size: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  linkedin_url: z.string().url().optional().or(z.literal('')),
  notes: z.string().optional(),
});

export async function createCompany(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = companySchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const data = parsed.data;

  const { error } = await supabase.from('companies').insert({
    name: data.name,
    industry: data.industry || null,
    size: data.size || null,
    website: data.website || null,
    linkedin_url: data.linkedin_url || null,
    notes: data.notes || null,
  });

  if (error) return { error: error.message };

  revalidatePath('/crm/companies');
  return { success: true };
}

export async function updateCompany(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = companySchema.partial().safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined && value !== '') {
      updateData[key] = value;
    }
  }

  const { error } = await supabase.from('companies').update(updateData as never).eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/crm/companies');
  revalidatePath(`/crm/companies/${id}`);
  return { success: true };
}

export async function deleteCompany(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('companies').delete().eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/crm/companies');
  return { success: true };
}
