'use client';

import { useActionState, useEffect } from 'react';
import { createContent } from '@/app/actions/content';
import { useToast } from '@platform/ui/ToastProvider';
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
      <label className={styles.field}>
        <span className={styles.label}>Title *</span>
        <input name="title" required className={styles.input} />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Type *</span>
          <select name="type" defaultValue="idea" className={styles.select}>
            <option value="idea">Idea</option>
            <option value="linkedin">LinkedIn</option>
            <option value="twitter_x">Twitter / X</option>
            <option value="newsletter">Newsletter</option>
            <option value="blog">Blog</option>
            <option value="email">Email</option>
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Author</span>
          <select name="created_by" defaultValue={user.id} className={styles.select}>
            <option value="">None</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Body</span>
        <textarea name="body" rows={5} className={styles.textarea} />
      </label>

      <input type="hidden" name="status" value="idea" />

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
