'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';
import { parseForm } from '@/lib/forms';

const taskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  project_id: z.string().uuid().optional().or(z.literal('')),
  related_contact_id: z.string().uuid().optional().or(z.literal('')),
  assigned_to: z.string().uuid().optional().or(z.literal('')),
  priority: z.string().default('medium'),
  due_date: z.string().optional(),
  status: z.string().default('todo'),
});

export async function createTask(formData: FormData) {
  const parsed = parseForm(taskSchema, formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const data = parsed.data;

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      title: data.title,
      description: data.description || null,
      project_id: data.project_id || null,
      related_contact_id: data.related_contact_id || null,
      assigned_to: data.assigned_to || null,
      priority: data.priority,
      due_date: data.due_date || null,
      status: data.status,
      parent_task_id: null,
      completed_at: null,
      source: 'manual',
      source_interaction_id: null,
    })
    .select()
    .single();

  if (error) return { error: humanizeError(error) };

  revalidatePath('/tasks');
  revalidatePath('/');
  return { success: true, task };
}

export async function updateTaskStatus(id: string, status: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const updateData: Record<string, unknown> = { status };

  if (status === 'done') {
    updateData.completed_at = new Date().toISOString();
  } else {
    updateData.completed_at = null;
  }

  const { error } = await supabase.from('tasks').update(updateData).eq('id', id);
  if (error) return { error: humanizeError(error) };

  revalidatePath('/tasks');
  revalidatePath('/');
  return { success: true };
}

export async function updateTask(id: string, formData: FormData) {
  const parsed = parseForm(taskSchema.partial(), formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const data = parsed.data;

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description || null;
  if (data.project_id !== undefined) updateData.project_id = data.project_id || null;
  if (data.related_contact_id !== undefined) updateData.related_contact_id = data.related_contact_id || null;
  if (data.assigned_to !== undefined) updateData.assigned_to = data.assigned_to || null;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.due_date !== undefined) updateData.due_date = data.due_date || null;
  if (data.status !== undefined) {
    updateData.status = data.status;
    if (data.status === 'done') {
      updateData.completed_at = new Date().toISOString();
    } else {
      updateData.completed_at = null;
    }
  }

  const { error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/tasks');
  revalidatePath(`/tasks/${id}`);
  revalidatePath('/');
  return { success: true };
}

export async function deleteTask(id: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) return { error: humanizeError(error) };

  revalidatePath('/tasks');
  return { success: true };
}
