'use server';

import { revalidatePath } from 'next/cache';
import { getAuthedRepositories } from '@/lib/action';
import { humanizeError } from '@/lib/errors';

export async function approveActivity(
  activityId: string,
  action: 'approved' | 'rejected',
  response?: string
) {
  const auth = await getAuthedRepositories();
  if (!auth.ok) return { error: auth.error };

  try {
    await auth.repositories.agentActivity.approveActivity(activityId, action, response);
  } catch (err) {
    // Deliberately an inline literal rather than `actionError(err)`: returning a
    // declared `{ error: string }` type instead of a fresh object literal stops
    // TypeScript adding the `error?: undefined` / `success?: undefined` members
    // it uses to normalise a union of return literals, and callers doing
    // `if (result.error)` then stop compiling. See ApprovalControls.tsx:24.
    return { error: humanizeError(err) };
  }

  revalidatePath('/simon');
  revalidatePath('/activity');
  revalidatePath('/');
  return { success: true };
}
