import type { Metadata } from 'next';
import { Lockup } from '@/components/Lockup';
import { createClient } from '@/lib/supabase/server';
import { InviteForm } from './InviteForm';
import styles from '../../login/login.module.css';

export const metadata: Metadata = { title: 'Your invitation' };

/**
 * Accepting an invitation. Outside both gates, because neither applies yet.
 *
 * The invitation is read through `client_invite_details`, a SECURITY DEFINER
 * function — `client_invites` is team-only by policy, and the alternative to
 * the function was a service-role key in this app, which would have made every
 * RLS policy in the hardening migration decorative.
 *
 * Showing the address the invitation was issued to is deliberate. Whoever holds
 * this link was sent it at that address, so it is not a leak — and it is what
 * lets someone notice that a forwarded link is not theirs before they try to
 * use it.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const { data } = await supabase.rpc('client_invite_details', { invite_token: token });
  const invite = data?.[0];

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <Lockup variant="stacked" />
        </header>

        {!invite ? (
          <>
            <h1 className={styles.title}>This invitation is no longer valid</h1>
            <p className={styles.lede}>
              It may have expired, been withdrawn, or already been used. Invitations are
              single-use and time-limited.
            </p>
            <p className={styles.note}>
              Contact Bitcoin Treasury Solutions for a new one. If you have already set up your
              account, <a href="/login">sign in</a> instead.
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.title}>You have been invited to Minute</h1>
            <p className={styles.lede}>
              {invite.full_name}, you have a seat on the {invite.account_name} account. Accept
              below and we will email a sign-in link to{' '}
              <span className="mono">{invite.email}</span>.
            </p>

            <InviteForm token={token} />

            <p className={styles.note}>
              If that is not your address, this link was not meant for you — please tell
              Bitcoin Treasury Solutions rather than using it.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
