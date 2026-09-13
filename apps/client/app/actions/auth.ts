'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Sign-in by magic link. There is no password and no sign-up form.
 *
 * `shouldCreateUser: false` is the whole invite-only model in one flag: an
 * address with no auth user gets no link, so the form cannot be used to
 * discover whether an address is a subscriber, and it cannot be used to become
 * one. Accounts are provisioned by a founder, through `/invite`.
 */
export async function requestSignInLink(
  _previous: { message: string } | null,
  formData: FormData,
): Promise<{ message: string }> {
  const email = String(formData.get('email') ?? '').trim();

  if (!email) return { message: 'Enter the email address your invitation was sent to.' };

  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  // The same message whichever way it went. Telling an anonymous visitor that
  // an address is not a subscriber turns this form into a membership oracle,
  // and the membership list is the client list.
  return {
    message:
      'If that address has a Minute account, a sign-in link is on its way. The link expires '
      + 'shortly, so use it from this device.',
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
