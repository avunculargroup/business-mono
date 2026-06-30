'use server';

import { revalidatePath } from 'next/cache';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';

export async function approveActivity(
  activityId: string,
  action: 'approved' | 'rejected',
  response?: string
) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const updateData = {
    status: action,
    notes: response || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('agent_activity')
    .update(updateData)
    .eq('id', activityId);

  if (error) {
    return { error: humanizeError(error) };
  }

  revalidatePath('/simon');
  revalidatePath('/activity');
  revalidatePath('/');
  return { success: true };
}
