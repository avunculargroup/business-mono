'use client';

import { useActionState } from 'react';
import { createInteraction } from '@/app/actions/interactions';
import { useToast } from '@platform/ui/ToastProvider';
import { Button } from '@platform/ui/Button';
import styles from './ContactForm.module.css';

interface InteractionFormProps {
  contactId: string;
  onSuccess: () => void;
}

export function InteractionForm({ contactId, onSuccess }: InteractionFormProps) {
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = await createInteraction(formData);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success('Interaction logged');
    onSuccess();
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="contact_id" value={contactId} />

      <label className={styles.field}>
        <span className={styles.label}>Type</span>
        <select name="type" required className={styles.select}>
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="meeting">Meeting</option>
          <option value="signal">Signal</option>
          <option value="note">Note</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Direction</span>
        <select name="direction" className={styles.select}>
          <option value="">N/A</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
          <option value="internal">Internal</option>
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Date and time</span>
        <input
          name="occurred_at"
          type="datetime-local"
          defaultValue={new Date().toISOString().slice(0, 16)}
          className={styles.input}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Summary</span>
        <textarea name="summary" rows={3} className={styles.textarea} />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Raw content / notes</span>
        <textarea name="transcript" rows={4} className={styles.textarea} />
      </label>

      <input type="hidden" name="source" value="manual" />

      {state?.error && <p className={styles.error}>{state.error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
        <Button variant="primary" type="submit" loading={isPending}>
          Log interaction
        </Button>
      </div>
    </form>
  );
}
