'use server';

import { getAuthedClient } from '@/lib/action';
import { revalidatePath } from 'next/cache';
import { humanizeError } from '@/lib/errors';

const REVALIDATE = '/settings/integrations/linkedin';

/**
 * Disconnect a social account's stored credential. The account row itself is
 * untouched — drafting continues; only API publishing stops until reconnected.
 */
export async function disconnectSocialCredential(socialAccountId: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from('social_credentials')
    .delete()
    .eq('social_account_id', socialAccountId);

  if (error) return { error: humanizeError(error) };
  revalidatePath(REVALIDATE);
  revalidatePath('/settings/integrations');
  return { success: true };
}
