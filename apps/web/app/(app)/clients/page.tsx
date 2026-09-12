import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { inviteState } from '@/lib/clients/invite';
import {
  activityState,
  blockedSeats,
  daysSinceLastSeen,
  seatStandings,
} from '@/lib/clients/operations';
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
  const [accounts, seats, invites, disclosures, activeStatement] = await Promise.all([
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
    // Who has acknowledged what, and what they need to have acknowledged.
    // Publishing a Service Statement version puts every subscriber back at the
    // gate, and until this read existed nothing said who they were.
    supabase.from('client_disclosures').select('client_user_id, document_version'),
    supabase
      .from('compliance_documents')
      .select('version')
      .eq('doc_type', 'service_statement')
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  const readError =
    accounts.error?.message
    ?? seats.error?.message
    ?? invites.error?.message
    ?? disclosures.error?.message
    ?? null;

  const disclosureRows = ((disclosures.data ?? []) as Array<{
    client_user_id: string;
    document_version: string;
  }>).map((row) => ({
    clientUserId: row.client_user_id,
    documentVersion: row.document_version,
  }));

  // Null when nothing is active, which makes every seat blocked — correct
  // rather than alarmist, since the gate has no document to serve.
  const activeVersion =
    (activeStatement.data as { version: string } | null)?.version ?? null;

  const seatRows = (seats.data ?? []) as SeatRecord[];
  const inviteRows = (invites.data ?? []) as InviteRecord[];

  const accountSeats = (accountId: string) =>
    seatRows.filter((seat) => seat.account_id === accountId);

  /**
   * The three operational facts about an account, computed once per row.
   *
   * Blocked seats first, because that is an incident rather than a metric: the
   * person is sitting at the gate and cannot do anything about it themselves.
   */
  function operationsFor(accountId: string) {
    const seats = accountSeats(accountId).map((seat) => ({
      id: seat.id,
      fullName: seat.full_name,
      status: seat.status,
      lastSeenAt: seat.last_seen_at,
    }));

    const standings = seatStandings(seats, disclosureRows, activeVersion);
    const days = daysSinceLastSeen(seats);

    return {
      blocked: blockedSeats(standings).map((seat) => seat.fullName),
      daysSinceLastSeen: days,
      activity: activityState(days),
    };
  }

  const rows: AccountRow[] = ((accounts.data ?? []) as AccountRecord[])
    .map((account) => ({
      id: account.id,
      displayName: account.display_name,
      clientType: account.client_type,
      subscriptionStatus: account.subscription_status,
      startedAt: account.subscription_started_at,
      renewsAt: account.subscription_renews_at,
      seats: accountSeats(account.id).map((seat) => ({
        id: seat.id,
        fullName: seat.full_name,
        email: seat.email,
        role: seat.role,
        status: seat.status,
        lastSeenAt: seat.last_seen_at,
      })),
      operations: operationsFor(account.id),
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
