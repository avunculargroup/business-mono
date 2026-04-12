'use client';

import { useActionState } from 'react';
import { createCompany, updateCompany } from '@/app/actions/companies';
import { useToast } from '@/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import styles from './ContactForm.module.css';

type CompanyRow = {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  website: string | null;
  created_at: string;
  // Optional fields for edit pre-population
  linkedin_url?: string | null;
  notes?: string | null;
};

interface CompanyFormProps {
  onSuccess: (company?: CompanyRow) => void;
  mode?: 'create' | 'edit';
  defaultValues?: CompanyRow;
}

export function CompanyForm({ onSuccess, mode = 'create', defaultValues }: CompanyFormProps) {
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    if (mode === 'edit' && defaultValues) {
      const result = await updateCompany(defaultValues.id, formData);
      if (result.error) {
        error(result.error);
        return { error: result.error };
      }
      success('Company updated');
      onSuccess();
      return null;
    }

    const result = await createCompany(formData);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success('Company created');
    onSuccess(result.company as CompanyRow);
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);
  const formId = mode === 'edit' ? 'company-edit-form' : 'company-form';

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Name *</label>
        <input name="name" required defaultValue={defaultValues?.name ?? ''} className={styles.input} />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Industry</label>
          <input name="industry" defaultValue={defaultValues?.industry ?? ''} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Size</label>
          <select name="size" defaultValue={defaultValues?.size ?? ''} className={styles.select}>
            <option value="">Select</option>
            <option value="SME">SME</option>
            <option value="Mid-market">Mid-market</option>
            <option value="Enterprise">Enterprise</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Website</label>
        <input name="website" type="url" placeholder="https://" defaultValue={defaultValues?.website ?? ''} className={styles.input} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>LinkedIn URL</label>
        <input name="linkedin_url" type="url" placeholder="https://linkedin.com/company/..." defaultValue={defaultValues?.linkedin_url ?? ''} className={styles.input} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Notes</label>
        <textarea name="notes" rows={3} defaultValue={defaultValues?.notes ?? ''} className={styles.textarea} />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}

      {mode !== 'edit' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Button variant="primary" type="submit" loading={isPending}>
            Save company
          </Button>
        </div>
      )}
    </form>
  );
}
