'use client';

import { useActionState } from 'react';
import { createInteraction } from '@/app/actions/interactions';
import { useToast } from '@/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
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

      <div className={styles.field}>
        <label className={styles.label}>Type</label>
        <select name="type" required className={styles.select}>
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="meeting">Meeting</option>
          <option value="signal">Signal</option>
          <option value="note">Note</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Direction</label>
        <select name="direction" className={styles.select}>
          <option value="">N/A</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
          <option value="internal">Internal</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Date and time</label>
        <input
          name="occurred_at"
          type="datetime-local"
          defaultValue={new Date().toISOString().slice(0, 16)}
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Summary</label>
        <textarea name="summary" rows={3} className={styles.textarea} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Raw content / notes</label>
        <textarea name="transcript" rows={4} className={styles.textarea} />
      </div>

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
