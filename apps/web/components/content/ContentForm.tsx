'use client';

import { useActionState, useEffect } from 'react';
import { createContent } from '@/app/actions/content';
import { useToast } from '@/providers/ToastProvider';
import { useCurrentUser } from '@/providers/UserProvider';
import styles from '@/components/crm/ContactForm.module.css';

interface ContentFormProps {
  teamMembers: { id: string; full_name: string }[];
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
}

export function ContentForm({ teamMembers, onSuccess, onPendingChange }: ContentFormProps) {
  const user = useCurrentUser();
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = await createContent(formData);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success('Content item created');
    onSuccess();
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  return (
    <form id="content-form" action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Title *</label>
        <input name="title" required className={styles.input} />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Type *</label>
          <select name="type" defaultValue="idea" className={styles.select}>
            <option value="idea">Idea</option>
            <option value="linkedin">LinkedIn</option>
            <option value="twitter_x">Twitter / X</option>
            <option value="newsletter">Newsletter</option>
            <option value="blog">Blog</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Author</label>
          <select name="created_by" defaultValue={user.id} className={styles.select}>
            <option value="">None</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Body</label>
        <textarea name="body" rows={5} className={styles.textarea} />
      </div>

      <input type="hidden" name="status" value="idea" />

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
