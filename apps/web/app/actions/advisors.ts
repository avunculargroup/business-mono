'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const advisorSchema = z.object({
  name:                z.string().min(1, 'Name is required'),
  type:                z.enum(['advisor', 'partner'], { errorMap: () => ({ message: 'Type is required' }) }),
  company_id:          z.string().uuid().optional().or(z.literal('')),
  specialization:      z.string().optional(),
  engagement_model:    z.string().optional(),
  rate_notes:          z.string().optional(),
  bio:                 z.string().optional(),
  logo_url:            z.string().optional(),
  website:             z.string().optional(),
  linkedin_url:        z.string().optional(),
  key_relationship_id: z.string().uuid().optional().or(z.literal('')),
  active:              z.string().optional(),
  created_by:          z.string().uuid().optional().or(z.literal('')),
});

export async function createAdvisor(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = advisorSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const d = parsed.data;

  const { data: advisor, error } = await supabase
    .from('advisors_partners')
    .insert({
      name:                d.name,
      type:                d.type,
      company_id:          d.company_id || null,
      specialization:      d.specialization || null,
      engagement_model:    d.engagement_model || null,
      rate_notes:          d.rate_notes || null,
      bio:                 d.bio || null,
      logo_url:            d.logo_url || null,
      website:             d.website || null,
      linkedin_url:        d.linkedin_url || null,
      key_relationship_id: d.key_relationship_id || null,
      active:              d.active === 'on',
      created_by:          d.created_by || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/advisors');
  return { success: true, advisor };
}

export async function updateAdvisor(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = advisorSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const d = parsed.data;

  const { error } = await supabase
    .from('advisors_partners')
    .update({
      name:                d.name,
      type:                d.type,
      company_id:          d.company_id || null,
      specialization:      d.specialization || null,
      engagement_model:    d.engagement_model || null,
      rate_notes:          d.rate_notes || null,
      bio:                 d.bio || null,
      logo_url:            d.logo_url || null,
      website:             d.website || null,
      linkedin_url:        d.linkedin_url || null,
      key_relationship_id: d.key_relationship_id || null,
      active:              d.active === 'on',
    })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/advisors');
  revalidatePath(`/advisors/${id}`);
  return { success: true };
}

export async function deleteAdvisor(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('advisors_partners').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/advisors');
  return { success: true };
}

export async function addAdvisorContact(advisorId: string, contactId: string, role: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('advisor_partner_contacts')
    .insert({ advisor_partner_id: advisorId, contact_id: contactId, role: role || null })
    .select('id, role, contacts(id, first_name, last_name, email)')
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/advisors/${advisorId}`);
  return { success: true, contact: data };
}

export async function removeAdvisorContact(advisorId: string, contactId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('advisor_partner_contacts')
    .delete()
    .eq('advisor_partner_id', advisorId)
    .eq('contact_id', contactId);

  if (error) return { error: error.message };

  revalidatePath(`/advisors/${advisorId}`);
  return { success: true };
}
