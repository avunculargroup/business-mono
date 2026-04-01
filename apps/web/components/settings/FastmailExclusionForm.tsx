'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { addFastmailExclusion } from '@/app/actions/fastmail';
import styles from './FastmailAccountForm.module.css';

interface FastmailExclusionFormProps {
  onSuccess: () => void;
}

export function FastmailExclusionForm({ onSuccess }: FastmailExclusionFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const data = new FormData(form);
    const type = data.get('type') as 'domain' | 'email';

    const result = await addFastmailExclusion({
      type,
      value: (data.get('value') as string) ?? '',
      notes: (data.get('notes') as string) || undefined,
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
        <label htmlFor="exc-type" className={styles.label}>Type</label>
        <select id="exc-type" name="type" className={styles.input} required defaultValue="domain">
          <option value="domain">Domain (e.g. stripe.com)</option>
          <option value="email">Email address (e.g. noreply@example.com)</option>
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="exc-value" className={styles.label}>Value</label>
        <input
          id="exc-value"
          name="value"
          type="text"
          className={styles.input}
          placeholder="stripe.com"
          required
          autoComplete="off"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="exc-notes" className={styles.label}>Notes (optional)</label>
        <textarea
          id="exc-notes"
          name="notes"
          className={styles.input}
          placeholder="Why this address is excluded"
          rows={2}
          style={{ resize: 'vertical' }}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.footer}>
        <Button type="submit" variant="primary" loading={loading}>
          Add exclusion
        </Button>
      </div>
    </form>
  );
}
