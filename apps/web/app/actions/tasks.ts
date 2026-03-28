'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const taskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  project_id: z.string().uuid().optional().or(z.literal('')),
  contact_id: z.string().uuid().optional().or(z.literal('')),
  assigned_to: z.string().uuid().optional().or(z.literal('')),
  priority: z.string().default('medium'),
  due_date: z.string().optional(),
  status: z.string().default('todo'),
});

export async function createTask(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = taskSchema.safeParse(raw);

  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const data = parsed.data;

  const { error } = await supabase.from('tasks').insert({
    title: data.title,
    description: data.description || null,
    project_id: data.project_id || null,
    contact_id: data.contact_id || null,
    assigned_to: data.assigned_to || null,
    priority: data.priority,
    due_date: data.due_date || null,
    status: data.status,
    parent_task_id: null,
    completed_at: null,
    source: 'manual',
    source_interaction_id: null,
  });

  if (error) return { error: error.message };

  revalidatePath('/tasks');
  revalidatePath('/');
  return { success: true };
}

export async function updateTaskStatus(id: string, status: string) {
  const supabase = await createClient();
  const updateData: Record<string, unknown> = { status };

  if (status === 'done') {
    updateData.completed_at = new Date().toISOString();
  } else {
    updateData.completed_at = null;
  }

  const { error } = await supabase.from('tasks').update(updateData as never).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/tasks');
  revalidatePath('/');
  return { success: true };
}

export async function deleteTask(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/tasks');
  return { success: true };
}
