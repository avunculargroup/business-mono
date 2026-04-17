'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const interviewSchema = z.object({
  contact_id:      z.string().uuid().optional().or(z.literal('')),
  company_id:      z.string().uuid().optional().or(z.literal('')),
  interview_date:  z.string().optional(),
  status:          z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).default('scheduled'),
  channel:         z.string().optional(),
  notes:           z.string().optional(),
  pain_points:     z.string().optional(),
  trigger_event:   z.enum(['FASB_CHANGE', 'EMPLOYEE_BTC_REQUEST', 'REGULATORY_UPDATE', 'OTHER']).optional().or(z.literal('')),
  email_thread_id: z.string().optional(),
});

function parsePainPoints(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string' && p.trim()) : [];
  } catch {
    return [];
  }
}

export async function createInterview(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = interviewSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const data = parsed.data;

  const { data: interview, error } = await supabase
    .from('discovery_interviews')
    .insert({
      contact_id:      data.contact_id      || null,
      company_id:      data.company_id      || null,
      interview_date:  data.interview_date  || null,
      status:          data.status,
      channel:         data.channel         || null,
      notes:           data.notes           || null,
      pain_points:     parsePainPoints(data.pain_points),
      trigger_event:   (data.trigger_event  || null) as never,
      email_thread_id: data.email_thread_id || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/crm/interviews');
  return { success: true, interview };
}

export async function updateInterview(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = interviewSchema.partial().safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const data = parsed.data;

  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (key === 'pain_points') {
      updateData[key] = parsePainPoints(value as string);
    } else if (key === 'trigger_event') {
      updateData[key] = value || null;
    } else {
      updateData[key] = value === '' ? null : value;
    }
  }

  const { data: interview, error } = await supabase
    .from('discovery_interviews')
    .update(updateData as never)
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/crm/interviews');
  return { success: true, interview };
}

export async function deleteInterview(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('discovery_interviews').delete().eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/crm/interviews');
  return { success: true };
}

export async function getInterviews() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('discovery_interviews')
    .select('*, contacts(id, first_name, last_name, job_title, role), companies(id, name)')
    .order('interview_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getInterview(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('discovery_interviews')
    .select('*, contacts(id, first_name, last_name, job_title, role), companies(id, name), pain_point_log(*)')
    .eq('id', id)
    .order('changed_at', { referencedTable: 'pain_point_log', ascending: true })
    .single();

  if (error) throw new Error(error.message);
  return data;
}
