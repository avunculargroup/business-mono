'use server';

import { revalidatePath } from 'next/cache';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';
import {
  DEFAULT_INVITE_DAYS,
  hashInviteToken,
  inviteExpiry,
  inviteUrl,
  isPlausibleEmail,
  mintInviteToken,
} from '@/lib/clients/invite';

/**
 * Subscriber administration: accounts, seats and invitations.
 *
 * Until this existed nothing anywhere inserted a `client_invites` row, so
 * Minute could not onboard anyone — there was a redemption function and no
 * issuance path at all.
 *
 * **The token is returned exactly once.** Only its hash is stored, so there is
 * nothing to look it up from afterwards; the caller shows it and it is gone.
 * That is a deliberate property rather than an omission, and the reason a
 * "resend" here mints a new invitation rather than recovering the old one.
 */

const MINUTE_URL = 'https://minute.btreasury.com.au';

function clientAppUrl(): string {
  return process.env['NEXT_PUBLIC_MINUTE_URL'] ?? MINUTE_URL;
}

export async function createClientAccount(input: {
  displayName: string;
  clientType: 'corporate' | 'smsf';
  notes?: string;
}) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const displayName = input.displayName.trim();
  if (!displayName) return { error: 'Give the account a name.' };

  const { data, error } = await auth.supabase
    .from('client_accounts')
    .insert({
      display_name: displayName,
      client_type: input.clientType,
      // 'invited' rather than 'active': nobody has accepted a seat yet, and an
      // account that reads as active before anyone can log into it would make
      // the subscription list lie about how many subscribers there are.
      subscription_status: 'invited',
      notes: input.notes?.trim() || null,
      created_by: auth.user.id,
    })
    .select('id')
    .single();

  if (error) return { error: humanizeError(error) };

  revalidatePath('/clients');
  return { success: true, accountId: data.id };
}

export async function issueClientInvite(input: {
  accountId: string;
  email: string;
  fullName: string;
  role: 'primary' | 'member';
  days?: number;
}) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();

  if (!isPlausibleEmail(email)) return { error: 'That does not look like an email address.' };
  if (!fullName) return { error: 'Give the person a name.' };

  // Minted and hashed here, in Node. The plaintext never reaches Postgres — not
  // as a parameter, not in a query log — so the only copy is the one returned
  // below.
  const token = mintInviteToken();

  const { error } = await auth.supabase.from('client_invites').insert({
    account_id: input.accountId,
    email,
    full_name: fullName,
    role: input.role,
    token_hash: hashInviteToken(token),
    expires_at: inviteExpiry(input.days ?? DEFAULT_INVITE_DAYS),
    created_by: auth.user.id,
  });

  if (error) return { error: humanizeError(error) };

  revalidatePath('/clients');
  return { success: true, url: inviteUrl(clientAppUrl(), token) };
}

export async function revokeClientInvite(inviteId: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  // Only an unaccepted invitation can be withdrawn. Revoking an accepted one
  // would suggest the seat had been closed, which it has not — that is
  // `client_users.status`, a different act on a different row.
  const { error } = await auth.supabase
    .from('client_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
    .is('accepted_at', null);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/clients');
  return { success: true };
}

export async function setClientSeatStatus(
  userId: string,
  status: 'active' | 'disabled',
) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase
    .from('client_users')
    .update({ status })
    .eq('id', userId);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/clients');
  return { success: true };
}

export async function setSubscriptionStatus(
  accountId: string,
  status: 'invited' | 'active' | 'paused' | 'lapsed' | 'cancelled',
) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase
    .from('client_accounts')
    .update({ subscription_status: status })
    .eq('id', accountId);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/clients');
  return { success: true };
}
