'use client';

import { useState, useTransition } from 'react';
import { UserPlus, Plus, Copy, Check } from 'lucide-react';
import {
  createClientAccount,
  issueClientInvite,
  revokeClientInvite,
  setClientSeatStatus,
  setSubscriptionStatus,
} from '@/app/actions/clientAccounts';
import type { InviteState } from '@/lib/clients/invite';
import type { ActivityState } from '@/lib/clients/operations';
import styles from './clients.module.css';

export interface AccountRow {
  id: string;
  displayName: string;
  clientType: string;
  subscriptionStatus: string;
  startedAt: string | null;
  renewsAt: string | null;
  seats: Array<{
    id: string;
    fullName: string;
    email: string;
    role: string;
    status: string;
    lastSeenAt: string | null;
  }>;
  invites: Array<{
    id: string;
    email: string;
    fullName: string;
    role: string;
    state: InviteState;
    expiresAt: string;
  }>;
  operations: {
    /** Names of active seats that cannot get in until they re-acknowledge. */
    blocked: string[];
    daysSinceLastSeen: number | null;
    activity: ActivityState;
  };
}

const SUBSCRIPTION_STATUSES = [
  'invited',
  'active',
  'paused',
  'lapsed',
  'cancelled',
] as const;

export function ClientAccounts({ accounts }: { accounts: AccountRow[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className={styles.topActions}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => setCreating((open) => !open)}
        >
          <Plus size={16} strokeWidth={1.5} />
          {creating ? 'Cancel' : 'New account'}
        </button>
      </div>

      {creating && <NewAccountForm onDone={() => setCreating(false)} />}

      {accounts.length === 0 ? (
        <p className={styles.empty}>
          No subscriber accounts yet. Create one, then invite the people who will use it.
        </p>
      ) : (
        <ul className={styles.list}>
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </ul>
      )}
    </>
  );
}

function NewAccountForm({ onDone }: { onDone: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [clientType, setClientType] = useState<'corporate' | 'smsf'>('corporate');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createClientAccount({ displayName, clientType });
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form className={styles.card} onSubmit={submit}>
      <label className={styles.label} htmlFor="account-name">
        Account name
      </label>
      <input
        id="account-name"
        className={styles.input}
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder="Sample Holdings Ltd"
      />

      <label className={styles.label} htmlFor="account-type">
        Client type
      </label>
      <select
        id="account-type"
        className={styles.input}
        value={clientType}
        onChange={(event) => setClientType(event.target.value as 'corporate' | 'smsf')}
      >
        <option value="corporate">Corporate</option>
        <option value="smsf">SMSF</option>
      </select>
      <p className={styles.hint}>
        This decides which library sections and `/prepare` templates the account can see, and it
        is not a display preference — an SMSF account never sees a corporate template.
      </p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <button type="submit" className={styles.primaryButton} disabled={pending}>
        {pending ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}

function AccountCard({ account }: { account: AccountRow }) {
  const [inviting, setInviting] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <h3 className={styles.cardTitle}>{account.displayName}</h3>
          <p className={styles.cardDetail}>
            {account.clientType === 'smsf' ? 'SMSF' : 'Corporate'}
            {account.renewsAt ? ` · renews ${account.renewsAt}` : ''}
          </p>
        </div>

        <label className={styles.visuallyHidden} htmlFor={`status-${account.id}`}>
          Subscription status for {account.displayName}
        </label>
        <select
          id={`status-${account.id}`}
          className={styles.statusSelect}
          value={account.subscriptionStatus}
          onChange={(event) =>
            startTransition(async () => {
              await setSubscriptionStatus(
                account.id,
                event.target.value as (typeof SUBSCRIPTION_STATUSES)[number],
              );
            })
          }
        >
          {SUBSCRIPTION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <Operations operations={account.operations} />
      <Seats seats={account.seats} />
      <Invites invites={account.invites} />

      {inviting ? (
        <InviteForm accountId={account.id} onDone={() => setInviting(false)} />
      ) : (
        <button
          type="button"
          className={styles.ghostButton}
          onClick={() => setInviting(true)}
        >
          <UserPlus size={16} strokeWidth={1.5} />
          Invite someone
        </button>
      )}
    </li>
  );
}

/**
 * The operational line: who cannot get in, and whether anyone is here.
 *
 * Blocked seats read as a warning rather than a statistic, because that is what
 * they are. Publishing a Service Statement version is one click and it puts
 * every subscriber back at the gate — nothing else in the app tells you that
 * happened, and the people affected cannot resolve it from their side beyond
 * reading and accepting.
 */
function Operations({ operations }: { operations: AccountRow['operations'] }) {
  const { blocked, daysSinceLastSeen, activity } = operations;

  return (
    <div className={styles.operations}>
      {blocked.length > 0 && (
        <p className={styles.blocked} role="status">
          {blocked.length === 1
            ? `${blocked[0]} has not accepted the current Service Statement and cannot use Minute until they do.`
            : `${blocked.length} people have not accepted the current Service Statement and cannot use Minute until they do: ${blocked.join(', ')}.`}
        </p>
      )}

      <span className={`${styles.activity} ${styles[activity]}`}>
        {activity === 'never'
          ? 'Never opened'
          : `Last opened ${daysSinceLastSeen === 0 ? 'today' : `${daysSinceLastSeen} days ago`}`}
      </span>
    </div>
  );
}

function Seats({ seats }: { seats: AccountRow['seats'] }) {
  const [, startTransition] = useTransition();

  if (seats.length === 0) {
    return <p className={styles.subEmpty}>No seats yet.</p>;
  }

  return (
    <table className={styles.table}>
      <caption className={styles.caption}>Seats</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Email</th>
          <th scope="col">Role</th>
          <th scope="col">Last seen</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {seats.map((seat) => (
          <tr key={seat.id}>
            <td>{seat.fullName}</td>
            <td className={styles.mono}>{seat.email}</td>
            <td>{seat.role}</td>
            <td>{seat.lastSeenAt ? seat.lastSeenAt.slice(0, 10) : 'never'}</td>
            <td>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() =>
                  startTransition(async () => {
                    await setClientSeatStatus(
                      seat.id,
                      seat.status === 'active' ? 'disabled' : 'active',
                    );
                  })
                }
              >
                {seat.status === 'active' ? 'Disable' : 'Enable'}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Invites({ invites }: { invites: AccountRow['invites'] }) {
  const [, startTransition] = useTransition();

  if (invites.length === 0) return null;

  return (
    <table className={styles.table}>
      <caption className={styles.caption}>Invitations not taken up</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Email</th>
          <th scope="col">State</th>
          {/* Named for a screen reader, not for the eye: an unlabelled column
              header reads as a gap in the table structure. */}
          <th scope="col">
            <span className={styles.visuallyHidden}>Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {invites.map((invite) => (
          <tr key={invite.id}>
            <td>{invite.fullName}</td>
            <td className={styles.mono}>{invite.email}</td>
            <td>
              {invite.state === 'open'
                ? `open until ${invite.expiresAt.slice(0, 10)}`
                : invite.state}
            </td>
            <td>
              {invite.state === 'open' && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() =>
                    startTransition(async () => {
                      await revokeClientInvite(invite.id);
                    })
                  }
                >
                  Revoke
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InviteForm({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'primary' | 'member'>('member');
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await issueClientInvite({ accountId, email, fullName, role });
      if (result.error) setError(result.error);
      else setLink(result.url ?? null);
    });
  }

  // Shown once and never again. Only the hash is stored, so there is nothing to
  // recover it from — the form says so rather than letting someone close the
  // panel and go looking for a resend button that cannot exist.
  if (link) {
    return (
      <div className={styles.form}>
        <p className={styles.label}>Invitation link</p>
        <p className={styles.hint}>
          Copy this now. It is shown once — only its hash is stored, so it cannot be shown again,
          and re-sending means issuing a new invitation.
        </p>
        <div className={styles.linkRow}>
          <code className={styles.linkBox}>{link}</code>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => {
              void navigator.clipboard?.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? <Check size={16} strokeWidth={1.5} /> : <Copy size={16} strokeWidth={1.5} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <button type="button" className={styles.primaryButton} onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.label} htmlFor={`invite-name-${accountId}`}>
        Full name
      </label>
      <input
        id={`invite-name-${accountId}`}
        className={styles.input}
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
      />

      <label className={styles.label} htmlFor={`invite-email-${accountId}`}>
        Email
      </label>
      <input
        id={`invite-email-${accountId}`}
        className={styles.input}
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <p className={styles.hint}>
        Redemption matches this against the address they sign in with, so a typo produces an
        invitation nobody can accept rather than one the wrong person can.
      </p>

      <label className={styles.label} htmlFor={`invite-role-${accountId}`}>
        Role
      </label>
      <select
        id={`invite-role-${accountId}`}
        className={styles.input}
        value={role}
        onChange={(event) => setRole(event.target.value as 'primary' | 'member')}
      >
        <option value="member">Member</option>
        <option value="primary">Primary</option>
      </select>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryButton} disabled={pending}>
          {pending ? 'Issuing…' : 'Issue invitation'}
        </button>
        <button type="button" className={styles.ghostButton} onClick={onDone} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
