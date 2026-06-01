'use client';

import { useActionState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { runNewsletter } from '@/app/actions/newsletter';
import { useToast } from '@/providers/ToastProvider';
import styles from '@/components/crm/ContactForm.module.css';

interface RunNewsletterModalProps {
  open: boolean;
  onClose: () => void;
}

export function RunNewsletterModal({ open, onClose }: RunNewsletterModalProps) {
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = await runNewsletter(formData);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success('Newsletter queued — the story shortlist will appear here for review shortly.');
    onClose();
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Run newsletter"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="newsletter-form" loading={isPending}>
            Run newsletter
          </Button>
        </>
      }
    >
      <form id="newsletter-form" action={formAction} className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>Time range</label>
          <select name="timeRange" defaultValue="month" className={styles.select}>
            <option value="week">Past week</option>
            <option value="fortnight">Past fortnight</option>
            <option value="month">Past month</option>
          </select>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Stories</label>
            <select name="storyCount" defaultValue="5" className={styles.select}>
              {[3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Words per story</label>
            <select name="targetWordCount" defaultValue="250" className={styles.select}>
              {[150, 200, 250, 300, 400].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Audience (optional)</label>
          <input
            name="audienceContext"
            className={styles.input}
            placeholder="Leave blank for the default CFO audience"
          />
        </div>

        <p className={styles.label}>
          You&apos;ll review the story shortlist and the full draft here before anything is saved.
        </p>

        {state?.error && <p className={styles.error}>{state.error}</p>}
      </form>
    </Modal>
  );
}
