'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/StatusChip';
import { disconnectSocialCredential } from '@/app/actions/socialCredentials';
import styles from './linkedin.module.css';

export interface LinkedInAccountRow {
  id: string;
  display_name: string;
  handle: string | null;
  account_type: string;
  is_active: boolean;
  credential: {
    social_account_id: string;
    author_urn: string;
    expires_at: string;
    last_error: string | null;
    last_error_at: string | null;
    consecutive_failures: number;
    updated_at: string;
  } | null;
}

const EXPIRY_WARNING_DAYS = 14;

const CALLBACK_ERRORS: Record<string, string> = {
  missing_account: 'No account was specified for the connection.',
  unknown_account: 'That account is not a LinkedIn account.',
  not_configured: 'LinkedIn app credentials are not configured on the server.',
  state_failed: 'Could not start the connection. Try again.',
  invalid_state: 'The connection attempt expired or was invalid. Try again.',
  missing_code: 'LinkedIn did not return an authorisation code.',
  exchange_failed: 'LinkedIn rejected the connection. Try again.',
  store_failed: 'The connection succeeded but could not be saved. Try again.',
  user_cancelled_authorize: 'The connection was cancelled on LinkedIn.',
  user_cancelled_login: 'The connection was cancelled on LinkedIn.',
};

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function connectionState(account: LinkedInAccountRow): {
  label: string;
  color: 'neutral' | 'success' | 'warning' | 'destructive';
  needsAttention: boolean;
} {
  const credential = account.credential;
  if (!credential) return { label: 'not connected', color: 'neutral', needsAttention: false };
  if (credential.consecutive_failures >= 3) {
    return { label: 'failing', color: 'destructive', needsAttention: true };
  }
  const days = daysUntil(credential.expires_at);
  if (days <= 0) return { label: 'expired', color: 'destructive', needsAttention: true };
  if (days <= EXPIRY_WARNING_DAYS) {
    return { label: `expires in ${days} day${days === 1 ? '' : 's'}`, color: 'warning', needsAttention: true };
  }
  return { label: 'connected', color: 'success', needsAttention: false };
}

export function LinkedInSettingsClient({ accounts }: { accounts: LinkedInAccountRow[] }) {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const connected = searchParams.get('connected') === '1';
  const callbackError = searchParams.get('error');

  async function handleDisconnect(account: LinkedInAccountRow) {
    if (!window.confirm(`Disconnect ${account.display_name}? Scheduled posts for this account will hold until reconnected.`)) {
      return;
    }
    setBusyId(account.id);
    const result = await disconnectSocialCredential(account.id);
    setBusyId(null);
    if (result.error) setError(result.error);
  }

  return (
    <div className={styles.container}>
      {connected && <div className={styles.notice}>LinkedIn account connected.</div>}
      {callbackError && (
        <div className={styles.errorNotice}>
          {CALLBACK_ERRORS[callbackError] ?? 'The connection failed. Try again.'}
        </div>
      )}
      {error && <div className={styles.errorNotice}>{error}</div>}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Accounts</h2>
            <p className={styles.sectionDesc}>
              Connect each profile with its own LinkedIn login. Tokens last 60 days — reconnect
              from here when one nears expiry. Scheduled posts publish within a minute of their
              scheduled time.
            </p>
          </div>
        </div>

        <div className={styles.accountList}>
          {accounts.map((account) => {
            const state = connectionState(account);
            return (
              <Card key={account.id} padding="md">
                <div className={styles.accountRow}>
                  <div className={styles.accountInfo}>
                    <div className={styles.accountName}>
                      {account.display_name}
                      <span className={styles.accountType}>
                        {account.account_type === 'company' ? 'Company page' : 'Founder'}
                      </span>
                    </div>
                    {account.handle && <div className={styles.accountHandle}>{account.handle}</div>}
                    {account.credential?.last_error && state.needsAttention && (
                      <div className={styles.accountError}>{account.credential.last_error}</div>
                    )}
                  </div>
                  <div className={styles.accountActions}>
                    <StatusChip label={state.label} color={state.color} />
                    <Button
                      variant={account.credential ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() =>
                        window.location.assign(`/api/integrations/linkedin/start?accountId=${account.id}`)
                      }
                    >
                      {account.credential ? 'Reconnect' : 'Connect'}
                    </Button>
                    {account.credential && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busyId === account.id}
                        onClick={() => void handleDisconnect(account)}
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          {accounts.length === 0 && (
            <p className={styles.empty}>
              No LinkedIn accounts found. Add rows to social_accounts (platform &lsquo;linkedin&rsquo;)
              for each profile to connect.
            </p>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Company page</h2>
            <p className={styles.sectionDesc}>
              Posting as the company page needs LinkedIn&rsquo;s Community Management API approval
              on the developer app. Until approved, connect and post from the founder profiles.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
