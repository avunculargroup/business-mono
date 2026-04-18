'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cl = (supabase: Awaited<ReturnType<typeof createClient>>) =>
  (supabase as any).from('corporate_lexicon');

const lexiconSchema = z.object({
  term:              z.string().min(1, 'Term is required'),
  professional_term: z.string().min(1, 'Professional term is required'),
  definition:        z.string().optional(),
  category:          z.string().optional(),
  example_usage:     z.string().optional(),
  status:            z.enum(['draft', 'approved', 'deprecated']).default('draft'),
});

export async function createLexiconEntry(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = lexiconSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await cl(supabase).insert({
    ...parsed.data,
    definition:    parsed.data.definition    || null,
    category:      parsed.data.category      || null,
    example_usage: parsed.data.example_usage || null,
    version:       1,
    created_by:    user?.id ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath('/discovery/lexicon');
  return { success: true };
}

export async function updateLexiconEntry(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = lexiconSchema.partial().safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();

  // Fetch current version to increment
  const { data: current } = await cl(supabase).select('version').eq('id', id).single();
  const nextVersion = (current?.version ?? 1) + 1;

  const updateData: Record<string, unknown> = { version: nextVersion };
  for (const [key, value] of Object.entries(parsed.data)) {
    updateData[key] = value === '' ? null : value;
  }

  const { error } = await cl(supabase).update(updateData).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/discovery/lexicon');
  return { success: true };
}

export async function approveLexiconEntry(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await cl(supabase)
    .update({ status: 'approved', approved_by: user?.id ?? null })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/discovery/lexicon');
  return { success: true };
}

export async function deprecateLexiconEntry(id: string) {
  const supabase = await createClient();
  const { error } = await cl(supabase).update({ status: 'deprecated' }).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/discovery/lexicon');
  return { success: true };
}

export async function getLexiconEntries() {
  const supabase = await createClient();
  const { data, error } = await cl(supabase)
    .select('*, created_by_member:team_members!corporate_lexicon_created_by_fkey(full_name), approved_by_member:team_members!corporate_lexicon_approved_by_fkey(full_name)')
    .order('term', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}
