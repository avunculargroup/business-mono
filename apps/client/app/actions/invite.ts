'use server';

import { createClient } from '@/lib/supabase/server';
import { siteOrigin } from '@/lib/siteUrl';

/**
 * Send the sign-in link for an invitation.
 *
 * The address comes from the invitation, never from the form. A token holder
 * choosing their own address would let a forwarded link seat the wrong person,
 * and `shouldCreateUser` is true here — so the form deciding the address would
 * also let anyone with a token create an auth user for any address at all.
 */
export async function acceptInvite(
  _previous: { message: string } | null,
  formData: FormData,
): Promise<{ message: string }> {
  const token = String(formData.get('token') ?? '');
  if (!token) return { message: 'This invitation link is not valid.' };

  const supabase = await createClient();

  const { data } = await supabase.rpc('client_invite_details', { invite_token: token });
  const invite = data?.[0];

  if (!invite) {
    return {
      message:
        'This invitation is no longer valid. It may have expired, been withdrawn, or already '
        + 'been used. Contact Bitcoin Treasury Solutions for a new one.',
    };
  }

  await supabase.auth.signInWithOtp({
    email: invite.email,
    options: {
      // The one place in the app where an auth user may be created, and it is
      // gated on a live invitation rather than on a form field.
      shouldCreateUser: true,
      // The token rides along so the callback can redeem it once there is a
      // session to redeem it for.
      emailRedirectTo: `${siteOrigin()}/auth/callback?invite=${encodeURIComponent(token)}`,
    },
  });

  return {
    message: `A sign-in link is on its way to ${invite.email}. Open it on this device.`,
  };
}
