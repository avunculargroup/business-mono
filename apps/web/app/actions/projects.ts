'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const projectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  status: z.string().default('active'),
  priority: z.string().default('medium'),
  owner_id: z.string().uuid().optional().or(z.literal('')),
  target_date: z.string().optional(),
});

export async function createProject(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const data = parsed.data;

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      name: data.name,
      description: data.description || null,
      status: data.status,
      priority: data.priority,
      created_by: data.owner_id || null,
      target_date: data.target_date || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/projects');
  return { success: true, project };
}

export async function deleteProject(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/projects');
  return { success: true };
}
