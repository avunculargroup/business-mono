'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ch  = (supabase: Awaited<ReturnType<typeof createClient>>) => (supabase as any).from('champions');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const che = (supabase: Awaited<ReturnType<typeof createClient>>) => (supabase as any).from('champion_events');

const championSchema = z.object({
  contact_id:        z.string().uuid('Contact is required'),
  company_id:        z.string().uuid().optional().or(z.literal('')),
  role_type:         z.enum(['Champion', 'Economic Buyer', 'Influencer']),
  champion_score:    z.coerce.number().int().min(1).max(5).default(3),
  notes:             z.string().optional(),
  last_contacted_at: z.string().optional(),
});

const eventSchema = z.object({
  event_type: z.enum(['job_change', 'promotion', 'departure', 'note']),
  event_date: z.string().min(1, 'Date is required'),
  details:    z.string().optional(),
});

async function dispatchSimonAlert(
  supabase: Awaited<ReturnType<typeof createClient>>,
  action: string,
  entityId: string,
  message: string,
  context: Record<string, unknown>,
) {
  // Dispatch to Simon via agent_activity — he will relay to directors on Signal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('agent_activity').insert({
    agent_name:       'simon',
    action,
    status:           'pending',
    trigger_type:     'system',
    entity_type:      'champion',
    entity_id:        entityId,
    proposed_actions: { agent: 'simon', message, context },
  });
}

export async function getChampions(filters?: {
  status?: string;
  role_type?: string;
  company_id?: string;
}) {
  const supabase = await createClient();
  let query = ch(supabase)
    .select(`
      *,
      contacts(id, first_name, last_name, job_title, pipeline_stage),
      companies(id, name)
    `)
    .order('created_at', { ascending: false });

  if (filters?.status)     query = query.eq('status', filters.status);
  if (filters?.role_type)  query = query.eq('role_type', filters.role_type);
  if (filters?.company_id) query = query.eq('company_id', filters.company_id);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getChampion(id: string) {
  const supabase = await createClient();
  const { data, error } = await ch(supabase)
    .select(`
      *,
      contacts(id, first_name, last_name, job_title, email, pipeline_stage),
      companies(id, name)
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createChampion(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = championSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const d = parsed.data;

  const { data, error } = await ch(supabase)
    .insert({
      contact_id:        d.contact_id,
      company_id:        d.company_id || null,
      role_type:         d.role_type,
      champion_score:    d.champion_score,
      notes:             d.notes || null,
      last_contacted_at: d.last_contacted_at || null,
    })
    .select('id, contacts(first_name, last_name), companies(name)')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'This contact is already a champion.' };
    return { error: error.message };
  }

  const contactName = data?.contacts
    ? `${data.contacts.first_name} ${data.contacts.last_name}`
    : 'Unknown contact';
  const companyName = data?.companies?.name ?? 'Unknown company';

  await dispatchSimonAlert(
    supabase,
    `New champion designated: ${contactName} at ${companyName}`,
    data.id,
    `New champion added: ${contactName} (${d.role_type}) at ${companyName}. Champion score: ${d.champion_score}/5. Please notify the directors.`,
    { champion_id: data.id, role_type: d.role_type, company: companyName },
  );

  revalidatePath('/crm/champions');
  return { success: true, id: data.id };
}

export async function updateChampion(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = championSchema.partial().safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const updateData: Record<string, unknown> = {};
  const d = parsed.data;

  if (d.role_type         !== undefined) updateData.role_type         = d.role_type;
  if (d.champion_score    !== undefined) updateData.champion_score    = d.champion_score;
  if (d.notes             !== undefined) updateData.notes             = d.notes || null;
  if (d.last_contacted_at !== undefined) updateData.last_contacted_at = d.last_contacted_at || null;
  if (d.company_id        !== undefined) updateData.company_id        = d.company_id || null;

  const { error } = await ch(supabase).update(updateData).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/crm/champions');
  revalidatePath(`/crm/champions/${id}`);
  return { success: true };
}

export async function deleteChampion(id: string) {
  const supabase = await createClient();
  const { error } = await ch(supabase).delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/crm/champions');
  return { success: true };
}

export async function getChampionEvents(championId: string) {
  const supabase = await createClient();
  const { data, error } = await che(supabase)
    .select('*')
    .eq('champion_id', championId)
    .order('event_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function logChampionEvent(championId: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const d = parsed.data;

  const { error: insertError } = await che(supabase).insert({
    champion_id: championId,
    event_type:  d.event_type,
    event_date:  d.event_date,
    details:     d.details || null,
  });

  if (insertError) return { error: insertError.message };

  // Auto-update champion status on departure/job_change
  let newStatus: string | null = null;
  if (d.event_type === 'departure')   newStatus = 'departed';
  if (d.event_type === 'job_change')  newStatus = 'at_risk';

  if (newStatus) {
    await ch(supabase).update({ status: newStatus }).eq('id', championId);
  }

  // Fetch champion + contact info for the notification
  const { data: champion } = await ch(supabase)
    .select('id, contacts(first_name, last_name), companies(name)')
    .eq('id', championId)
    .single();

  const contactName = champion?.contacts
    ? `${champion.contacts.first_name} ${champion.contacts.last_name}`
    : 'Unknown contact';
  const companyName = champion?.companies?.name ?? 'Unknown company';

  if (d.event_type === 'departure' || d.event_type === 'job_change') {
    await dispatchSimonAlert(
      supabase,
      `Champion alert: ${contactName} — ${d.event_type.replace('_', ' ')}`,
      championId,
      `Champion alert: ${contactName} at ${companyName} has a new event: ${d.event_type.replace('_', ' ')}. ${d.details ?? ''} Status updated to ${newStatus}. Please notify the directors.`,
      { champion_id: championId, event_type: d.event_type, event_date: d.event_date, new_status: newStatus },
    );
  }

  revalidatePath('/crm/champions');
  revalidatePath(`/crm/champions/${championId}`);
  return { success: true };
}
