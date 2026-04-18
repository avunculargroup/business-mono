'use client';

import { useActionState, useEffect } from 'react';
import { createLexiconEntry, updateLexiconEntry } from '@/app/actions/lexicon';
import { useToast } from '@/providers/ToastProvider';
import type { LexiconRow } from './LexiconList';
import styles from './DiscoveryForm.module.css';

interface LexiconFormProps {
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: LexiconRow;
}

export function LexiconForm({ onSuccess, onPendingChange, mode = 'create', defaultValues }: LexiconFormProps) {
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    if (mode === 'edit' && defaultValues) {
      const result = await updateLexiconEntry(defaultValues.id, formData);
      if (result.error) { error(result.error); return { error: result.error }; }
      success('Entry updated');
      onSuccess();
      return null;
    }
    const result = await createLexiconEntry(formData);
    if (result.error) { error(result.error); return { error: result.error }; }
    success('Entry created');
    onSuccess();
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);
  const formId = mode === 'edit' ? 'lexicon-edit-form' : 'lexicon-form';

  useEffect(() => { onPendingChange?.(isPending); }, [isPending, onPendingChange]);

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Internal term <span className={styles.required}>*</span></label>
        <input
          type="text"
          name="term"
          required
          defaultValue={defaultValues?.term ?? ''}
          className={styles.input}
          placeholder="e.g. Moon"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Professional equivalent <span className={styles.required}>*</span></label>
        <input
          type="text"
          name="professional_term"
          required
          defaultValue={defaultValues?.professional_term ?? ''}
          className={styles.input}
          placeholder="e.g. Programmable scarcity"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Category</label>
        <input
          type="text"
          name="category"
          defaultValue={defaultValues?.category ?? ''}
          className={styles.input}
          placeholder="e.g. Finance, Operations, Communications"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Definition</label>
        <textarea
          name="definition"
          rows={3}
          defaultValue={defaultValues?.definition ?? ''}
          className={styles.textarea}
          placeholder="A concise definition of the term…"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Example usage</label>
        <textarea
          name="example_usage"
          rows={3}
          defaultValue={defaultValues?.example_usage ?? ''}
          className={styles.textarea}
          placeholder="An example sentence demonstrating correct usage…"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Status</label>
        <select name="status" defaultValue={defaultValues?.status ?? 'draft'} className={styles.select}>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="deprecated">Deprecated</option>
        </select>
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
