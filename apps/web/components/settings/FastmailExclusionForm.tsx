'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { addFastmailExclusion } from '@/app/actions/fastmail';
import styles from './FastmailAccountForm.module.css';

interface FastmailExclusionFormProps {
  onSuccess: () => void;
}

const TYPE_CONFIG = {
  domain: {
    placeholder: 'stripe.com',
    hint: 'All emails where any participant has this domain will be skipped.',
  },
  email: {
    placeholder: 'noreply@example.com',
    hint: 'Only this exact address will be excluded.',
  },
} as const;

export function FastmailExclusionForm({ onSuccess }: FastmailExclusionFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<'domain' | 'email'>('domain');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const data = new FormData(form);

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
      setType('domain');
      onSuccess();
    }
  }

  const config = TYPE_CONFIG[type];

  return (
    <form onSubmit={handleSubmit} className={styles.form} aria-describedby={error ? 'exclusion-form-error' : undefined} noValidate>
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="exc-type" className={styles.label}>
            Type <span className={styles.required} aria-hidden="true">*</span>
          </label>
          <select
            id="exc-type"
            name="type"
            className={styles.select}
            value={type}
            onChange={(e) => setType(e.target.value as 'domain' | 'email')}
            required
          >
            <option value="domain">Domain</option>
            <option value="email">Email address</option>
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="exc-value" className={styles.label}>
            Value <span className={styles.required} aria-hidden="true">*</span>
          </label>
          <input
            id="exc-value"
            name="value"
            type="text"
            className={styles.input}
            placeholder={config.placeholder}
            required
            autoComplete="off"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </div>
      </div>

      <p className={styles.hint}>{config.hint}</p>

      <div className={styles.field}>
        <label htmlFor="exc-notes" className={styles.label}>
          Notes <span className={styles.optional}>(optional)</span>
        </label>
        <textarea
          id="exc-notes"
          name="notes"
          className={styles.textarea}
          placeholder="Why this address is excluded"
          rows={2}
        />
      </div>

      {error && (
        <p id="exclusion-form-error" className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.footer}>
        <Button type="submit" variant="primary" loading={loading}>
          Add exclusion
        </Button>
      </div>
    </form>
  );
}
