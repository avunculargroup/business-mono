'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { computeNextRunAt } from '@platform/shared';

const FREQUENCIES = ['daily', 'weekly', 'fortnightly'] as const;
const AGENTS = ['simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della'] as const;

// Accept either a comma/newline separated string or an already-parsed array.
const queriesSchema = z.preprocess((v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    return v
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}, z.array(z.string().min(1)));

const researchDigestConfig = z.object({
  action_type: z.literal('research_digest'),
  subject: z.string().min(1, 'Subject is required'),
  context: z.string().optional().default(''),
  search_queries: queriesSchema.refine((v) => v.length > 0, 'At least one search query is required'),
  archive_sources: z.coerce.boolean().optional().default(false),
  max_sources: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const monitorChangeConfig = z.object({
  action_type: z.literal('monitor_change'),
  subject: z.string().min(1, 'Subject is required'),
  context: z.string().optional().default(''),
  search_queries: queriesSchema.refine((v) => v.length > 0, 'At least one search query is required'),
  notify_signal: z.coerce.boolean().optional().default(false),
  notify_agent: z.enum(AGENTS).optional().nullable(),
});

const baseSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
  agent_name: z.enum(AGENTS),
  frequency: z.enum(FREQUENCIES),
  time_of_day: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time'),
  timezone: z.string().min(1).default('Australia/Melbourne'),
  show_on_dashboard: z.coerce.boolean().optional().default(false),
  dashboard_title: z.string().optional().default(''),
  is_active: z.coerce.boolean().optional().default(true),
});

const createSchema = z.discriminatedUnion('action_type', [
  baseSchema.merge(researchDigestConfig),
  baseSchema.merge(monitorChangeConfig),
]);

function normalizeTime(t: string): string {
  return /^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
}

function buildActionConfig(input: z.infer<typeof createSchema>): Record<string, unknown> {
  if (input.action_type === 'research_digest') {
    return {
      subject: input.subject,
      context: input.context || undefined,
      search_queries: input.search_queries,
      archive_sources: input.archive_sources,
      max_sources: input.max_sources,
    };
  }
  return {
    subject: input.subject,
    context: input.context || undefined,
    search_queries: input.search_queries,
    notify_signal: input.notify_signal,
    notify_agent: input.notify_agent ?? null,
  };
}

function parseForm(formData: FormData) {
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  // Reject empty notify_agent so Zod treats it as undefined, not ''.
  if (raw['notify_agent'] === '') delete raw['notify_agent'];
  return createSchema.safeParse(raw);
}

export async function createRoutine(formData: FormData) {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }

  const input = parsed.data;
  const timeOfDay = normalizeTime(input.time_of_day);
  const nextRunAt = computeNextRunAt({
    frequency: input.frequency,
    timeOfDay,
    timezone: input.timezone,
  });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('routines')
    .insert({
      name: input.name,
      description: input.description || null,
      agent_name: input.agent_name,
      action_type: input.action_type,
      action_config: buildActionConfig(input) as never,
      frequency: input.frequency,
      time_of_day: timeOfDay,
      timezone: input.timezone,
      next_run_at: nextRunAt.toISOString(),
      show_on_dashboard: input.show_on_dashboard,
      dashboard_title: input.dashboard_title || null,
      is_active: input.is_active,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/routines');
  if (input.show_on_dashboard) revalidatePath('/');
  return { success: true, routine: data };
}

export async function updateRoutine(id: string, formData: FormData) {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }

  const input = parsed.data;
  const timeOfDay = normalizeTime(input.time_of_day);
  const nextRunAt = computeNextRunAt({
    frequency: input.frequency,
    timeOfDay,
    timezone: input.timezone,
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from('routines')
    .update({
      name: input.name,
      description: input.description || null,
      agent_name: input.agent_name,
      action_type: input.action_type,
      action_config: buildActionConfig(input) as never,
      frequency: input.frequency,
      time_of_day: timeOfDay,
      timezone: input.timezone,
      next_run_at: nextRunAt.toISOString(),
      show_on_dashboard: input.show_on_dashboard,
      dashboard_title: input.dashboard_title || null,
      is_active: input.is_active,
    })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/routines');
  revalidatePath('/');
  return { success: true };
}

export async function deleteRoutine(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('routines').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/routines');
  revalidatePath('/');
  return { success: true };
}

export async function toggleRoutineActive(id: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('routines')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/routines');
  revalidatePath('/');
  return { success: true };
}

export async function runRoutineNow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('routines')
    .update({ next_run_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/routines');
  return { success: true };
}
