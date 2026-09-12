import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { inviteState } from '@/lib/clients/invite';
import { ClientAccounts, type AccountRow } from './ClientAccounts';
import styles from './clients.module.css';

/**
 * Minute's subscriber administration.
 *
 * This page is the reason anyone can use Minute at all. Nothing anywhere
 * inserted a `client_invites` row before it existed — there was a redemption
 * function and no issuance path — so the product had a front door and no way to
 * hand anyone a key.
 *
 * Deliberately not under `/settings`. Creating a subscriber is the commercial
 * act the whole client app exists for, not a configuration detail.
 */
export const dynamic = 'force-dynamic';

type AccountRecord = {
  id: string;
  display_name: string;
  client_type: string;
  subscription_status: string;
  subscription_started_at: string | null;
  subscription_renews_at: string | null;
};

type SeatRecord = {
  id: string;
  account_id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  last_seen_at: string | null;
};

type InviteRecord = {
  id: string;
  account_id: string;
  email: string;
  full_name: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export default async function ClientsPage() {
  const supabase = await createClient();

  // Three round-trips rather than embedded selects: the bridge types carry no
  // PostgREST relationship metadata, and hand-writing some into a file whose
  // whole purpose is to be deleted would be work with a negative lifespan.
  const [accounts, seats, invites] = await Promise.all([
    supabase
      .from('client_accounts')
      .select(
        'id, display_name, client_type, subscription_status, subscription_started_at, subscription_renews_at',
      ),
    supabase
      .from('client_users')
      .select('id, account_id, full_name, email, role, status, last_seen_at'),
    supabase
      .from('client_invites')
      .select('id, account_id, email, full_name, role, expires_at, accepted_at, revoked_at'),
  ]);

  const readError =
    accounts.error?.message ?? seats.error?.message ?? invites.error?.message ?? null;

  const seatRows = (seats.data ?? []) as SeatRecord[];
  const inviteRows = (invites.data ?? []) as InviteRecord[];

  const rows: AccountRow[] = ((accounts.data ?? []) as AccountRecord[])
    .map((account) => ({
      id: account.id,
      displayName: account.display_name,
      clientType: account.client_type,
      subscriptionStatus: account.subscription_status,
      startedAt: account.subscription_started_at,
      renewsAt: account.subscription_renews_at,
      seats: seatRows
        .filter((seat) => seat.account_id === account.id)
        .map((seat) => ({
          id: seat.id,
          fullName: seat.full_name,
          email: seat.email,
          role: seat.role,
          status: seat.status,
          lastSeenAt: seat.last_seen_at,
        })),
      // Accepted invitations are not listed: the seat they produced is, and
      // showing both would double-count the same person under two headings.
      invites: inviteRows
        .filter((invite) => invite.account_id === account.id)
        .map((invite) => ({
          id: invite.id,
          email: invite.email,
          fullName: invite.full_name,
          role: invite.role,
          state: inviteState({
            acceptedAt: invite.accepted_at,
            revokedAt: invite.revoked_at,
            expiresAt: invite.expires_at,
          }),
          expiresAt: invite.expires_at,
        }))
        .filter((invite) => invite.state !== 'accepted'),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <>
      <PageHeader title="Subscribers" />
      <div className={styles.container}>
        <p className={styles.intro}>
          Minute accounts, their seats, and invitations that have not been taken up. An invitation
          link is shown once when it is issued and cannot be recovered — only its hash is stored,
          so re-sending means issuing a new one.
        </p>

        {readError && (
          <p className={styles.readError} role="status">
            Could not read the subscriber tables ({readError}). The client-app migrations have not
            been applied yet, so this is expected until they are.
          </p>
        )}

        <ClientAccounts accounts={rows} />
      </div>
    </>
  );
}
