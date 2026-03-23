'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function approveActivity(
  activityId: string,
  action: 'approved' | 'rejected',
  response?: string
) {
  const supabase = await createClient();

  const updateData = {
    status: action,
    notes: response || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('agent_activity')
    .update(updateData as never)
    .eq('id', activityId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/simon');
  revalidatePath('/activity');
  revalidatePath('/');
  return { success: true };
}
