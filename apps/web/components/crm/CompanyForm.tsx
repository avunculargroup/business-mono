'use client';

import { useActionState } from 'react';
import { createCompany } from '@/app/actions/companies';
import { useToast } from '@/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import styles from './ContactForm.module.css';

interface CompanyFormProps {
  onSuccess: () => void;
}

export function CompanyForm({ onSuccess }: CompanyFormProps) {
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = await createCompany(formData);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success('Company created');
    onSuccess();
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Name *</label>
        <input name="name" required className={styles.input} />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Industry</label>
          <input name="industry" className={styles.input} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Size</label>
          <select name="size" className={styles.select}>
            <option value="">Select</option>
            <option value="SME">SME</option>
            <option value="Mid-market">Mid-market</option>
            <option value="Enterprise">Enterprise</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Website</label>
        <input name="website" type="url" placeholder="https://" className={styles.input} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>LinkedIn URL</label>
        <input name="linkedin_url" type="url" placeholder="https://linkedin.com/company/..." className={styles.input} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Notes</label>
        <textarea name="notes" rows={3} className={styles.textarea} />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
        <Button variant="primary" type="submit" loading={isPending}>
          Save company
        </Button>
      </div>
    </form>
  );
}
