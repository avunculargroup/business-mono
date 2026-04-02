'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { addFastmailAccount } from '@/app/actions/fastmail';
import styles from './FastmailAccountForm.module.css';

interface FastmailAccountFormProps {
  onSuccess: () => void;
}

export function FastmailAccountForm({ onSuccess }: FastmailAccountFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const data = new FormData(form);

    const watchedRaw = (data.get('watched_addresses') as string) ?? '';
    const watchedAddresses = watchedRaw
      .split(/[\n,]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const result = await addFastmailAccount({
      username:          (data.get('username') as string) ?? '',
      token:             (data.get('token') as string) ?? '',
      display_name:      (data.get('display_name') as string) || undefined,
      watched_addresses: watchedAddresses.length > 0 ? watchedAddresses : undefined,
    });

    setLoading(false);

    if (result?.error) {
      setError(result.error);
    } else {
      form.reset();
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form} aria-describedby={error ? 'account-form-error' : undefined} noValidate>
      <div className={styles.field}>
        <label htmlFor="display_name" className={styles.label}>
          Display name <span className={styles.optional}>(optional)</span>
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          className={styles.input}
          placeholder="e.g. Simon"
          autoComplete="off"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="username" className={styles.label}>
          Fastmail username <span className={styles.required} aria-hidden="true">*</span>
        </label>
        <input
          id="username"
          name="username"
          type="email"
          className={styles.input}
          placeholder="you@fastmail.com"
          required
          autoComplete="off"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="token" className={styles.label}>
          App-specific password <span className={styles.required} aria-hidden="true">*</span>
        </label>
        <input
          id="token"
          name="token"
          type="password"
          className={styles.input}
          placeholder="xxxx-xxxx-xxxx-xxxx"
          required
          autoComplete="new-password"
        />
        <p className={styles.hint}>
          Generate at Fastmail → Settings → Password &amp; Security → App Passwords.
          Grant <strong>read-only</strong> mail access.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="watched_addresses" className={styles.label}>
          Watched addresses <span className={styles.optional}>(optional)</span>
        </label>
        <textarea
          id="watched_addresses"
          name="watched_addresses"
          className={styles.textarea}
          rows={3}
          placeholder={"chris@business.com\nchris@alias.com"}
          autoComplete="off"
        />
        <p className={styles.hint}>
          Leave empty to log all addresses on this account. Add specific addresses
          (one per line or comma-separated) to only log emails where one of them
          appears as a sender or recipient — useful when a single account has multiple aliases.
        </p>
      </div>

      {error && (
        <p id="account-form-error" className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.footer}>
        <Button type="submit" variant="primary" loading={loading}>
          Add account
        </Button>
      </div>
    </form>
  );
}
