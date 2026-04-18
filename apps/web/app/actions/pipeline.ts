'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// The insight pipeline reuses content_items filtered to type='linkedin'.
// This action file handles the pipeline-specific fields (pain_point_id, score, research_links)
// in addition to the standard content fields.

const pipelineSchema = z.object({
  title:         z.string().min(1, 'Title is required'),
  body:          z.string().optional(),
  status:        z.enum(['idea', 'draft', 'review', 'approved', 'published', 'archived']).default('idea'),
  pain_point_id: z.string().uuid().optional().or(z.literal('')),
  score:         z.coerce.number().int().min(0).max(100).optional().or(z.literal('')),
  topic_tags:    z.string().optional(),
  research_links: z.string().optional(), // JSON array
  scheduled_for: z.string().optional(),
  assigned_to:   z.string().uuid().optional().or(z.literal('')),
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

function parseResearchLinks(raw: string | undefined): Array<{ url: string; title: string; note?: string }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function createPipelineItem(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = pipelineSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const data = parsed.data;

  const { error } = await supabase.from('content_items').insert({
    title:          data.title,
    type:           'linkedin',
    body:           data.body || null,
    status:         data.status,
    topic_tags:     parseTags(data.topic_tags),
    scheduled_for:  data.scheduled_for || null,
    assigned_to:    data.assigned_to || null,
    created_by:     user?.id ?? null,
    pain_point_id:  data.pain_point_id || null,
    score:          data.score === '' || data.score === undefined ? null : Number(data.score),
    research_links: parseResearchLinks(data.research_links),
  } as never);

  if (error) return { error: error.message };

  revalidatePath('/discovery/pipeline');
  revalidatePath('/content');
  return { success: true };
}

export async function updatePipelineItem(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = pipelineSchema.partial().safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const updateData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    if (key === 'topic_tags')     { updateData[key] = parseTags(value as string); continue; }
    if (key === 'research_links') { updateData[key] = parseResearchLinks(value as string); continue; }
    if (key === 'score')          { updateData[key] = value === '' ? null : Number(value); continue; }
    updateData[key] = value === '' ? null : value;
  }

  const { error } = await supabase.from('content_items').update(updateData as never).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/discovery/pipeline');
  revalidatePath('/content');
  return { success: true };
}

export async function movePipelineItem(id: string, status: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('content_items')
    .update({ status } as never)
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/discovery/pipeline');
  return { success: true };
}

export async function getPipelineItems() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('content_items')
    .select('*, pain_points(id, content, interview_id)')
    .eq('type', 'linkedin')
    .neq('status', 'archived')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function overrideValidation(id: string, validated: boolean, reason: string) {
  if (!reason.trim()) return { error: 'Reason is required for manual override.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await (supabase as any)
    .from('content_items')
    .update({ validated } as never)
    .eq('id', id);

  if (error) return { error: error.message };

  // Log override to agent_activity for audit trail
  await (supabase as any).from('agent_activity').insert({
    agent_name:   'simon',
    action:       `Pipeline validation override: ${validated ? 'validated' : 'invalidated'} — ${reason}`,
    status:       'auto',
    trigger_type: 'manual',
    entity_type:  'content_item',
    entity_id:    id,
    proposed_actions: { reason, validated, overridden_by: user?.id ?? null },
  });

  revalidatePath('/discovery/pipeline');
  return { success: true };
}

export async function getPainPointsForPicker() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pain_points')
    .select('id, content, interview_id, discovery_interviews(contact_id, contacts(first_name, last_name))')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}
