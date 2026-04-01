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

    const result = await addFastmailAccount({
      username:     (data.get('username') as string) ?? '',
      token:        (data.get('token') as string) ?? '',
      display_name: (data.get('display_name') as string) || undefined,
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
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="display_name" className={styles.label}>Display name (optional)</label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          className={styles.input}
          placeholder="e.g. Simon"
          autoComplete="off"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="username" className={styles.label}>Fastmail username</label>
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
        <label htmlFor="token" className={styles.label}>App-specific password</label>
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

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.footer}>
        <Button type="submit" variant="primary" loading={loading}>
          Add account
        </Button>
      </div>
    </form>
  );
}
